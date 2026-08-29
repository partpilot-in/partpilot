use std::collections::HashMap;

pub use crate::config::ReconcilePolicy;
use crate::domain::{Confidence, LifecycleStage, LifecycleStatus, SourceId};

const STALE_UNKNOWN_AFTER_HALF_LIVES: f32 = 2.0;

#[derive(Debug, Clone, Copy)]
struct WeightedStatus<'a> {
    status: &'a LifecycleStatus,
    source_weight: f32,
    weighted_confidence: f32,
}

pub fn reconcile(statuses: &[LifecycleStatus], policy: &ReconcilePolicy) -> LifecycleStatus {
    assert!(
        !statuses.is_empty(),
        "reconcile requires at least one lifecycle status"
    );

    let latest_per_source = dedupe_latest_per_source(statuses);
    let weighted = latest_per_source
        .iter()
        .map(|status| {
            let source_weight = policy.source_weight_for(status.source);
            WeightedStatus {
                status,
                source_weight,
                weighted_confidence: source_weight
                    * recency_decay(status.reported_at, policy.recency_half_life_days)
                    * status.confidence.0,
            }
        })
        .collect::<Vec<_>>();

    if all_non_terminal_statuses_are_stale(&weighted, policy) {
        let best = pick_highest_weighted(&weighted).status;
        return best.with_stage_and_confidence(
            LifecycleStage::Unknown,
            Confidence::clamped(pick_highest_weighted(&weighted).weighted_confidence),
        );
    }

    pick_authoritative(&weighted).clone()
}

fn dedupe_latest_per_source(statuses: &[LifecycleStatus]) -> Vec<LifecycleStatus> {
    let mut latest: HashMap<SourceId, &LifecycleStatus> = HashMap::new();
    for status in statuses {
        latest
            .entry(status.source)
            .and_modify(|current| {
                if status.reported_at > current.reported_at {
                    *current = status;
                }
            })
            .or_insert(status);
    }

    latest.into_values().cloned().collect()
}

fn pick_authoritative<'a>(weighted: &'a [WeightedStatus<'a>]) -> &'a LifecycleStatus {
    if let Some(escalation) = weighted
        .iter()
        .filter(|candidate| candidate.status.stage.is_terminal_risk())
        .filter(|candidate| !has_newer_equally_authoritative_correction(candidate, weighted))
        .max_by(|left, right| compare_escalation(left, right))
    {
        return escalation.status;
    }

    pick_highest_weighted(weighted).status
}

fn has_newer_equally_authoritative_correction(
    candidate: &WeightedStatus<'_>,
    weighted: &[WeightedStatus<'_>],
) -> bool {
    weighted.iter().any(|other| {
        other.status.reported_at > candidate.status.reported_at
            && other.source_weight >= candidate.source_weight
            && other.status.stage < candidate.status.stage
    })
}

fn compare_escalation(left: &WeightedStatus<'_>, right: &WeightedStatus<'_>) -> std::cmp::Ordering {
    left.status
        .stage
        .cmp(&right.status.stage)
        .then_with(|| left.source_weight.total_cmp(&right.source_weight))
        .then_with(|| {
            left.weighted_confidence
                .total_cmp(&right.weighted_confidence)
        })
        .then_with(|| left.status.reported_at.cmp(&right.status.reported_at))
}

fn pick_highest_weighted<'a>(weighted: &'a [WeightedStatus<'a>]) -> &'a WeightedStatus<'a> {
    weighted
        .iter()
        .max_by(|left, right| {
            left.weighted_confidence
                .total_cmp(&right.weighted_confidence)
                .then_with(|| left.source_weight.total_cmp(&right.source_weight))
                .then_with(|| left.status.stage.cmp(&right.status.stage))
                .then_with(|| left.status.reported_at.cmp(&right.status.reported_at))
        })
        .expect("weighted statuses are non-empty")
}

fn all_non_terminal_statuses_are_stale(
    weighted: &[WeightedStatus<'_>],
    policy: &ReconcilePolicy,
) -> bool {
    weighted.iter().all(|candidate| {
        !candidate.status.stage.is_terminal_risk()
            && age_days(candidate.status.reported_at)
                > policy.recency_half_life_days * STALE_UNKNOWN_AFTER_HALF_LIVES
    })
}

fn recency_decay(reported_at: chrono::DateTime<chrono::Utc>, half_life_days: f32) -> f32 {
    let days = age_days(reported_at).max(0.0);
    if half_life_days <= 0.0 {
        return 0.0;
    }
    0.5f32.powf(days / half_life_days)
}

fn age_days(reported_at: chrono::DateTime<chrono::Utc>) -> f32 {
    (chrono::Utc::now() - reported_at).num_seconds().max(0) as f32 / 86_400.0
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use chrono::{Duration, Utc};

    use super::{ReconcilePolicy, reconcile};
    use crate::domain::{Confidence, LifecycleStage, LifecycleStatus, PartId, SourceId};

    const MANUFACTURER: SourceId = SourceId(1);
    const DIST_A: SourceId = SourceId(2);
    const DIST_B: SourceId = SourceId(3);

    fn part_id() -> PartId {
        PartId(uuid::Uuid::from_u128(1))
    }

    fn status(source: SourceId, stage: LifecycleStage, reported_days_ago: i64) -> LifecycleStatus {
        LifecycleStatus {
            part_id: part_id(),
            stage,
            source,
            reported_at: Utc::now() - Duration::days(reported_days_ago),
            last_time_buy_date: None,
            confidence: Confidence(1.0),
            raw_payload_ref: None,
        }
    }

    fn policy(weights: &[(SourceId, f32)]) -> ReconcilePolicy {
        ReconcilePolicy {
            source_weight: HashMap::from_iter(weights.iter().copied()),
            recency_half_life_days: 180.0,
        }
    }

    #[test]
    fn single_status_passes_through() {
        let input = status(DIST_A, LifecycleStage::Active, 1);
        let result = reconcile(&[input.clone()], &policy(&[(DIST_A, 0.4)]));
        assert_eq!(result, input);
    }

    #[test]
    fn manufacturer_last_time_buy_overrides_recent_lower_weight_distributor_active() {
        let result = reconcile(
            &[
                status(MANUFACTURER, LifecycleStage::LastTimeBuy, 90),
                status(DIST_A, LifecycleStage::Active, 1),
            ],
            &policy(&[(MANUFACTURER, 1.0), (DIST_A, 0.4)]),
        );

        assert_eq!(result.stage, LifecycleStage::LastTimeBuy);
        assert_eq!(result.source, MANUFACTURER);
    }

    #[test]
    fn higher_weight_distributor_wins_when_no_manufacturer_source_is_present() {
        let result = reconcile(
            &[
                status(DIST_A, LifecycleStage::Active, 1),
                status(DIST_B, LifecycleStage::Nrnd, 1),
            ],
            &policy(&[(DIST_A, 0.2), (DIST_B, 0.7)]),
        );

        assert_eq!(result.stage, LifecycleStage::Nrnd);
        assert_eq!(result.source, DIST_B);
    }

    #[test]
    fn newer_equally_authoritative_status_can_reverse_old_terminal_status() {
        let result = reconcile(
            &[
                status(MANUFACTURER, LifecycleStage::LastTimeBuy, 30),
                status(MANUFACTURER, LifecycleStage::Active, 1),
            ],
            &policy(&[(MANUFACTURER, 1.0)]),
        );

        assert_eq!(result.stage, LifecycleStage::Active);
        assert_eq!(result.source, MANUFACTURER);
    }

    #[test]
    fn all_stale_non_terminal_sources_decay_to_unknown() {
        let result = reconcile(
            &[
                status(DIST_A, LifecycleStage::Active, 70),
                status(DIST_B, LifecycleStage::Nrnd, 65),
            ],
            &ReconcilePolicy {
                source_weight: HashMap::from([(DIST_A, 0.4), (DIST_B, 0.5)]),
                recency_half_life_days: 30.0,
            },
        );

        assert_eq!(result.stage, LifecycleStage::Unknown);
        assert!(result.confidence.0 < 0.15);
    }
}
