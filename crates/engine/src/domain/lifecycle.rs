use std::cmp::Ordering;

use super::PartId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleStage {
    Active,
    Nrnd,
    LastTimeBuy,
    Obsolete,
    Unknown,
}

impl LifecycleStage {
    pub const fn severity_rank(self) -> u8 {
        match self {
            Self::Active => 0,
            Self::Nrnd => 1,
            Self::Unknown => 2,
            Self::LastTimeBuy => 3,
            Self::Obsolete => 4,
        }
    }

    pub const fn is_terminal_risk(self) -> bool {
        matches!(self, Self::LastTimeBuy | Self::Obsolete)
    }
}

impl Ord for LifecycleStage {
    fn cmp(&self, other: &Self) -> Ordering {
        self.severity_rank().cmp(&other.severity_rank())
    }
}

impl PartialOrd for LifecycleStage {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct LifecycleStatus {
    pub part_id: PartId,
    pub stage: LifecycleStage,
    pub source: SourceId,
    pub reported_at: chrono::DateTime<chrono::Utc>,
    pub last_time_buy_date: Option<chrono::NaiveDate>,
    pub confidence: Confidence,
    pub raw_payload_ref: Option<String>,
}

impl LifecycleStatus {
    pub fn with_stage_and_confidence(&self, stage: LifecycleStage, confidence: Confidence) -> Self {
        Self {
            stage,
            confidence,
            last_time_buy_date: None,
            ..self.clone()
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub struct Confidence(pub f32);

impl Confidence {
    pub fn clamped(value: f32) -> Self {
        Self(value.clamp(0.0, 1.0))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SourceId(pub u32);

#[cfg(test)]
mod tests {
    use super::LifecycleStage;

    #[test]
    fn lifecycle_stage_order_is_explicit_severity_order() {
        assert!(LifecycleStage::Obsolete > LifecycleStage::Active);
        assert!(LifecycleStage::LastTimeBuy > LifecycleStage::Unknown);
        assert!(LifecycleStage::Unknown > LifecycleStage::Nrnd);
    }
}
