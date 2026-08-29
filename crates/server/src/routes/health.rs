use axum::{Json, http::StatusCode};
use serde_json::{Value, json};

pub async fn healthz() -> (StatusCode, Json<Value>) {
    (StatusCode::OK, Json(json!({ "status": "ok", "db": "ok" })))
}
