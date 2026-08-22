pub mod alternates;
pub mod lifecycle;
pub mod part;
pub mod risk;

pub use alternates::{AlternateMatchKind, AlternatePart};
pub use lifecycle::{Confidence, LifecycleStage, LifecycleStatus, SourceId};
pub use part::{
    NormalizedManufacturer, NormalizedMpn, ParamValue, Part, PartId, PartParameters, PartSnapshot,
};
pub use risk::{RiskBand, RiskScore};
