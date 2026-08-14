use axum::{
    Json,
    extract::{Extension, State},
    http::StatusCode,
};
use serde_json::{Value, json};

use crate::{
    auth::{AccessToken, UserEmail, UserId},
    error::AppError,
    models::{ProfileDto, ResetPasswordInput, UpdateProfileInput},
    state::AppState,
};

pub async fn profile(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Extension(UserEmail(auth_email)): Extension<UserEmail>,
) -> Result<Json<ProfileDto>, AppError> {
    Ok(Json(load_profile(&state, user_id, &auth_email).await?))
}

pub async fn update_profile(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Extension(UserEmail(auth_email)): Extension<UserEmail>,
    Extension(AccessToken(access_token)): Extension<AccessToken>,
    Json(input): Json<UpdateProfileInput>,
) -> Result<Json<ProfileDto>, AppError> {
    let profile = validate_and_normalize(input)?;
    let full_name = format!("{} {}", profile.first_name, profile.last_name)
        .trim()
        .to_owned();
    let mut auth_update = json!({
        "data": {
            "first_name": profile.first_name,
            "last_name": profile.last_name,
            "full_name": full_name,
            "phone": profile.phone,
            "job": profile.job,
            "company": profile.company,
            "github": profile.github,
            "linkedin": profile.linkedin
        }
    });
    if !profile.email.eq_ignore_ascii_case(auth_email.trim()) {
        auth_update["email"] = Value::String(profile.email.clone());
    }
    state.auth.update_user(&access_token, &auth_update).await?;

    let saved = if let Some(db) = &state.db {
        sqlx::query_as::<_, ProfileDto>(
            r#"insert into user_profiles
               (user_id, email, first_name, last_name, phone, job, company, github, linkedin)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               on conflict (user_id) do update set
                   email=excluded.email,
                   first_name=excluded.first_name,
                   last_name=excluded.last_name,
                   phone=excluded.phone,
                   job=excluded.job,
                   company=excluded.company,
                   github=excluded.github,
                   linkedin=excluded.linkedin,
                   updated_at=now()
               returning email, first_name, last_name, phone, job, company,
                         organization_slug, github, linkedin, billing_plan"#,
        )
        .bind(user_id)
        .bind(&profile.email)
        .bind(&profile.first_name)
        .bind(&profile.last_name)
        .bind(&profile.phone)
        .bind(&profile.job)
        .bind(&profile.company)
        .bind(&profile.github)
        .bind(&profile.linkedin)
        .fetch_one(db)
        .await?
    } else {
        let mut store = state.memory.write().await;
        let mut saved = profile;
        if let Some(current) = store.profiles.get(&user_id) {
            saved
                .organization_slug
                .clone_from(&current.organization_slug);
            saved.billing_plan.clone_from(&current.billing_plan);
        }
        store.profiles.insert(user_id, saved.clone());
        saved
    };

    Ok(Json(saved))
}

pub async fn reset_password(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Extension(UserEmail(auth_email)): Extension<UserEmail>,
    Json(input): Json<ResetPasswordInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let redirect_to = input.redirect_to.as_deref().map(str::trim);
    if redirect_to.is_some_and(|url| {
        url.len() > 500 || !(url.starts_with("https://") || url.starts_with("http://localhost"))
    }) {
        return Err(AppError::bad_request(
            "redirect_to must be an HTTPS URL or localhost URL",
        ));
    }
    let email = if auth_email.trim().is_empty() {
        load_profile(&state, user_id, "").await?.email
    } else {
        auth_email
    };
    if email.trim().is_empty() {
        return Err(AppError::bad_request("the account has no email address"));
    }
    state
        .auth
        .request_password_reset(&email, redirect_to)
        .await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "message": "Password reset email requested" })),
    ))
}

async fn load_profile(
    state: &AppState,
    user_id: uuid::Uuid,
    auth_email: &str,
) -> Result<ProfileDto, AppError> {
    if let Some(db) = &state.db {
        if let Some(profile) = sqlx::query_as::<_, ProfileDto>(
            r#"select email, first_name, last_name, phone, job, company,
                      organization_slug, github, linkedin, billing_plan
               from user_profiles where user_id = $1"#,
        )
        .bind(user_id)
        .fetch_optional(db)
        .await?
        {
            return Ok(profile);
        }

        return sqlx::query_as::<_, ProfileDto>(
            r#"insert into user_profiles (user_id, email)
               values ($1, $2)
               returning email, first_name, last_name, phone, job, company,
                         organization_slug, github, linkedin, billing_plan"#,
        )
        .bind(user_id)
        .bind(auth_email.trim())
        .fetch_one(db)
        .await
        .map_err(Into::into);
    }

    Ok(state
        .memory
        .read()
        .await
        .profiles
        .get(&user_id)
        .cloned()
        .unwrap_or_else(|| ProfileDto::empty(auth_email.trim())))
}

fn validate_and_normalize(input: UpdateProfileInput) -> Result<ProfileDto, AppError> {
    let profile = ProfileDto {
        email: input.email.trim().to_owned(),
        first_name: input.first_name.trim().to_owned(),
        last_name: input.last_name.trim().to_owned(),
        phone: input.phone.trim().to_owned(),
        job: input.job.trim().to_owned(),
        company: input.company.trim().to_owned(),
        organization_slug: "personal".into(),
        github: input.github.trim().to_owned(),
        linkedin: input.linkedin.trim().to_owned(),
        billing_plan: "hobby".into(),
    };
    if !valid_email(&profile.email) {
        return Err(AppError::bad_request("enter a valid email address"));
    }
    for (label, value, limit) in [
        ("first_name", profile.first_name.as_str(), 100),
        ("last_name", profile.last_name.as_str(), 100),
        ("phone", profile.phone.as_str(), 40),
        ("job", profile.job.as_str(), 160),
        ("company", profile.company.as_str(), 160),
        ("github", profile.github.as_str(), 500),
        ("linkedin", profile.linkedin.as_str(), 500),
    ] {
        if value.len() > limit {
            return Err(AppError::bad_request(format!(
                "{label} must be {limit} characters or fewer"
            )));
        }
    }
    if !profile.github.is_empty()
        && !(profile.github.starts_with("https://") || profile.github.starts_with("http://"))
    {
        return Err(AppError::bad_request(
            "GitHub must be a complete http(s) URL",
        ));
    }
    if !profile.linkedin.is_empty()
        && !(profile.linkedin.starts_with("https://") || profile.linkedin.starts_with("http://"))
    {
        return Err(AppError::bad_request(
            "LinkedIn must be a complete http(s) URL",
        ));
    }
    Ok(profile)
}

fn valid_email(email: &str) -> bool {
    let Some((local, domain)) = email.rsplit_once('@') else {
        return false;
    };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

#[cfg(test)]
mod tests {
    use super::{UpdateProfileInput, validate_and_normalize};

    #[test]
    fn profile_validation_trims_fields() {
        let profile = validate_and_normalize(UpdateProfileInput {
            email: " jane@example.com ".into(),
            first_name: " Jane ".into(),
            last_name: " Doe ".into(),
            phone: " +1 202 555 0142 ".into(),
            job: " Engineer ".into(),
            company: " PartPilot ".into(),
            github: " https://github.com/jane ".into(),
            linkedin: " https://www.linkedin.com/in/jane ".into(),
        })
        .expect("valid profile");
        assert_eq!(profile.email, "jane@example.com");
        assert_eq!(profile.first_name, "Jane");
        assert_eq!(profile.phone, "+1 202 555 0142");
        assert_eq!(profile.github, "https://github.com/jane");
    }

    #[test]
    fn profile_validation_rejects_invalid_email_and_profile_urls() {
        let invalid_email = UpdateProfileInput {
            email: "not-an-email".into(),
            first_name: String::new(),
            last_name: String::new(),
            phone: String::new(),
            job: String::new(),
            company: String::new(),
            github: String::new(),
            linkedin: String::new(),
        };
        assert!(validate_and_normalize(invalid_email).is_err());

        let invalid_linkedin = UpdateProfileInput {
            email: "jane@example.com".into(),
            linkedin: "linkedin.com/in/jane".into(),
            first_name: String::new(),
            last_name: String::new(),
            phone: String::new(),
            job: String::new(),
            company: String::new(),
            github: String::new(),
        };
        assert!(validate_and_normalize(invalid_linkedin).is_err());

        let invalid_github = UpdateProfileInput {
            email: "jane@example.com".into(),
            github: "github.com/jane".into(),
            first_name: String::new(),
            last_name: String::new(),
            phone: String::new(),
            job: String::new(),
            company: String::new(),
            linkedin: String::new(),
        };
        assert!(validate_and_normalize(invalid_github).is_err());
    }
}
