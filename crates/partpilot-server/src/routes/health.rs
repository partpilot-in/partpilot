use axum::{http::StatusCode, Json};
use serde_json::{json, Value};

pub async fn healthz() -> (StatusCode, Json<Value>) {
    (StatusCode::OK, Json(json!({ "status": "ok", "db": "ok" })))
}
