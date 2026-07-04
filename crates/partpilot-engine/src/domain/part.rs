use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PartId(pub uuid::Uuid);

#[derive(Debug, Clone, PartialEq)]
pub struct Part {
    pub id: PartId,
    pub mpn: NormalizedMpn,
    pub manufacturer: NormalizedManufacturer,
    pub description: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NormalizedMpn(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NormalizedManufacturer(pub String);

#[derive(Debug, Clone, Default, PartialEq)]
pub struct PartParameters(pub HashMap<String, ParamValue>);

#[derive(Debug, Clone, PartialEq)]
pub enum ParamValue {
    Number(f64),
    Text(String),
    Bool(bool),
}

impl From<uuid::Uuid> for PartId {
    fn from(value: uuid::Uuid) -> Self {
        Self(value)
    }
}
