use axum::{
    Json,
    extract::{Extension, Path, State},
    http::StatusCode,
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::UserId,
    component_metadata::normalize_component_metadata,
    error::AppError,
    models::{MyPartDto, MyPartInput},
    state::AppState,
};

const SELECT_MY_PART: &str = r#"select id, mpn, manufacturer,
    coalesce(nullif(description, ''), 'Manually added part') as description,
    coalesce(nullif(category, ''), 'Uncategorized') as category,
    score, component_metadata,
    0::int as project_count, 'Manual entry'::text as project_names,
    quantity::int as total_qty, 'manual'::text as source
   from user_parts"#;

pub async fn list(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut parts = if let Some(db) = &state.db {
        sqlx::query_as::<_, MyPartDto>(&format!(
            "{SELECT_MY_PART} where user_id = $1 order by created_at desc"
        ))
        .bind(user_id)
        .fetch_all(db)
        .await?
    } else {
        state
            .memory
            .read()
            .await
            .my_parts
            .values()
            .filter(|(owner, _)| *owner == user_id)
            .map(|(_, part)| part.clone())
            .collect()
    };
    parts.sort_by(|a, b| a.mpn.cmp(&b.mpn));
    Ok(Json(json!({ "data": parts })))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Json(mut input): Json<MyPartInput>,
) -> Result<(StatusCode, Json<MyPartDto>), AppError> {
    normalize_input_metadata(&mut input)?;
    validate(&input)?;
    let part = if let Some(db) = &state.db {
        sqlx::query_as::<_, MyPartDto>(
            r#"insert into user_parts
               (user_id, mpn, manufacturer, description, category, score,
                component_metadata, quantity)
               values ($1,$2,$3,$4,$5,$6,$7,$8)
               returning id, mpn, manufacturer,
                coalesce(nullif(description, ''), 'Manually added part') as description,
                coalesce(nullif(category, ''), 'Uncategorized') as category,
                score, component_metadata,
                0::int as project_count, 'Manual entry'::text as project_names,
                quantity::int as total_qty, 'manual'::text as source"#,
        )
        .bind(user_id)
        .bind(input.mpn.trim())
        .bind(input.manufacturer.trim())
        .bind(clean(&input.description, "Manually added part"))
        .bind(clean(&input.category, "Uncategorized"))
        .bind(input.score.clamp(0, 100))
        .bind(&input.component_metadata)
        .bind(input.total_qty.max(1))
        .fetch_one(db)
        .await
        .map_err(map_insert_error)?
    } else {
        let mut store = state.memory.write().await;
        if store.my_parts.values().any(|(owner, part)| {
            *owner == user_id
                && part.mpn.eq_ignore_ascii_case(input.mpn.trim())
                && part
                    .manufacturer
                    .eq_ignore_ascii_case(input.manufacturer.trim())
        }) {
            return Err(AppError::conflict("this part is already in My Parts"));
        }
        let part = from_input(Uuid::new_v4(), input);
        store.my_parts.insert(part.id, (user_id, part.clone()));
        part
    };
    Ok((StatusCode::CREATED, Json(part)))
}

pub async fn detail(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(id): Path<Uuid>,
) -> Result<Json<MyPartDto>, AppError> {
    let part = if let Some(db) = &state.db {
        sqlx::query_as::<_, MyPartDto>(&format!("{SELECT_MY_PART} where user_id = $1 and id = $2"))
            .bind(user_id)
            .bind(id)
            .fetch_optional(db)
            .await?
    } else {
        state
            .memory
            .read()
            .await
            .my_parts
            .get(&id)
            .filter(|(owner, _)| *owner == user_id)
            .map(|(_, part)| part.clone())
    };
    part.map(Json)
        .ok_or_else(|| AppError::not_found("part not found in My Parts"))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(id): Path<Uuid>,
    Json(mut input): Json<MyPartInput>,
) -> Result<Json<MyPartDto>, AppError> {
    normalize_input_metadata(&mut input)?;
    validate(&input)?;
    let part = if let Some(db) = &state.db {
        sqlx::query_as::<_, MyPartDto>(
            r#"update user_parts set
                mpn=$3, manufacturer=$4, description=$5, category=$6, score=$7,
                component_metadata=$8, quantity=$9, updated_at=now()
               where id=$1 and user_id=$2
               returning id, mpn, manufacturer,
                coalesce(nullif(description, ''), 'Manually added part') as description,
                coalesce(nullif(category, ''), 'Uncategorized') as category,
                score, component_metadata,
                0::int as project_count, 'Manual entry'::text as project_names,
                quantity::int as total_qty, 'manual'::text as source"#,
        )
        .bind(id)
        .bind(user_id)
        .bind(input.mpn.trim())
        .bind(input.manufacturer.trim())
        .bind(clean(&input.description, "Manually added part"))
        .bind(clean(&input.category, "Uncategorized"))
        .bind(input.score.clamp(0, 100))
        .bind(&input.component_metadata)
        .bind(input.total_qty.max(1))
        .fetch_optional(db)
        .await
        .map_err(map_insert_error)?
        .ok_or_else(|| AppError::not_found("part not found in My Parts"))?
    } else {
        let mut store = state.memory.write().await;
        let owner = store
            .my_parts
            .get(&id)
            .map(|(owner, _)| *owner)
            .ok_or_else(|| AppError::not_found("part not found in My Parts"))?;
        if owner != user_id {
            return Err(AppError::not_found("part not found in My Parts"));
        }
        let part = from_input(id, input);
        store.my_parts.insert(id, (user_id, part.clone()));
        part
    };
    Ok(Json(part))
}

pub async fn remove(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let removed = if let Some(db) = &state.db {
        sqlx::query("delete from user_parts where id=$1 and user_id=$2")
            .bind(id)
            .bind(user_id)
            .execute(db)
            .await?
            .rows_affected()
            > 0
    } else {
        let mut store = state.memory.write().await;
        if store
            .my_parts
            .get(&id)
            .is_some_and(|(owner, _)| *owner == user_id)
        {
            store.my_parts.remove(&id);
            true
        } else {
            false
        }
    };
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("part not found in My Parts"))
    }
}

fn from_input(id: Uuid, input: MyPartInput) -> MyPartDto {
    MyPartDto {
        id,
        mpn: input.mpn.trim().into(),
        manufacturer: input.manufacturer.trim().into(),
        description: clean(&input.description, "Manually added part"),
        category: clean(&input.category, "Uncategorized"),
        score: input.score.clamp(0, 100),
        component_metadata: input.component_metadata,
        project_count: 0,
        project_names: "Manual entry".into(),
        total_qty: input.total_qty.max(1),
        source: "manual".into(),
    }
}

fn validate(input: &MyPartInput) -> Result<(), AppError> {
    if input.mpn.trim().is_empty() {
        return Err(AppError::bad_request("MPN is required"));
    }
    if input.manufacturer.trim().is_empty() {
        return Err(AppError::bad_request("manufacturer is required"));
    }
    Ok(())
}

fn normalize_input_metadata(input: &mut MyPartInput) -> Result<(), AppError> {
    input.component_metadata = normalize_component_metadata(input.component_metadata.take())
        .map_err(AppError::bad_request)?;
    Ok(())
}

fn clean(value: &str, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.into()
    } else {
        value.trim().into()
    }
}

fn map_insert_error(error: sqlx::Error) -> AppError {
    if error
        .as_database_error()
        .and_then(|error| error.code())
        .as_deref()
        == Some("23505")
    {
        AppError::conflict("this part is already in My Parts")
    } else {
        error.into()
    }
}
