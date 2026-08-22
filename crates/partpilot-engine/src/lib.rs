pub mod config;
pub mod domain;
pub mod match_alt;
pub mod normalize;
pub mod ports;
pub mod reconcile;
pub mod risk;

pub use config::{ReconcilePolicy, RiskWeights};
pub use domain::{
    AlternateMatchKind, AlternatePart, Confidence, LifecycleStage, LifecycleStatus,
    NormalizedManufacturer, NormalizedMpn, ParamValue, Part, PartId, PartParameters, PartSnapshot,
    RiskBand, RiskScore, SourceId,
};
pub use risk::{base_rating, rating_from_risk};
