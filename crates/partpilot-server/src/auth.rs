use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::{HeaderName, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use serde::Deserialize;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

pub const API_KEY_HEADER: HeaderName = HeaderName::from_static("x-api-key");

#[derive(Debug, Clone, Copy)]
pub struct UserId(pub Uuid);

#[derive(Clone)]
pub enum AuthVerifier {
    Disabled(Uuid),
    Jwks {
        url: String,
        auth_user_url: String,
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
            publishable_key,
            client: reqwest::Client::new(),
            cache: Arc::new(RwLock::new(None)),
        }
    }

    async fn verify(&self, token: &str) -> Result<Uuid, AppError> {
        match self {
            Self::Disabled(user_id) => Ok(*user_id),
            Self::Jwks {
                url,
                auth_user_url,
                publishable_key,
                client,
                cache,
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
}

#[derive(Debug, Clone, Deserialize)]
struct Claims {
    sub: String,
    #[allow(dead_code)]
    exp: usize,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: Uuid,
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
) -> Result<Uuid, AppError> {
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
    Uuid::parse_str(&claims.sub).map_err(|_| AppError::unauthorized("invalid access-token subject"))
}

async fn verify_with_auth_server(
    token: &str,
    auth_user_url: &str,
    publishable_key: &str,
    client: &reqwest::Client,
) -> Result<Uuid, AppError> {
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
        .map(|user| user.id)
        .map_err(|_| AppError::unauthorized("invalid Supabase user response"))
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
        .unwrap_or_default();

    let user_id = state.auth.verify(token).await?;
    req.extensions_mut().insert(UserId(user_id));
    Ok(next.run(req).await)
}

pub async fn placeholder_api_key(req: Request, next: Next) -> Response {
    let _api_key = req.headers().get(&API_KEY_HEADER);
    next.run(req).await
}
