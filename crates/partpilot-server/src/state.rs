use std::{collections::HashMap, sync::Arc};

use serde_json::json;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    auth::AuthVerifier,
    config::Config,
    models::{MyPartDto, PartDto, PartNoteDto, ProfileDto, ProjectDto},
};

pub const TEST_USER_ID: Uuid = Uuid::from_u128(1);

#[derive(Debug, Default)]
pub struct MemoryStore {
    pub parts: HashMap<Uuid, PartDto>,
    pub projects: HashMap<Uuid, (Uuid, ProjectDto)>,
    pub my_parts: HashMap<Uuid, (Uuid, MyPartDto)>,
    pub part_notes: HashMap<(Uuid, Uuid), PartNoteDto>,
    pub profiles: HashMap<Uuid, ProfileDto>,
}

#[derive(Clone)]
pub struct AppState {
    pub db: Option<PgPool>,
    pub auth: AuthVerifier,
    pub memory: Arc<RwLock<MemoryStore>>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("database_configured", &self.db.is_some())
            .finish_non_exhaustive()
    }
}

impl AppState {
    /// A self-contained state used by route tests and local callers of `router()`.
    pub fn placeholder() -> Self {
        let part_id =
            Uuid::parse_str("8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f").expect("fixture UUID");
        let part = PartDto {
            id: part_id,
            mpn: "LM317T".into(),
            manufacturer: "TEXAS INSTRUMENTS".into(),
            description: "3-terminal adjustable regulator, TO-220".into(),
            category: "regulator".into(),
            lifecycle_stage: "active".into(),
            score: 92,
            country_of_origin: "US".into(),
            unit_price: 0.42,
            compliance: json!([{ "standard": "RoHS", "status": "pass" }]),
            parameters: json!({ "package": "TO-220" }),
            component_metadata: json!({}),
        };
        Self {
            db: None,
            auth: AuthVerifier::disabled(TEST_USER_ID),
            memory: Arc::new(RwLock::new(MemoryStore {
                parts: HashMap::from([(part_id, part)]),
                ..MemoryStore::default()
            })),
        }
    }

    pub async fn from_config(config: &Config) -> anyhow::Result<Self> {
        let db = PgPoolOptions::new()
            .max_connections(config.db_max_connections)
            .connect(&config.database_url)
            .await?;

        sqlx::query("select 1").execute(&db).await?;

        Ok(Self {
            db: Some(db),
            auth: AuthVerifier::supabase(
                config.supabase_jwks_url.clone(),
                config.supabase_url.clone(),
                config.supabase_publishable_key.clone(),
            ),
            memory: Arc::new(RwLock::new(MemoryStore::default())),
        })
    }
}
