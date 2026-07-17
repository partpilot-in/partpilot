use axum::{http::StatusCode, Json};
use serde_json::{json, Value};

const BOM_ID: &str = "d4e5f6a7-0000-4000-8000-000000000000";

pub async fn create() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "id": BOM_ID,
            "name": "Placeholder BOM",
            "uploaded_at": "2026-07-13T10:00:00Z",
            "line_count": 0,
            "unmatched_line_count": 0
        })),
    )
}

pub async fn detail() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "id": BOM_ID,
            "name": "Placeholder BOM",
            "uploaded_at": "2026-07-13T10:00:00Z",
            "lines": []
        })),
    )
}

pub async fn compare() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "base_bom_id": BOM_ID,
            "compare_bom_id": "e5f6a7b8-0000-4000-8000-000000000000",
            "changes": []
        })),
    )
}
