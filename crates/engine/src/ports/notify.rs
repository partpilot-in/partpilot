use crate::domain::{Part, RiskBand, RiskScore};

#[async_trait::async_trait]
pub trait NotificationSender: Send + Sync {
    async fn send_risk_alert(
        &self,
        user_id: uuid::Uuid,
        part: &Part,
        risk: RiskScore,
        previous_band: Option<RiskBand>,
    ) -> Result<(), NotifyError>;
}

#[derive(Debug, thiserror::Error)]
pub enum NotifyError {
    #[error("delivery failed: {0}")]
    DeliveryFailed(String),
    #[error("no delivery channel configured for user")]
    NoChannel,
}
