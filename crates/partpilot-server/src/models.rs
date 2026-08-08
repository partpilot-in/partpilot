use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PartDto {
    pub id: Uuid,
    pub mpn: String,
    pub manufacturer: String,
    pub description: String,
    pub category: String,
    pub lifecycle_stage: String,
    pub score: i32,
    pub country_of_origin: String,
    pub unit_price: f64,
    pub compliance: Value,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BomLineDto {
    pub id: Uuid,
    pub part_id: Uuid,
    pub line_no: i32,
    pub mpn: String,
    pub description: String,
    pub manufacturer: String,
    pub country_of_origin: String,
    pub category: String,
    pub qty: i32,
    pub unit_price: f64,
    pub compliance: Value,
    pub lifecycle_stage: String,
    pub score: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDto {
    pub id: Uuid,
    pub name: String,
    pub part_count: i32,
    pub uploaded_at: DateTime<Utc>,
    pub owner: String,
    pub lowest_score: i32,
    pub lines: Vec<BomLineDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BomLineInput {
    pub line_no: Option<i32>,
    pub part_id: Option<String>,
    pub mpn: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub manufacturer: String,
    #[serde(default)]
    pub country_of_origin: String,
    #[serde(default)]
    pub category: String,
    #[serde(default = "default_qty")]
    pub qty: i32,
    #[serde(default)]
    pub unit_price: f64,
    #[serde(default = "default_compliance")]
    pub compliance: Value,
    #[serde(default = "default_lifecycle")]
    pub lifecycle_stage: String,
    #[serde(default = "partpilot_engine::base_rating")]
    pub score: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateBom {
    pub name: String,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub lines: Vec<BomLineInput>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateBom {
    pub name: Option<String>,
    pub lines: Option<Vec<BomLineInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MyPartDto {
    pub id: Uuid,
    pub mpn: String,
    pub manufacturer: String,
    pub description: String,
    pub category: String,
    pub lifecycle_stage: String,
    pub score: i32,
    pub country_of_origin: String,
    pub unit_price: f64,
    pub compliance: Value,
    pub parameters: Value,
    pub project_count: i32,
    pub project_names: String,
    pub total_qty: i32,
    pub source: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MyPartInput {
    pub mpn: String,
    pub manufacturer: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: String,
    #[serde(default = "default_lifecycle")]
    pub lifecycle_stage: String,
    #[serde(default = "partpilot_engine::base_rating")]
    pub score: i32,
    #[serde(default)]
    pub country_of_origin: String,
    #[serde(default)]
    pub unit_price: f64,
    #[serde(default = "default_compliance")]
    pub compliance: Value,
    #[serde(default = "default_parameters")]
    pub parameters: Value,
    #[serde(default = "default_qty", alias = "qty")]
    pub total_qty: i32,
}

pub fn default_qty() -> i32 {
    1
}
pub fn default_lifecycle() -> String {
    "unknown".into()
}
pub fn default_parameters() -> Value {
    json!({})
}
pub fn default_compliance() -> Value {
    json!([
        { "standard": "RoHS", "status": "unknown" },
        { "standard": "REACH", "status": "unknown" }
    ])
}
