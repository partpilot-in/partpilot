use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use engine::{
    LifecycleStage, PartSnapshot,
    normalize::{AliasTable, normalize_manufacturer, normalize_mpn},
    ports::ConnectorError,
};

use crate::{error::AppError, models::PartDto, state::AppState};

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
    let mut data = load_search_results(&state, &query).await?;
    if data.is_empty()
        && let Some(snapshot) = fetch_digikey_on_miss(&state, &query).await?
    {
        let part_id = persist_snapshot(&state, &snapshot).await?;
        data = load_search_results(&state, &query).await?;
        if data.is_empty()
            && let Some(part) = load_part_by_id(&state, part_id).await?
        {
            data.push(part);
        }
    }
    Ok(Json(
        json!({ "data": data, "next_cursor": null, "has_more": false }),
    ))
}

async fn load_part_by_id(state: &AppState, id: Uuid) -> Result<Option<PartDto>, AppError> {
    if let Some(db) = &state.db {
        Ok(sqlx::query_as::<_, PartDto>(
            r#"
            select id, mpn, manufacturer, description, category, score, component_metadata
              from partpilot_part_api where id = $1"#,
        )
        .bind(id)
        .fetch_optional(db)
        .await?)
    } else {
        Ok(state.memory.read().await.parts.get(&id).cloned())
    }
}

async fn load_search_results(
    state: &AppState,
    query: &SearchQuery,
) -> Result<Vec<PartDto>, AppError> {
    if let Some(db) = &state.db {
        let categories = csv_values(query.category.clone());
        let manufacturers = manufacturer_values(query.manufacturer.clone());
        let lifecycles = csv_values(query.lifecycle.clone());
        Ok(sqlx::query_as::<_, PartDto>(
            r#"
            select id, mpn, manufacturer, description, category, score, component_metadata
              from partpilot_part_api
             where ($1 = '' or mpn ilike '%' || $1 || '%' or mpn ilike '%' || $6 || '%'
                    or description ilike '%' || $1 || '%'
                    or exists (
                        select 1
                          from jsonb_array_elements_text(
                              coalesce(
                                  component_metadata #> '{identification,alternatePartNumbers}',
                                  '[]'::jsonb
                              )
                          ) as alternate(value)
                         where lower(alternate.value) = lower($1)
                            or regexp_replace(upper(alternate.value), '[^A-Z0-9]', '', 'g') = $6
                    ))
               and ($2::text[] is null or lower(category) = any(
                    array(select lower(value) from unnest($2) as value)
               ))
               and ($3::text[] is null or lower(manufacturer) = any(
                    array(select lower(value) from unnest($3) as value)
               ))
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
             order by greatest(similarity(mpn, $1), similarity(mpn, $6)) desc, mpn
             limit $5"#,
        )
        .bind(query.q.trim())
        .bind(categories)
        .bind(manufacturers)
        .bind(lifecycles)
        .bind(query.limit.unwrap_or(25).clamp(1, 100))
        .bind(normalize_mpn(query.q.trim()).0)
        .fetch_all(db)
        .await?)
    } else {
        let query_text = query.q.to_lowercase();
        let normalized_query = normalize_mpn(&query.q).0.to_lowercase();
        let categories = csv_values(query.category.clone());
        let manufacturers = manufacturer_values(query.manufacturer.clone());
        let lifecycles = csv_values(query.lifecycle.clone());
        let mut parts: Vec<_> = state
            .memory
            .read()
            .await
            .parts
            .values()
            .filter(|part| {
                (query_text.is_empty()
                    || part.mpn.to_lowercase().contains(&query_text)
                    || part.mpn.to_lowercase().contains(&normalized_query)
                    || part.description.to_lowercase().contains(&query_text)
                    || metadata_alternate_part_numbers(&part.component_metadata).any(|alternate| {
                        alternate.to_lowercase() == query_text
                            || normalize_mpn(alternate).0.to_lowercase() == normalized_query
                    }))
                    && categories
                        .as_ref()
                        .is_none_or(|values| contains_case_insensitive(values, &part.category))
                    && manufacturers
                        .as_ref()
                        .is_none_or(|values| contains_case_insensitive(values, &part.manufacturer))
                    && lifecycles.as_ref().is_none_or(|values| {
                        values.contains(&metadata_lifecycle(&part.component_metadata).to_owned())
                    })
            })
            .cloned()
            .collect();
        parts.sort_by(|left, right| left.mpn.cmp(&right.mpn));
        parts.truncate(query.limit.unwrap_or(25).clamp(1, 100) as usize);
        Ok(parts)
    }
}

fn metadata_alternate_part_numbers(metadata: &Value) -> impl Iterator<Item = &str> {
    metadata
        .pointer("/identification/alternatePartNumbers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
}

async fn fetch_digikey_on_miss(
    state: &AppState,
    query: &SearchQuery,
) -> Result<Option<PartSnapshot>, AppError> {
    let Some(connector) = &state.digikey else {
        return Ok(None);
    };
    let query_text = query.q.trim();
    if query_text.is_empty() {
        return Ok(None);
    }
    let requested_manufacturers = csv_values(query.manufacturer.clone()).unwrap_or_default();
    if requested_manufacturers.len() > 1 {
        return Ok(None);
    }
    let mpn = normalize_mpn(query_text);
    if mpn.0.is_empty() {
        return Ok(None);
    }
    let manufacturer = requested_manufacturers
        .first()
        .map(|value| normalize_manufacturer(value, &AliasTable::seed_default()))
        .unwrap_or_else(|| engine::NormalizedManufacturer(String::new()));

    match connector
        .fetch_part_by_query(query_text, &manufacturer)
        .await
    {
        Ok(snapshot) => Ok(snapshot),
        Err(ConnectorError::NotFound) => Ok(None),
        Err(error) => {
            tracing::warn!(%error, mpn = %mpn.0, "DigiKey enrichment failed");
            Err(AppError::new(
                StatusCode::BAD_GATEWAY,
                "DigiKey enrichment failed",
            ))
        }
    }
}

async fn persist_snapshot(state: &AppState, snapshot: &PartSnapshot) -> Result<Uuid, AppError> {
    if let Some(db) = &state.db {
        let status = &snapshot.lifecycle_status;
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"
            select upsert_source_part_snapshot(
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11
            )"#,
        )
        .bind("digikey")
        .bind(&snapshot.part.mpn.0)
        .bind(&snapshot.part.manufacturer.0)
        .bind(snapshot.part.description.as_deref())
        .bind(snapshot.part.category.as_deref())
        .bind(&snapshot.part.component_metadata)
        .bind(stage_db_value(status.stage))
        .bind(status.last_time_buy_date)
        .bind(status.confidence.0)
        .bind(status.reported_at)
        .bind(status.raw_payload_ref.as_deref())
        .fetch_one(db)
        .await?;
        Ok(id)
    } else {
        let id = snapshot.part.id.0;
        state.memory.write().await.parts.insert(
            id,
            PartDto {
                id,
                mpn: snapshot.part.mpn.0.clone(),
                manufacturer: snapshot.part.manufacturer.0.clone(),
                description: snapshot
                    .part
                    .description
                    .clone()
                    .unwrap_or_else(|| "No description available".to_owned()),
                category: snapshot
                    .part
                    .category
                    .clone()
                    .unwrap_or_else(|| "Uncategorized".to_owned()),
                score: engine::base_rating(),
                component_metadata: snapshot.part.component_metadata.clone(),
            },
        );
        Ok(id)
    }
}

const fn stage_db_value(stage: LifecycleStage) -> &'static str {
    match stage {
        LifecycleStage::Active => "active",
        LifecycleStage::Nrnd => "nrnd",
        LifecycleStage::LastTimeBuy => "last_time_buy",
        LifecycleStage::Obsolete => "obsolete",
        LifecycleStage::Unknown => "unknown",
    }
}

fn metadata_lifecycle(metadata: &Value) -> &'static str {
    match metadata
        .pointer("/commercial/lifecycleStatus")
        .and_then(Value::as_str)
    {
        Some("Active" | "Preview") => "active",
        Some("NRND") => "nrnd",
        Some("EOL") => "last_time_buy",
        Some("Obsolete") => "obsolete",
        _ => "unknown",
    }
}

fn contains_case_insensitive(values: &[String], candidate: &str) -> bool {
    values
        .iter()
        .any(|value| value.eq_ignore_ascii_case(candidate))
}

fn manufacturer_values(raw: Option<String>) -> Option<Vec<String>> {
    let aliases = AliasTable::seed_default();
    csv_values(raw).map(|values| {
        values
            .into_iter()
            .map(|value| normalize_manufacturer(&value, &aliases).0)
            .collect()
    })
}

pub async fn detail(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let part = load_part_by_id(&state, id).await?;
    let part = part.ok_or_else(|| AppError::not_found("part not found"))?;
    Ok(Json(json!({
        "id": part.id, "mpn": part.mpn, "manufacturer": part.manufacturer,
        "description": part.description, "category": part.category,
        "component_metadata": part.component_metadata, "score": part.score,
        "reconciled_status": null, "risk": null
    })))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct LifecycleHistoryDto {
    source: String,
    stage: String,
    last_time_buy_date: Option<NaiveDate>,
    confidence: f32,
    reported_at: DateTime<Utc>,
    raw_payload_ref: Option<String>,
}

pub async fn history(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let statuses = if let Some(db) = &state.db {
        sqlx::query_as::<_, LifecycleHistoryDto>(
            r#"
            select s.name as source, ls.stage, ls.last_time_buy_date,
                   ls.confidence, ls.reported_at, ls.raw_payload_ref
              from lifecycle_statuses ls
              join sources s on s.id = ls.source_id
             where ls.part_id = $1
             order by ls.reported_at desc"#,
        )
        .bind(id)
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };
    Ok(Json(json!({ "part_id": id, "statuses": statuses })))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AlternatePartDto {
    id: Uuid,
    mpn: String,
    manufacturer: String,
    description: String,
    category: String,
    score: i32,
    component_metadata: Value,
    match_kind: String,
    similarity: f32,
}

pub async fn alternates(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let alternates = if let Some(db) = &state.db {
        sqlx::query_as::<_, AlternatePartDto>(
            r#"
            select p.id, p.mpn, p.manufacturer, p.description, p.category,
                   p.score, p.component_metadata, a.match_kind, a.similarity
              from alternates a
              join partpilot_part_api p on p.id = a.alternate_id
             where a.original_id = $1
             order by a.similarity desc, p.mpn"#,
        )
        .bind(id)
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };
    Ok(Json(json!({ "part_id": id, "alternates": alternates })))
}

pub async fn insights(Path(id): Path<Uuid>) -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "part_id": id,
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
