use axum::{Json, http::StatusCode};
use serde_json::{Value, json};

const PART_ID: &str = "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f";

pub async fn list() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "data": [{
                "id": PART_ID,
                "mpn": "LM317T",
                "manufacturer": "TEXAS INSTRUMENTS",
                "description": "3-terminal adjustable regulator, TO-220",
                "category": "regulator",
                "lifecycle_stage": "active",
                "score": 92,
                "country_of_origin": "US",
                "unit_price": 0.42,
                "compliance": [{ "standard": "RoHS", "status": "pass" }],
                "parameters": { "package": "TO-220" },
                "component_metadata": {},
                "created_at": "2026-06-01T00:00:00Z"
            }]
        })),
    )
}

pub async fn add() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "part_id": PART_ID,
            "created_at": "2026-07-13T10:00:00Z"
        })),
    )
}

pub async fn remove() -> (StatusCode, Json<Value>) {
    (StatusCode::OK, Json(json!({ "removed": true })))
}
