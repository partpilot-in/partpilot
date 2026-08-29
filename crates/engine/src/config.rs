use std::collections::HashMap;

use crate::domain::SourceId;

#[derive(Debug, Clone, PartialEq)]
pub struct ReconcilePolicy {
    pub source_weight: HashMap<SourceId, f32>,
    pub recency_half_life_days: f32,
}

impl ReconcilePolicy {
    pub fn source_weight_for(&self, source: SourceId) -> f32 {
        self.source_weight.get(&source).copied().unwrap_or(0.3)
    }
}

impl Default for ReconcilePolicy {
    fn default() -> Self {
        Self {
            source_weight: HashMap::new(),
            recency_half_life_days: 180.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RiskWeights {
    pub single_source_penalty: f32,
    pub no_alternates_penalty: f32,
    pub imminent_ltb_penalty: f32,
    pub imminent_ltb_days: i64,
}

impl Default for RiskWeights {
    fn default() -> Self {
        Self {
            single_source_penalty: 0.10,
            no_alternates_penalty: 0.15,
            imminent_ltb_penalty: 0.20,
            imminent_ltb_days: 90,
        }
    }
}
