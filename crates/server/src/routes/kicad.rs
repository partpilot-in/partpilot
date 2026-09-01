use axum::{Json, http::StatusCode};
use serde_json::{Value, json};

use crate::component_metadata::normalize_component_metadata;

pub async fn lookup() -> (StatusCode, Json<Value>) {
    let component_metadata = normalize_component_metadata(json!({
        "commercial": { "lifecycleStatus": "Active" },
        "documentation": {
            "datasheetUrl": "https://www.ti.com/lit/ds/symlink/lm317.pdf"
        }
    }))
    .expect("KiCad fixture metadata must be valid");
    (
        StatusCode::OK,
        Json(json!({
            "mpn": "LM317T",
            "manufacturer": "TEXAS INSTRUMENTS",
            "component_metadata": component_metadata,
            "score": 92,
            "risk_band": "low"
        })),
    )
}
