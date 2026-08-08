pub use crate::config::RiskWeights;
use crate::domain::{LifecycleStage, LifecycleStatus, RiskBand, RiskScore};

const BASE_RISK_VALUE: f32 = 0.28;

pub struct RiskInputs<'a> {
    pub reconciled_status: &'a LifecycleStatus,
    pub source_count: usize,
    pub alternates_available: usize,
    pub days_to_last_time_buy: Option<i64>,
}

pub fn score_risk(inputs: RiskInputs<'_>, weights: &RiskWeights) -> RiskScore {
    let mut value = match inputs.reconciled_status.stage {
        LifecycleStage::Obsolete => 1.0,
        LifecycleStage::LastTimeBuy => 0.75,
        LifecycleStage::Nrnd => 0.4,
        LifecycleStage::Active => 0.05,
        LifecycleStage::Unknown => 0.5,
    };

    if inputs.source_count <= 1 {
        value += weights.single_source_penalty;
    }
    if inputs.alternates_available == 0 {
        value += weights.no_alternates_penalty;
    }
    if let Some(days) = inputs.days_to_last_time_buy
        && days < weights.imminent_ltb_days
    {
        value += weights.imminent_ltb_penalty;
    }

    let value = value.clamp(0.0, 1.0);
    RiskScore {
        value,
        band: band_for(value),
    }
}

pub fn band_for(value: f32) -> RiskBand {
    match value {
        value if value >= 0.85 => RiskBand::Critical,
        value if value >= 0.6 => RiskBand::High,
        value if value >= 0.3 => RiskBand::Medium,
        _ => RiskBand::Low,
    }
}

/// Convert engine risk (higher is worse) to the public PartPilot rating
/// (higher is better).
pub fn rating_from_risk(risk: &RiskScore) -> i32 {
    ((1.0 - risk.value.clamp(0.0, 1.0)) * 100.0).round() as i32
}

/// Return the baseline rating used until adapter data can produce a risk score.
pub fn base_rating() -> i32 {
    let risk = RiskScore {
        value: BASE_RISK_VALUE,
        band: band_for(BASE_RISK_VALUE),
    };
    rating_from_risk(&risk)
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::{RiskInputs, RiskWeights, band_for, base_rating, rating_from_risk, score_risk};
    use crate::domain::{Confidence, LifecycleStage, LifecycleStatus, PartId, RiskBand, SourceId};

    fn status(stage: LifecycleStage) -> LifecycleStatus {
        LifecycleStatus {
            part_id: PartId(uuid::Uuid::from_u128(1)),
            stage,
            source: SourceId(1),
            reported_at: Utc::now(),
            last_time_buy_date: None,
            confidence: Confidence(1.0),
            raw_payload_ref: None,
        }
    }

    fn expected_base(stage: LifecycleStage) -> f32 {
        match stage {
            LifecycleStage::Obsolete => 1.0,
            LifecycleStage::LastTimeBuy => 0.75,
            LifecycleStage::Nrnd => 0.4,
            LifecycleStage::Active => 0.05,
            LifecycleStage::Unknown => 0.5,
        }
    }

    #[test]
    fn risk_scores_cover_all_stages_and_penalty_combinations() {
        let weights = RiskWeights::default();
        let stages = [
            LifecycleStage::Active,
            LifecycleStage::Nrnd,
            LifecycleStage::LastTimeBuy,
            LifecycleStage::Obsolete,
            LifecycleStage::Unknown,
        ];

        for stage in stages {
            for single_source in [false, true] {
                for no_alternates in [false, true] {
                    for imminent_ltb in [false, true] {
                        let status = status(stage);
                        let result = score_risk(
                            RiskInputs {
                                reconciled_status: &status,
                                source_count: if single_source { 1 } else { 2 },
                                alternates_available: if no_alternates { 0 } else { 1 },
                                days_to_last_time_buy: if imminent_ltb { Some(10) } else { None },
                            },
                            &weights,
                        );

                        let mut expected = expected_base(stage);
                        if single_source {
                            expected += weights.single_source_penalty;
                        }
                        if no_alternates {
                            expected += weights.no_alternates_penalty;
                        }
                        if imminent_ltb {
                            expected += weights.imminent_ltb_penalty;
                        }
                        expected = expected.clamp(0.0, 1.0);

                        assert!(
                            (result.value - expected).abs() < f32::EPSILON,
                            "stage={stage:?} single_source={single_source} no_alternates={no_alternates} imminent_ltb={imminent_ltb}"
                        );
                        assert_eq!(result.band, band_for(expected));
                    }
                }
            }
        }
    }

    #[test]
    fn band_thresholds_are_inclusive_at_lower_bound() {
        assert_eq!(band_for(0.0), RiskBand::Low);
        assert_eq!(band_for(0.3), RiskBand::Medium);
        assert_eq!(band_for(0.6), RiskBand::High);
        assert_eq!(band_for(0.85), RiskBand::Critical);
    }

    #[test]
    fn partpilot_rating_inverts_and_scales_risk() {
        assert_eq!(
            rating_from_risk(&crate::domain::RiskScore {
                value: 0.08,
                band: RiskBand::Low,
            }),
            92
        );
        assert_eq!(
            rating_from_risk(&crate::domain::RiskScore {
                value: 1.5,
                band: RiskBand::Critical,
            }),
            0
        );
    }

    #[test]
    fn base_rating_is_available_without_adapter_inputs() {
        assert_eq!(base_rating(), 72);
    }
}
