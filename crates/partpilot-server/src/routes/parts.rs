use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{error::AppError, models::PartDto, state::AppState};

const PART_ID: &str = "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f";

#[derive(Debug, Default, Deserialize)]
pub struct SearchQuery {
    #[serde(default)]
    q: String,
    category: Option<String>,
    manufacturer: Option<String>,
    lifecycle: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CompareQuery {
    ids: String,
}

pub async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let data = if let Some(db) = &state.db {
        let categories = csv_values(query.category);
        let manufacturers = csv_values(query.manufacturer);
        let lifecycles = csv_values(query.lifecycle);
        sqlx::query_as::<_, PartDto>(
            r#"
            select id, mpn, manufacturer, description, category, score, component_metadata
              from partpilot_part_api
             where ($1 = '' or mpn ilike '%' || $1 || '%' or description ilike '%' || $1 || '%')
               and ($2::text[] is null or category = any($2))
               and ($3::text[] is null or manufacturer = any($3))
               and ($4::text[] is null or (
                    case component_metadata #>> '{commercial,lifecycleStatus}'
                        when 'Active' then 'active'
                        when 'Preview' then 'active'
                        when 'NRND' then 'nrnd'
                        when 'EOL' then 'last_time_buy'
                        when 'Obsolete' then 'obsolete'
                        else 'unknown'
                    end
               ) = any($4))
             order by similarity(mpn, $1) desc, mpn
             limit $5"#,
        )
        .bind(query.q.trim())
        .bind(categories)
        .bind(manufacturers)
        .bind(lifecycles)
        .bind(query.limit.unwrap_or(25).clamp(1, 100))
        .fetch_all(db)
        .await?
    } else {
        let query_text = query.q.to_lowercase();
        state
            .memory
            .read()
            .await
            .parts
            .values()
            .filter(|part| {
                query_text.is_empty()
                    || part.mpn.to_lowercase().contains(&query_text)
                    || part.description.to_lowercase().contains(&query_text)
            })
            .cloned()
            .collect()
    };
    Ok(Json(
        json!({ "data": data, "next_cursor": null, "has_more": false }),
    ))
}

pub async fn detail(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let part = if let Some(db) = &state.db {
        sqlx::query_as::<_, PartDto>(
            r#"
            select id, mpn, manufacturer, description, category, score, component_metadata
              from partpilot_part_api where id = $1"#,
        )
        .bind(id)
        .fetch_optional(db)
        .await?
    } else {
        state.memory.read().await.parts.get(&id).cloned()
    };
    let part = part.ok_or_else(|| AppError::not_found("part not found"))?;
    Ok(Json(json!({
        "id": part.id, "mpn": part.mpn, "manufacturer": part.manufacturer,
        "description": part.description, "category": part.category,
        "component_metadata": part.component_metadata, "score": part.score,
        "reconciled_status": null, "risk": null
    })))
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
                "description": "3-terminal adjustable regulator, TO-220",
                "category": "regulator",
                "component_metadata": {
                    "mechanical": { "packageType": "TO-220" },
                    "environmental": { "rohsCompliant": true },
                    "regulatory": { "countryOfOrigin": "US" },
                    "commercial": {
                        "lifecycleStatus": "Active",
                        "priceBreaks": [{ "quantity": 1, "unitPrice": 0.37 }]
                    }
                },
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

pub async fn compare(
    State(state): State<AppState>,
    Query(query): Query<CompareQuery>,
) -> Result<Json<Value>, AppError> {
    let ids = query
        .ids
        .split(',')
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(Uuid::parse_str)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| AppError::bad_request("ids must be comma-separated UUIDs"))?;
    if ids.is_empty() || ids.len() > 8 {
        return Err(AppError::bad_request("provide between 1 and 8 part ids"));
    }
    let parts = if let Some(db) = &state.db {
        sqlx::query_as::<_, PartDto>(
            r#"
            select id, mpn, manufacturer, description, category, score, component_metadata
              from partpilot_part_api where id = any($1)"#,
        )
        .bind(&ids)
        .fetch_all(db)
        .await?
    } else {
        let store = state.memory.read().await;
        ids.iter()
            .filter_map(|id| store.parts.get(id).cloned())
            .collect()
    };
    let values: Vec<_> = parts
        .into_iter()
        .map(|part| {
            json!({
                "id": part.id, "label": format!("{} - {}", part.mpn, part.manufacturer),
                "component_metadata": part.component_metadata
            })
        })
        .collect();
    Ok(Json(json!({ "parts": values })))
}

fn csv_values(value: Option<String>) -> Option<Vec<String>> {
    value
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .filter(|values: &Vec<String>| !values.is_empty())
}
