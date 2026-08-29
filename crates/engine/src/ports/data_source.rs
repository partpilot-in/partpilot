use std::time::Duration;

use crate::domain::{
    LifecycleStatus, NormalizedManufacturer, NormalizedMpn, PartSnapshot, SourceId,
};

#[async_trait::async_trait]
pub trait DataSourceConnector: Send + Sync {
    fn source_id(&self) -> SourceId;

    async fn fetch_status(
        &self,
        mpn: &NormalizedMpn,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<LifecycleStatus>, ConnectorError>;

    /// Fetches the complete source-backed part record when the connector can
    /// provide catalog metadata in addition to lifecycle status.
    async fn fetch_part(
        &self,
        _mpn: &NormalizedMpn,
        _manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<PartSnapshot>, ConnectorError> {
        Ok(None)
    }

    /// Fetches a complete part record while preserving the source's original
    /// product-number spelling. Connectors whose APIs are punctuation-sensitive
    /// can override this; other connectors retain the normalized lookup behavior.
    async fn fetch_part_by_query(
        &self,
        raw_mpn: &str,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<PartSnapshot>, ConnectorError> {
        self.fetch_part(&crate::normalize::normalize_mpn(raw_mpn), manufacturer)
            .await
    }

    async fn fetch_status_batch(
        &self,
        parts: &[(NormalizedMpn, NormalizedManufacturer)],
    ) -> Result<Vec<LifecycleStatus>, ConnectorError> {
        let mut out = Vec::with_capacity(parts.len());
        for (mpn, manufacturer) in parts {
            if let Some(status) = self.fetch_status(mpn, manufacturer).await? {
                out.push(status);
            }
        }
        Ok(out)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConnectorError {
    #[error("rate limited, retry after {0:?}")]
    RateLimited(Duration),
    #[error("source unavailable: {0}")]
    Unavailable(String),
    #[error("part not found in source")]
    NotFound,
    #[error("malformed response: {0}")]
    Malformed(String),
    #[error("auth failed: {0}")]
    AuthFailed(String),
}
