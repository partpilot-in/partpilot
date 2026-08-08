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
            "job": profile.job,
            "company": profile.company,
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
               (user_id, email, first_name, last_name, job, company, linkedin)
               values ($1,$2,$3,$4,$5,$6,$7)
               on conflict (user_id) do update set
                   email=excluded.email,
                   first_name=excluded.first_name,
                   last_name=excluded.last_name,
                   job=excluded.job,
                   company=excluded.company,
                   linkedin=excluded.linkedin,
                   updated_at=now()
               returning email, first_name, last_name, job, company, linkedin"#,
        )
        .bind(user_id)
        .bind(&profile.email)
        .bind(&profile.first_name)
        .bind(&profile.last_name)
        .bind(&profile.job)
        .bind(&profile.company)
        .bind(&profile.linkedin)
        .fetch_one(db)
        .await?
    } else {
        state
            .memory
            .write()
            .await
            .profiles
            .insert(user_id, profile.clone());
        profile
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
            r#"select email, first_name, last_name, job, company, linkedin
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
               returning email, first_name, last_name, job, company, linkedin"#,
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
        job: input.job.trim().to_owned(),
        company: input.company.trim().to_owned(),
        linkedin: input.linkedin.trim().to_owned(),
    };
    if !valid_email(&profile.email) {
        return Err(AppError::bad_request("enter a valid email address"));
    }
    for (label, value, limit) in [
        ("first_name", profile.first_name.as_str(), 100),
        ("last_name", profile.last_name.as_str(), 100),
        ("job", profile.job.as_str(), 160),
        ("company", profile.company.as_str(), 160),
        ("linkedin", profile.linkedin.as_str(), 500),
    ] {
        if value.len() > limit {
            return Err(AppError::bad_request(format!(
                "{label} must be {limit} characters or fewer"
            )));
        }
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
            job: " Engineer ".into(),
            company: " PartPilot ".into(),
            linkedin: " https://www.linkedin.com/in/jane ".into(),
        })
        .expect("valid profile");
        assert_eq!(profile.email, "jane@example.com");
        assert_eq!(profile.first_name, "Jane");
    }

    #[test]
    fn profile_validation_rejects_invalid_email_and_linkedin() {
        let invalid_email = UpdateProfileInput {
            email: "not-an-email".into(),
            first_name: String::new(),
            last_name: String::new(),
            job: String::new(),
            company: String::new(),
            linkedin: String::new(),
        };
        assert!(validate_and_normalize(invalid_email).is_err());

        let invalid_linkedin = UpdateProfileInput {
            email: "jane@example.com".into(),
            linkedin: "linkedin.com/in/jane".into(),
            first_name: String::new(),
            last_name: String::new(),
            job: String::new(),
            company: String::new(),
        };
        assert!(validate_and_normalize(invalid_linkedin).is_err());
    }
}
