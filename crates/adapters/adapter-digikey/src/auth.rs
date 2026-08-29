use std::time::{Duration, Instant};

use engine::ports::data_source::ConnectorError;
use serde::Deserialize;
use tokio::sync::Mutex;

const TOKEN_REFRESH_SKEW: Duration = Duration::from_secs(30);

#[derive(Debug)]
pub(crate) struct DigikeyAuth {
    client: reqwest::Client,
    client_id: String,
    client_secret: String,
    token_url: reqwest::Url,
    cached: Mutex<Option<CachedToken>>,
}

#[derive(Debug, Clone)]
struct CachedToken {
    access_token: String,
    expires_at: Instant,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

impl DigikeyAuth {
    pub(crate) fn new(
        client: reqwest::Client,
        client_id: String,
        client_secret: String,
        token_url: reqwest::Url,
    ) -> Self {
        Self {
            client,
            client_id,
            client_secret,
            token_url,
            cached: Mutex::new(None),
        }
    }

    pub(crate) async fn access_token(&self) -> Result<String, ConnectorError> {
        let mut cached = self.cached.lock().await;
        if let Some(token) = cached.as_ref()
            && token.expires_at > Instant::now() + TOKEN_REFRESH_SKEW
        {
            return Ok(token.access_token.clone());
        }

        let response = self
            .client
            .post(self.token_url.clone())
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("grant_type", "client_credentials"),
            ])
            .send()
            .await
            .map_err(|error| ConnectorError::Unavailable(error.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let detail = response.text().await.unwrap_or_default();
            return Err(ConnectorError::AuthFailed(format!(
                "DigiKey token endpoint returned {status}: {}",
                summarize_body(&detail)
            )));
        }

        let token: TokenResponse = response
            .json()
            .await
            .map_err(|error| ConnectorError::Malformed(error.to_string()))?;
        if token.access_token.trim().is_empty() || token.expires_in == 0 {
            return Err(ConnectorError::Malformed(
                "DigiKey token response contained an empty or expired token".to_owned(),
            ));
        }

        let result = token.access_token.clone();
        *cached = Some(CachedToken {
            access_token: token.access_token,
            expires_at: Instant::now() + Duration::from_secs(token.expires_in),
        });
        Ok(result)
    }

    pub(crate) async fn invalidate(&self) {
        *self.cached.lock().await = None;
    }
}

fn summarize_body(body: &str) -> String {
    const MAX_CHARS: usize = 300;
    let mut summary: String = body.chars().take(MAX_CHARS).collect();
    if body.chars().count() > MAX_CHARS {
        summary.push('…');
    }
    if summary.trim().is_empty() {
        "no response body".to_owned()
    } else {
        summary
    }
}
