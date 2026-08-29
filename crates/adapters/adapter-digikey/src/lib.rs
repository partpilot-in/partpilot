#![recursion_limit = "256"]

mod auth;
mod client;
mod mapping;

use std::time::Duration;

use async_trait::async_trait;
use engine::{
    LifecycleStatus, NormalizedManufacturer, NormalizedMpn, PartSnapshot, SourceId,
    ports::data_source::{ConnectorError, DataSourceConnector},
};

use client::DigikeyClient;

pub const DEFAULT_DIGIKEY_SOURCE_ID: SourceId = SourceId(1);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DigikeyConfig {
    pub client_id: String,
    pub client_secret: String,
    pub account_id: String,
    pub source_id: SourceId,
    pub api_base_url: String,
    pub token_url: String,
    pub locale_site: String,
    pub locale_language: String,
    pub locale_currency: String,
    pub request_timeout: Duration,
}

impl DigikeyConfig {
    /// Loads process environment first and fills missing values from the root `.env` file.
    /// `dotenvy::dotenv` never replaces variables already present in the process environment.
    pub fn from_env() -> Result<Self, ConnectorError> {
        dotenvy::dotenv().ok();
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    /// Returns `None` when DigiKey is entirely unconfigured, while rejecting
    /// partial credential sets so a deployment cannot silently disable enrichment.
    pub fn from_env_optional() -> Result<Option<Self>, ConnectorError> {
        dotenvy::dotenv().ok();
        let configured = [
            "DIGIKEY_CLIENT_ID",
            "DIGIKEY_CLIENT_SECRET",
            "DIGIKEY_ACCOUNT_ID",
        ]
        .iter()
        .any(|name| std::env::var(name).is_ok_and(|value| !value.trim().is_empty()));
        if configured {
            Self::from_env().map(Some)
        } else {
            Ok(None)
        }
    }

    fn from_lookup(mut lookup: impl FnMut(&str) -> Option<String>) -> Result<Self, ConnectorError> {
        let client_id = required(&mut lookup, "DIGIKEY_CLIENT_ID")?;
        let client_secret = required(&mut lookup, "DIGIKEY_CLIENT_SECRET")?;
        let account_id = required(&mut lookup, "DIGIKEY_ACCOUNT_ID")?;
        let source_id = optional(&mut lookup, "DIGIKEY_SOURCE_ID")
            .map(|value| {
                value.parse::<u32>().map(SourceId).map_err(|error| {
                    ConnectorError::AuthFailed(format!("invalid DIGIKEY_SOURCE_ID: {error}"))
                })
            })
            .transpose()?
            .unwrap_or(DEFAULT_DIGIKEY_SOURCE_ID);
        let api_base_url = optional(&mut lookup, "DIGIKEY_API_BASE_URL")
            .unwrap_or_else(|| "https://api.digikey.com".to_owned());
        let token_url = optional(&mut lookup, "DIGIKEY_TOKEN_URL")
            .unwrap_or_else(|| format!("{}/v1/oauth2/token", api_base_url.trim_end_matches('/')));
        let locale_site =
            optional(&mut lookup, "DIGIKEY_LOCALE_SITE").unwrap_or_else(|| "US".to_owned());
        let locale_language =
            optional(&mut lookup, "DIGIKEY_LOCALE_LANGUAGE").unwrap_or_else(|| "en".to_owned());
        let locale_currency =
            optional(&mut lookup, "DIGIKEY_LOCALE_CURRENCY").unwrap_or_else(|| "USD".to_owned());
        let request_timeout = optional(&mut lookup, "DIGIKEY_REQUEST_TIMEOUT_SECONDS")
            .map(|value| {
                value
                    .parse::<u64>()
                    .map(Duration::from_secs)
                    .map_err(|error| {
                        ConnectorError::AuthFailed(format!(
                            "invalid DIGIKEY_REQUEST_TIMEOUT_SECONDS: {error}"
                        ))
                    })
            })
            .transpose()?
            .unwrap_or_else(|| Duration::from_secs(15));

        Ok(Self {
            client_id,
            client_secret,
            account_id,
            source_id,
            api_base_url,
            token_url,
            locale_site,
            locale_language,
            locale_currency,
            request_timeout,
        })
    }
}

#[derive(Debug)]
pub struct DigikeyConnector {
    source_id: SourceId,
    locale_currency: String,
    client: DigikeyClient,
}

impl DigikeyConnector {
    pub fn new(config: DigikeyConfig) -> Result<Self, ConnectorError> {
        let source_id = config.source_id;
        let locale_currency = config.locale_currency.clone();
        let client = DigikeyClient::new(&config)?;
        Ok(Self {
            source_id,
            locale_currency,
            client,
        })
    }

    pub fn from_env() -> Result<Self, ConnectorError> {
        Self::new(DigikeyConfig::from_env()?)
    }

    async fn fetch_snapshot(
        &self,
        mpn: &NormalizedMpn,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<PartSnapshot>, ConnectorError> {
        self.fetch_snapshot_by_product_number(&mpn.0, mpn, manufacturer)
            .await
    }

    async fn fetch_snapshot_by_product_number(
        &self,
        product_number: &str,
        mpn: &NormalizedMpn,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<PartSnapshot>, ConnectorError> {
        let details = match self.client.product_details(product_number).await {
            Ok(details) => details,
            Err(ConnectorError::NotFound) => return Ok(None),
            Err(error) => return Err(error),
        };
        if !mapping::matches_requested_part(&details.product, mpn, manufacturer) {
            return Ok(None);
        }
        Ok(Some(mapping::to_part_snapshot(
            &details,
            self.source_id,
            &self.locale_currency,
        )))
    }
}

#[async_trait]
impl DataSourceConnector for DigikeyConnector {
    fn source_id(&self) -> SourceId {
        self.source_id
    }

    async fn fetch_status(
        &self,
        mpn: &NormalizedMpn,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<LifecycleStatus>, ConnectorError> {
        Ok(self
            .fetch_snapshot(mpn, manufacturer)
            .await?
            .map(|snapshot| snapshot.lifecycle_status))
    }

    async fn fetch_part(
        &self,
        mpn: &NormalizedMpn,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<PartSnapshot>, ConnectorError> {
        self.fetch_snapshot(mpn, manufacturer).await
    }

    async fn fetch_part_by_query(
        &self,
        raw_mpn: &str,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<PartSnapshot>, ConnectorError> {
        let mpn = engine::normalize::normalize_mpn(raw_mpn);
        self.fetch_snapshot_by_product_number(raw_mpn, &mpn, manufacturer)
            .await
    }
}

fn optional(lookup: &mut impl FnMut(&str) -> Option<String>, name: &str) -> Option<String> {
    lookup(name).filter(|value| !value.trim().is_empty())
}

fn required(
    lookup: &mut impl FnMut(&str) -> Option<String>,
    name: &str,
) -> Result<String, ConnectorError> {
    optional(lookup, name).ok_or_else(|| ConnectorError::AuthFailed(format!("missing {name}")))
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        },
        time::Duration,
    };

    use axum::{
        Form, Json, Router,
        extract::State,
        http::{HeaderMap, StatusCode},
        routing::{get, post},
    };
    use engine::{
        LifecycleStage, NormalizedManufacturer, SourceId, ports::data_source::DataSourceConnector,
    };
    use serde_json::{Value, json};

    use super::{DigikeyConfig, DigikeyConnector};

    #[test]
    fn loads_required_values_and_defaults() {
        let values = HashMap::from([
            ("DIGIKEY_CLIENT_ID", "client"),
            ("DIGIKEY_CLIENT_SECRET", "secret"),
            ("DIGIKEY_ACCOUNT_ID", "123456"),
        ]);
        let config = DigikeyConfig::from_lookup(|name| values.get(name).map(ToString::to_string))
            .expect("valid config");

        assert_eq!(config.source_id, SourceId(1));
        assert_eq!(config.api_base_url, "https://api.digikey.com");
        assert_eq!(config.locale_site, "US");
        assert_eq!(config.request_timeout, Duration::from_secs(15));
    }

    #[test]
    fn rejects_missing_credentials() {
        let error = DigikeyConfig::from_lookup(|_| None).expect_err("credentials are required");
        assert!(error.to_string().contains("DIGIKEY_CLIENT_ID"));
    }

    #[tokio::test]
    async fn authenticates_once_and_fetches_product_details_with_required_headers() {
        let token_requests = Arc::new(AtomicUsize::new(0));
        let app = Router::new()
            .route("/v1/oauth2/token", post(token_handler))
            .route(
                "/products/v4/search/LM1117-3.3/productdetails",
                get(product_details_handler),
            )
            .route(
                "/products/v4/search/5060-STM32F103C8T6/productdetails",
                get(alias_product_details_handler),
            )
            .with_state(token_requests.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock server");
        let address = listener.local_addr().expect("mock server address");
        tokio::spawn(async move {
            axum::serve(listener, app).await.expect("serve mock API");
        });

        let connector = DigikeyConnector::new(DigikeyConfig {
            client_id: "test-client".to_owned(),
            client_secret: "test-secret".to_owned(),
            account_id: "123456".to_owned(),
            source_id: SourceId(7),
            api_base_url: format!("http://{address}"),
            token_url: format!("http://{address}/v1/oauth2/token"),
            locale_site: "IN".to_owned(),
            locale_language: "en".to_owned(),
            locale_currency: "INR".to_owned(),
            request_timeout: Duration::from_secs(2),
        })
        .expect("valid connector");
        let manufacturer = NormalizedManufacturer("TEXAS INSTRUMENTS".to_owned());

        for _ in 0..2 {
            let snapshot = connector
                .fetch_part_by_query("LM1117-3.3", &manufacturer)
                .await
                .expect("successful request")
                .expect("matching product");
            assert_eq!(snapshot.lifecycle_status.stage, LifecycleStage::Active);
            assert_eq!(snapshot.lifecycle_status.source, SourceId(7));
        }
        let alias_snapshot = connector
            .fetch_part_by_query(
                "5060-STM32F103C8T6",
                &NormalizedManufacturer("STMICROELECTRONICS".to_owned()),
            )
            .await
            .expect("successful alias request")
            .expect("alias matches DigiKey OtherNames");
        assert_eq!(alias_snapshot.part.mpn.0, "STM32F103C8T6");
        assert_eq!(
            alias_snapshot.part.component_metadata["identification"]["alternatePartNumbers"],
            json!(["5060-STM32F103C8T6", "497-6063"])
        );
        assert_eq!(token_requests.load(Ordering::SeqCst), 1);
    }

    async fn token_handler(
        State(token_requests): State<Arc<AtomicUsize>>,
        Form(form): Form<HashMap<String, String>>,
    ) -> Result<Json<Value>, StatusCode> {
        if form.get("client_id").map(String::as_str) != Some("test-client")
            || form.get("client_secret").map(String::as_str) != Some("test-secret")
            || form.get("grant_type").map(String::as_str) != Some("client_credentials")
        {
            return Err(StatusCode::BAD_REQUEST);
        }
        token_requests.fetch_add(1, Ordering::SeqCst);
        Ok(Json(json!({
            "access_token": "access-token",
            "expires_in": 3600,
            "token_type": "Bearer"
        })))
    }

    async fn product_details_handler(headers: HeaderMap) -> Result<Json<Value>, StatusCode> {
        let expected_headers = [
            ("authorization", "Bearer access-token"),
            ("x-digikey-client-id", "test-client"),
            ("x-digikey-account-id", "123456"),
            ("x-digikey-locale-site", "IN"),
            ("x-digikey-locale-language", "en"),
            ("x-digikey-locale-currency", "INR"),
        ];
        if expected_headers.iter().any(|(name, expected)| {
            headers.get(*name).and_then(|value| value.to_str().ok()) != Some(*expected)
        }) {
            return Err(StatusCode::BAD_REQUEST);
        }

        Ok(Json(json!({
            "Product": {
                "Manufacturer": { "Id": 296, "Name": "Texas Instruments" },
                "ManufacturerProductNumber": "LM1117-3.3",
                "ProductUrl": "https://www.digikey.com/example",
                "ProductStatus": { "Id": 0, "Status": "Active" },
                "Discontinued": false,
                "EndOfLife": false
            }
        })))
    }

    async fn alias_product_details_handler() -> Json<Value> {
        Json(json!({
            "Product": {
                "Manufacturer": { "Id": 497, "Name": "STMicroelectronics" },
                "ManufacturerProductNumber": "STM32F103C8T6",
                "ProductUrl": "https://www.digikey.com/example/stm32f103c8t6",
                "ProductStatus": { "Id": 0, "Status": "Active" },
                "OtherNames": ["5060-STM32F103C8T6", "497-6063"],
                "Discontinued": false,
                "EndOfLife": false
            }
        }))
    }
}
