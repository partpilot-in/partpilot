use axum::{
    Json,
    extract::{Extension, Path, State},
};
use uuid::Uuid;

use crate::{
    auth::UserId,
    error::AppError,
    models::{PartNoteDto, UpdatePartNoteInput},
    state::AppState,
};

const MAX_NOTE_CHARS: usize = 20_000;

pub async fn detail(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(part_id): Path<Uuid>,
) -> Result<Json<PartNoteDto>, AppError> {
    let note = if let Some(db) = &state.db {
        sqlx::query_as::<_, PartNoteDto>(
            r#"select part_id, user_note as note, partpilot_points
                 from part_notes
                where user_id = $1 and part_id = $2"#,
        )
        .bind(user_id)
        .bind(part_id)
        .fetch_optional(db)
        .await?
    } else {
        state
            .memory
            .read()
            .await
            .part_notes
            .get(&(user_id, part_id))
            .cloned()
    }
    .unwrap_or_else(|| PartNoteDto::empty(part_id));

    Ok(Json(note))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(UserId(user_id)): Extension<UserId>,
    Path(part_id): Path<Uuid>,
    Json(input): Json<UpdatePartNoteInput>,
) -> Result<Json<PartNoteDto>, AppError> {
    let note = input.note.trim().to_owned();
    if note.chars().count() > MAX_NOTE_CHARS {
        return Err(AppError::bad_request(
            "note must be 20,000 characters or fewer",
        ));
    }

    let saved = if let Some(db) = &state.db {
        sqlx::query_as::<_, PartNoteDto>(
            r#"insert into part_notes (user_id, part_id, user_note)
               values ($1, $2, $3)
               on conflict (user_id, part_id) do update
                   set user_note = excluded.user_note, updated_at = now()
               returning part_id, user_note as note, partpilot_points"#,
        )
        .bind(user_id)
        .bind(part_id)
        .bind(&note)
        .fetch_one(db)
        .await?
    } else {
        let mut store = state.memory.write().await;
        let mut saved = store
            .part_notes
            .get(&(user_id, part_id))
            .cloned()
            .unwrap_or_else(|| PartNoteDto::empty(part_id));
        saved.note = note;
        store.part_notes.insert((user_id, part_id), saved.clone());
        saved
    };

    Ok(Json(saved))
}
