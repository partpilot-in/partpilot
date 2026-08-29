use super::PartId;

#[derive(Debug, Clone, PartialEq)]
pub struct AlternatePart {
    pub original: PartId,
    pub alternate: PartId,
    pub match_kind: AlternateMatchKind,
    pub similarity: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlternateMatchKind {
    ManufacturerCrossRef,
    FormFitFunction,
    SameFamily,
}
