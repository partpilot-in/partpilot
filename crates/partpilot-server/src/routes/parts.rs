use axum::{http::StatusCode, Json};
use serde_json::{json, Value};

const PART_ID: &str = "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f";

pub async fn search() -> (StatusCode, Json<Value>) {
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
                "score": 92
            }],
            "next_cursor": null,
            "has_more": false
        })),
    )
}

pub async fn detail() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "id": PART_ID,
            "mpn": "LM317T",
            "manufacturer": "TEXAS INSTRUMENTS",
            "description": "3-terminal adjustable regulator, TO-220",
            "category": "regulator",
            "parameters": {
                "output_current_max_a": 1.5,
                "package": "TO-220",
                "voltage_min_v": 1.25,
                "voltage_max_v": 37
            },
            "reconciled_status": {
                "stage": "active",
                "last_time_buy_date": null,
                "confidence": 0.94,
                "reported_at": "2026-06-30T08:00:00Z"
            },
            "risk": { "value": 0.08, "band": "low" },
            "score": 92
        })),
    )
}

pub async fn history() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "part_id": PART_ID,
            "statuses": [{
                "source": "manufacturer_pcn",
                "stage": "active",
                "confidence": 1.0,
                "reported_at": "2026-06-30T08:00:00Z",
                "raw_payload_ref": "pcn/ti/lm317t-2026-06.pdf"
            }]
        })),
    )
}

pub async fn alternates() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "part_id": PART_ID,
            "alternates": [{
                "id": "b1a2c3d4-0000-4000-8000-000000000000",
                "mpn": "LM317ABCD",
                "manufacturer": "ONSEMI",
                "match_kind": "manufacturer_cross_ref",
                "similarity": 1.0,
                "score": 88
            }]
        })),
    )
}

pub async fn insights() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "part_id": PART_ID,
            "summary": null,
            "sentiment": "insufficient",
            "common_praise": [],
            "common_issues": [],
            "based_on_post_count": 0,
            "generated_at": "2026-07-06T00:00:00Z",
            "citations": []
        })),
    )
}

pub async fn compare() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "parts": [{
                "id": PART_ID,
                "label": "LM317T - Texas Instruments",
                "parameters": {
                    "output_current_max_a": 1.5,
                    "package": "TO-220"
                }
            }]
        })),
    )
}
