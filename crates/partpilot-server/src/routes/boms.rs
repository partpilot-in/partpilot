use std::{
    cmp::Reverse,
    collections::{HashMap, HashSet},
};

use axum::{
    Json,
    body::Body,
    extract::{Extension, FromRequest, Multipart, Path, Query, Request, State},
    http::{StatusCode, header::CONTENT_TYPE},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    auth::UserId,
    error::AppError,
    models::{BomLineDto, BomLineInput, CreateBom, ProjectDto, UpdateBom},
    state::AppState,
};

#[derive(sqlx::FromRow)]
struct ProjectRow {
    id: Uuid,
    name: String,
    part_count: i32,
    uploaded_at: DateTime<Utc>,
    owner: String,
    lowest_score: i32,
}

#[derive(Deserialize)]
pub struct CompareQuery {
    with: Uuid,
}

pub async fn list(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut projects = if let Some(db) = &state.db {
        let rows = sqlx::query_as::<_, ProjectRow>(
            r#"select b.id,
                coalesce(nullif(b.name, ''), 'Untitled') as name,
                count(l.id)::int as part_count,
                b.uploaded_at,
                'You'::text as owner,
                coalesce(min(l.score), 0)::int as lowest_score
               from boms b
               left join partpilot_bom_line_api l on l.bom_id = b.id
              where b.user_id = $1
              group by b.id, b.name, b.uploaded_at
              order by b.uploaded_at desc"#,
        )
        .bind(user_id)
        .fetch_all(db)
        .await?;

        let mut projects = Vec::with_capacity(rows.len());
        for row in rows {
            projects.push(project_from_row(db, row).await?);
        }
        projects
    } else {
        state
            .memory
            .read()
            .await
            .projects
            .values()
            .filter(|(owner, _)| *owner == user_id)
            .map(|(_, project)| project.clone())
            .collect()
    };

    projects.sort_by_key(|project| Reverse(project.uploaded_at));
    Ok(Json(json!({ "data": projects })))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    request: Request,
) -> Result<Response, AppError> {
    let input = extract_create_input(request, &state).await?;
    validate_bom(&input.name, &input.lines)?;

    let project = if let Some(db) = &state.db {
        let mut tx = db.begin().await?;
        let row = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
            "insert into boms (user_id, name, filename) values ($1, $2, $3) returning id, uploaded_at",
        )
        .bind(user_id)
        .bind(clean_name(&input.name))
        .bind(input.filename.as_deref())
        .fetch_one(&mut *tx)
        .await?;
        insert_lines(&mut tx, row.0, &input.lines).await?;
        tx.commit().await?;
        load_project_db(db, user_id, row.0)
            .await?
            .ok_or_else(|| AppError::internal("created project could not be loaded"))?
    } else {
        let id = Uuid::new_v4();
        let project = build_memory_project(id, input.name, input.lines);
        state
            .memory
            .write()
            .await
            .projects
            .insert(id, (user_id, project.clone()));
        project
    };

    Ok((StatusCode::CREATED, Json(project)).into_response())
}

pub async fn detail(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(id): Path<Uuid>,
) -> Result<Json<ProjectDto>, AppError> {
    let project = if let Some(db) = &state.db {
        load_project_db(db, user_id, id).await?
    } else {
        state
            .memory
            .read()
            .await
            .projects
            .get(&id)
            .filter(|(owner, _)| *owner == user_id)
            .map(|(_, project)| project.clone())
    };

    project
        .map(Json)
        .ok_or_else(|| AppError::not_found("project not found"))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateBom>,
) -> Result<Json<ProjectDto>, AppError> {
    if let Some(name) = &input.name
        && name.trim().is_empty()
    {
        return Err(AppError::bad_request("project name cannot be empty"));
    }
    if let Some(lines) = &input.lines {
        validate_lines(lines)?;
    }

    let project = if let Some(db) = &state.db {
        let mut tx = db.begin().await?;
        let result =
            sqlx::query("update boms set name = coalesce($3, name) where id = $1 and user_id = $2")
                .bind(id)
                .bind(user_id)
                .bind(input.name.as_deref().map(clean_name))
                .execute(&mut *tx)
                .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::not_found("project not found"));
        }

        if let Some(lines) = &input.lines {
            sqlx::query("delete from bom_lines where bom_id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            insert_lines(&mut tx, id, lines).await?;
        }
        tx.commit().await?;
        load_project_db(db, user_id, id)
            .await?
            .ok_or_else(|| AppError::not_found("project not found"))?
    } else {
        let mut store = state.memory.write().await;
        let (_, current) = store
            .projects
            .get_mut(&id)
            .filter(|(owner, _)| *owner == user_id)
            .ok_or_else(|| AppError::not_found("project not found"))?;
        if let Some(name) = input.name {
            current.name = clean_name(&name);
        }
        if let Some(lines) = input.lines {
            current.lines = memory_lines(id, lines);
            refresh_project_metrics(current);
        }
        current.clone()
    };

    Ok(Json(project))
}

pub async fn remove(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let removed = if let Some(db) = &state.db {
        sqlx::query("delete from boms where id = $1 and user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(db)
            .await?
            .rows_affected()
            > 0
    } else {
        let mut store = state.memory.write().await;
        if store
            .projects
            .get(&id)
            .is_some_and(|(owner, _)| *owner == user_id)
        {
            store.projects.remove(&id);
            true
        } else {
            false
        }
    };

    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("project not found"))
    }
}

pub async fn compare(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(id): Path<Uuid>,
    Query(query): Query<CompareQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let base = get_project(&state, user_id, id).await?;
    let other = get_project(&state, user_id, query.with).await?;
    let base_by_key: HashMap<String, &BomLineDto> = base
        .lines
        .iter()
        .map(|line| (line_key(line), line))
        .collect();
    let other_by_key: HashMap<String, &BomLineDto> = other
        .lines
        .iter()
        .map(|line| (line_key(line), line))
        .collect();
    let keys: HashSet<_> = base_by_key
        .keys()
        .chain(other_by_key.keys())
        .cloned()
        .collect();
    let mut items = Vec::new();

    for key in keys {
        match (base_by_key.get(&key), other_by_key.get(&key)) {
            (None, Some(line)) => items.push(json!({
                "delta": "added", "change_summary": "Added in comparison BOM.",
                "previous_score": null, "id": line.id, "part_id": line.part_id,
                "line_no": line.line_no, "mpn": line.mpn, "description": line.description,
                "manufacturer": line.manufacturer, "country_of_origin": line.country_of_origin,
                "category": line.category, "qty": line.qty, "unit_price": line.unit_price,
                "compliance": line.compliance, "lifecycle_stage": line.lifecycle_stage, "score": line.score
            })),
            (Some(line), None) => items.push(json!({
                "delta": "removed", "change_summary": "Removed from comparison BOM.",
                "previous_score": line.score, "id": line.id, "part_id": line.part_id,
                "line_no": line.line_no, "mpn": line.mpn, "description": line.description,
                "manufacturer": line.manufacturer, "country_of_origin": line.country_of_origin,
                "category": line.category, "qty": line.qty, "unit_price": line.unit_price,
                "compliance": line.compliance, "lifecycle_stage": line.lifecycle_stage, "score": line.score
            })),
            (Some(before), Some(after)) => {
                let changed = before.qty != after.qty || before.unit_price != after.unit_price
                    || before.lifecycle_stage != after.lifecycle_stage || before.score != after.score
                    || before.description != after.description;
                items.push(json!({
                    "delta": if changed { "changed" } else { "unchanged" },
                    "change_summary": if changed { "Part attributes changed." } else { "No changes." },
                    "previous_score": before.score, "id": after.id, "part_id": after.part_id,
                    "line_no": after.line_no, "mpn": after.mpn, "description": after.description,
                    "manufacturer": after.manufacturer, "country_of_origin": after.country_of_origin,
                    "category": after.category, "qty": after.qty, "unit_price": after.unit_price,
                    "compliance": after.compliance, "lifecycle_stage": after.lifecycle_stage, "score": after.score
                }));
            }
            _ => {}
        }
    }
    items.sort_by_key(|item| item["line_no"].as_i64().unwrap_or_default());
    Ok(Json(json!({ "items": items })))
}

async fn get_project(state: &AppState, user_id: Uuid, id: Uuid) -> Result<ProjectDto, AppError> {
    let project = if let Some(db) = &state.db {
        load_project_db(db, user_id, id).await?
    } else {
        state
            .memory
            .read()
            .await
            .projects
            .get(&id)
            .filter(|(owner, _)| *owner == user_id)
            .map(|(_, project)| project.clone())
    };
    project.ok_or_else(|| AppError::not_found("project not found"))
}

async fn load_project_db(
    db: &PgPool,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<ProjectDto>, AppError> {
    let row = sqlx::query_as::<_, ProjectRow>(
        r#"select b.id, coalesce(nullif(b.name, ''), 'Untitled') as name,
            count(l.id)::int as part_count, b.uploaded_at, 'You'::text as owner,
            coalesce(min(l.score), 0)::int as lowest_score
           from boms b left join partpilot_bom_line_api l on l.bom_id = b.id
          where b.id = $1 and b.user_id = $2
          group by b.id, b.name, b.uploaded_at"#,
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    match row {
        Some(row) => Ok(Some(project_from_row(db, row).await?)),
        None => Ok(None),
    }
}

async fn project_from_row(db: &PgPool, row: ProjectRow) -> Result<ProjectDto, AppError> {
    let lines = sqlx::query_as::<_, BomLineDto>(
        r#"select id, part_id, line_no, mpn, description, manufacturer,
            country_of_origin, category, qty, unit_price::float8 as unit_price,
            compliance, lifecycle_stage, score
           from partpilot_bom_line_api where bom_id = $1 order by line_no"#,
    )
    .bind(row.id)
    .fetch_all(db)
    .await?;
    Ok(ProjectDto {
        id: row.id,
        name: row.name,
        part_count: row.part_count,
        uploaded_at: row.uploaded_at,
        owner: row.owner,
        lowest_score: row.lowest_score,
        lines,
    })
}

async fn insert_lines(
    tx: &mut Transaction<'_, Postgres>,
    bom_id: Uuid,
    lines: &[BomLineInput],
) -> Result<(), AppError> {
    for (index, line) in lines.iter().enumerate() {
        let matched_part_id = line
            .part_id
            .as_deref()
            .and_then(|id| Uuid::parse_str(id).ok());
        sqlx::query(
            r#"insert into bom_lines
               (bom_id, line_no, mpn_raw, manufacturer_raw, description_raw, matched_part_id,
                country_of_origin, category, qty, unit_price, compliance, lifecycle_stage, score)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)"#,
        )
        .bind(bom_id)
        .bind(line.line_no.unwrap_or(index as i32 + 1))
        .bind(line.mpn.trim())
        .bind(nonempty(&line.manufacturer))
        .bind(nonempty(&line.description))
        .bind(matched_part_id)
        .bind(nonempty(&line.country_of_origin))
        .bind(nonempty(&line.category))
        .bind(line.qty.max(1))
        .bind(line.unit_price.max(0.0))
        .bind(&line.compliance)
        .bind(valid_lifecycle(&line.lifecycle_stage))
        .bind(line.score.clamp(0, 100))
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn extract_create_input(
    request: Request<Body>,
    state: &AppState,
) -> Result<CreateBom, AppError> {
    let multipart = request
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("multipart/form-data"));
    if !multipart {
        return Json::<CreateBom>::from_request(request, state)
            .await
            .map(|Json(input)| input)
            .map_err(|error| AppError::bad_request(format!("invalid project body: {error}")));
    }

    let mut form = Multipart::from_request(request, state)
        .await
        .map_err(|error| AppError::bad_request(format!("invalid multipart body: {error}")))?;
    let mut name = None;
    let mut filename = None;
    let mut lines = None;
    let mut csv_bytes = None;
    while let Some(field) = form
        .next_field()
        .await
        .map_err(|error| AppError::bad_request(format!("invalid upload field: {error}")))?
    {
        match field.name().unwrap_or_default() {
            "name" => {
                name = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| AppError::bad_request("invalid project name"))?,
                )
            }
            "lines" => {
                let text = field
                    .text()
                    .await
                    .map_err(|_| AppError::bad_request("invalid BOM lines"))?;
                lines = Some(
                    serde_json::from_str(&text)
                        .map_err(|_| AppError::bad_request("invalid BOM lines JSON"))?,
                );
            }
            "file" => {
                filename = field.file_name().map(str::to_owned);
                csv_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| AppError::bad_request("could not read uploaded BOM"))?,
                );
            }
            _ => {}
        }
    }
    let filename_name = filename
        .as_deref()
        .map(|value| value.rsplit_once('.').map_or(value, |(stem, _)| stem));
    let lines = match lines {
        Some(lines) => lines,
        None => parse_csv_lines(
            csv_bytes
                .as_deref()
                .ok_or_else(|| AppError::bad_request("a BOM file or lines are required"))?,
        )?,
    };
    Ok(CreateBom {
        name: name
            .or(filename_name.map(str::to_owned))
            .unwrap_or_else(|| "Untitled".into()),
        filename,
        lines,
    })
}

fn parse_csv_lines(bytes: &[u8]) -> Result<Vec<BomLineInput>, AppError> {
    let mut reader = csv::ReaderBuilder::new().flexible(true).from_reader(bytes);
    let headers = reader
        .headers()
        .map_err(|_| AppError::bad_request("uploaded CSV has no readable header"))?
        .iter()
        .map(normalize_header)
        .collect::<Vec<_>>();
    let find = |aliases: &[&str]| {
        headers
            .iter()
            .position(|header| aliases.contains(&header.as_str()))
    };
    let mpn = find(&[
        "mpn",
        "part number",
        "manufacturer part number",
        "mfr part number",
    ]);
    let description = find(&["description", "desc"]);
    let manufacturer = find(&["manufacturer", "mfr", "mfg", "vendor"]);
    let qty = find(&["qty", "quantity", "count"]);
    let price = find(&["unit price", "price", "unit cost", "cost"]);
    let country = find(&["country", "country of origin", "coo", "made in"]);
    let category = find(&["category", "type", "part type"]);
    let mut lines = Vec::new();
    for (index, record) in reader.records().enumerate() {
        let record =
            record.map_err(|_| AppError::bad_request("uploaded CSV contains an invalid row"))?;
        let value = |column: Option<usize>| column.and_then(|i| record.get(i)).unwrap_or("").trim();
        let mpn_value = value(mpn);
        let description_value = value(description);
        if mpn_value.is_empty() && description_value.is_empty() {
            continue;
        }
        lines.push(BomLineInput {
            line_no: Some(index as i32 + 1),
            part_id: None,
            mpn: if mpn_value.is_empty() {
                format!("MANUAL-{}", index + 1)
            } else {
                mpn_value.into()
            },
            description: description_value.into(),
            manufacturer: value(manufacturer).into(),
            country_of_origin: value(country).into(),
            category: value(category).into(),
            qty: value(qty).parse().unwrap_or(1),
            unit_price: value(price).parse().unwrap_or(0.0),
            compliance: crate::models::default_compliance(),
            lifecycle_stage: "unknown".into(),
            score: 72,
        });
    }
    Ok(lines)
}

fn build_memory_project(id: Uuid, name: String, lines: Vec<BomLineInput>) -> ProjectDto {
    let mut project = ProjectDto {
        id,
        name: clean_name(&name),
        part_count: 0,
        uploaded_at: Utc::now(),
        owner: "You".into(),
        lowest_score: 0,
        lines: memory_lines(id, lines),
    };
    refresh_project_metrics(&mut project);
    project
}

fn memory_lines(_project_id: Uuid, lines: Vec<BomLineInput>) -> Vec<BomLineDto> {
    lines
        .into_iter()
        .enumerate()
        .map(|(index, line)| {
            let id = Uuid::new_v4();
            BomLineDto {
                id,
                part_id: line
                    .part_id
                    .as_deref()
                    .and_then(|v| Uuid::parse_str(v).ok())
                    .unwrap_or(id),
                line_no: line.line_no.unwrap_or(index as i32 + 1),
                mpn: line.mpn,
                description: fallback(line.description, format!("BOM line {}", index + 1)),
                manufacturer: fallback(line.manufacturer, "Unknown".into()),
                country_of_origin: fallback(line.country_of_origin, "Unknown".into()),
                category: fallback(line.category, "Uncategorized".into()),
                qty: line.qty.max(1),
                unit_price: line.unit_price.max(0.0),
                compliance: line.compliance,
                lifecycle_stage: valid_lifecycle(&line.lifecycle_stage).into(),
                score: line.score.clamp(0, 100),
            }
        })
        .collect()
}

fn refresh_project_metrics(project: &mut ProjectDto) {
    project.part_count = project.lines.len() as i32;
    project.lowest_score = project
        .lines
        .iter()
        .map(|line| line.score)
        .min()
        .unwrap_or(0);
}

fn validate_bom(name: &str, lines: &[BomLineInput]) -> Result<(), AppError> {
    if name.trim().is_empty() {
        return Err(AppError::bad_request("project name cannot be empty"));
    }
    validate_lines(lines)
}

fn validate_lines(lines: &[BomLineInput]) -> Result<(), AppError> {
    if lines.is_empty() {
        return Err(AppError::bad_request(
            "a project must contain at least one BOM line",
        ));
    }
    if lines.iter().any(|line| line.mpn.trim().is_empty()) {
        return Err(AppError::bad_request("every BOM line must have an MPN"));
    }
    Ok(())
}

fn line_key(line: &BomLineDto) -> String {
    format!(
        "{}\0{}",
        line.mpn.to_lowercase(),
        line.manufacturer.to_lowercase()
    )
}
fn clean_name(value: &str) -> String {
    fallback(value.trim().to_owned(), "Untitled".into())
}
fn fallback(value: String, fallback: String) -> String {
    if value.trim().is_empty() {
        fallback
    } else {
        value
    }
}
fn nonempty(value: &str) -> Option<&str> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value.trim())
    }
}
fn normalize_header(value: &str) -> String {
    value.trim().to_lowercase().replace(['_', '-'], " ")
}
fn valid_lifecycle(value: &str) -> &str {
    match value {
        "active" | "nrnd" | "last_time_buy" | "obsolete" | "unknown" => value,
        _ => "unknown",
    }
}
