use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::{HeaderName, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

pub const API_KEY_HEADER: HeaderName = HeaderName::from_static("x-api-key");

#[derive(Debug, Clone, Copy)]
pub struct UserId(pub Uuid);

#[derive(Debug, Clone)]
pub struct UserEmail(pub String);

#[derive(Clone)]
pub struct AccessToken(pub String);

struct VerifiedUser {
    id: Uuid,
    email: String,
}

#[derive(Clone)]
pub enum AuthVerifier {
    Disabled(Uuid),
    Jwks {
        url: String,
        auth_user_url: String,
        auth_recover_url: String,
        publishable_key: String,
        client: reqwest::Client,
        cache: Arc<RwLock<Option<JwkSet>>>,
    },
}

impl AuthVerifier {
    pub const fn disabled(user_id: Uuid) -> Self {
        Self::Disabled(user_id)
    }

    pub fn supabase(jwks_url: String, supabase_url: String, publishable_key: String) -> Self {
        Self::Jwks {
            url: jwks_url,
            auth_user_url: format!("{}/auth/v1/user", supabase_url.trim_end_matches('/')),
            auth_recover_url: format!("{}/auth/v1/recover", supabase_url.trim_end_matches('/')),
            publishable_key,
            client: reqwest::Client::new(),
            cache: Arc::new(RwLock::new(None)),
        }
    }

    async fn verify(&self, token: &str) -> Result<VerifiedUser, AppError> {
        match self {
            Self::Disabled(user_id) => Ok(VerifiedUser {
                id: *user_id,
                email: "test@example.com".into(),
            }),
            Self::Jwks {
                url,
                auth_user_url,
                publishable_key,
                client,
                cache,
                ..
            } => {
                let header = decode_header(token)
                    .map_err(|_| AppError::unauthorized("invalid access token"))?;

                if is_asymmetric(header.alg)
                    && let Some(kid) = header.kid.as_deref()
                    && let Ok(user_id) =
                        verify_with_jwks(token, header.alg, kid, url, client, cache).await
                {
                    return Ok(user_id);
                }

                verify_with_auth_server(token, auth_user_url, publishable_key, client).await
            }
        }
    }

    pub async fn update_user(&self, token: &str, payload: &Value) -> Result<(), AppError> {
        let Self::Jwks {
            auth_user_url,
            publishable_key,
            client,
            ..
        } = self
        else {
            return Ok(());
        };

        let response = client
            .put(auth_user_url)
            .header("apikey", publishable_key)
            .bearer_auth(token)
            .json(payload)
            .send()
            .await
            .map_err(|_| AppError::internal("could not update Supabase account"))?;
        ensure_auth_success(response, "Supabase rejected the account update").await
    }

    pub async fn request_password_reset(
        &self,
        email: &str,
        redirect_to: Option<&str>,
    ) -> Result<(), AppError> {
        let Self::Jwks {
            auth_recover_url,
            publishable_key,
            client,
            ..
        } = self
        else {
            return Ok(());
        };

        let mut request = client
            .post(auth_recover_url)
            .header("apikey", publishable_key);
        if let Some(redirect_to) = redirect_to {
            request = request.query(&[("redirect_to", redirect_to)]);
        }
        let response = request
            .json(&json!({ "email": email }))
            .send()
            .await
            .map_err(|_| AppError::internal("could not request a password reset"))?;
        ensure_auth_success(response, "Supabase rejected the password reset request").await
    }
}

#[derive(Debug, Clone, Deserialize)]
struct Claims {
    sub: String,
    #[serde(default)]
    email: Option<String>,
    #[allow(dead_code)]
    exp: usize,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: Uuid,
    #[serde(default)]
    email: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct SupabaseAuthError {
    msg: Option<String>,
    message: Option<String>,
    error_description: Option<String>,
}

fn is_asymmetric(algorithm: Algorithm) -> bool {
    matches!(
        algorithm,
        Algorithm::RS256
            | Algorithm::RS384
            | Algorithm::RS512
            | Algorithm::ES256
            | Algorithm::ES384
            | Algorithm::EdDSA
    )
}

async fn verify_with_jwks(
    token: &str,
    algorithm: Algorithm,
    kid: &str,
    url: &str,
    client: &reqwest::Client,
    cache: &RwLock<Option<JwkSet>>,
) -> Result<VerifiedUser, AppError> {
    let mut keys = cache.read().await.clone();
    if keys.as_ref().and_then(|set| set.find(kid)).is_none() {
        let fetched = client
            .get(url)
            .send()
            .await
            .map_err(|_| AppError::unauthorized("could not validate access token"))?
            .error_for_status()
            .map_err(|_| AppError::unauthorized("could not validate access token"))?
            .json::<JwkSet>()
            .await
            .map_err(|_| AppError::unauthorized("invalid JWKS response"))?;
        *cache.write().await = Some(fetched.clone());
        keys = Some(fetched);
    }

    let jwk = keys
        .as_ref()
        .and_then(|set| set.find(kid))
        .ok_or_else(|| AppError::unauthorized("unknown access-token key"))?;
    let key = DecodingKey::from_jwk(jwk)
        .map_err(|_| AppError::unauthorized("unsupported access-token key"))?;
    let claims = decode::<Claims>(token, &key, &Validation::new(algorithm))
        .map_err(|_| AppError::unauthorized("invalid or expired access token"))?
        .claims;
    let id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::unauthorized("invalid access-token subject"))?;
    Ok(VerifiedUser {
        id,
        email: claims.email.unwrap_or_default(),
    })
}

async fn verify_with_auth_server(
    token: &str,
    auth_user_url: &str,
    publishable_key: &str,
    client: &reqwest::Client,
) -> Result<VerifiedUser, AppError> {
    let response = client
        .get(auth_user_url)
        .header("apikey", publishable_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| AppError::unauthorized("could not validate access token"))?;
    if !response.status().is_success() {
        return Err(AppError::unauthorized("invalid or expired access token"));
    }
    response
        .json::<SupabaseUser>()
        .await
        .map(|user| VerifiedUser {
            id: user.id,
            email: user.email.unwrap_or_default(),
        })
        .map_err(|_| AppError::unauthorized("invalid Supabase user response"))
}

async fn ensure_auth_success(
    response: reqwest::Response,
    fallback: &'static str,
) -> Result<(), AppError> {
    if response.status().is_success() {
        return Ok(());
    }
    let error = response
        .json::<SupabaseAuthError>()
        .await
        .unwrap_or_default();
    let message = error
        .msg
        .or(error.message)
        .or(error.error_description)
        .unwrap_or_else(|| fallback.to_owned());
    Err(AppError::bad_request(message))
}

pub async fn require_supabase_session(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default()
        .to_owned();

    let user = state.auth.verify(&token).await?;
    req.extensions_mut().insert(UserId(user.id));
    req.extensions_mut().insert(UserEmail(user.email));
    req.extensions_mut().insert(AccessToken(token));
    Ok(next.run(req).await)
}

pub async fn placeholder_api_key(req: Request, next: Next) -> Response {
    let _api_key = req.headers().get(&API_KEY_HEADER);
    next.run(req).await
}
