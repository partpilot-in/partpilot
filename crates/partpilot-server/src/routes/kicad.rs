use axum::{Json, http::StatusCode};
use serde_json::{Value, json};

pub async fn lookup() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "mpn": "LM317T",
            "manufacturer": "TEXAS INSTRUMENTS",
            "lifecycle_stage": "active",
            "score": 92,
            "risk_band": "low"
        })),
    )
}
