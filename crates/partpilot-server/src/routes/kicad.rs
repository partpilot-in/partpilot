use axum::{http::StatusCode, Json};
use serde_json::{json, Value};

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
