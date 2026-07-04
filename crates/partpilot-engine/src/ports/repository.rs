use crate::domain::{AlternatePart, LifecycleStatus, NormalizedMpn, Part, PartId};

#[async_trait::async_trait]
pub trait PartRepository: Send + Sync {
    async fn upsert_part(&self, part: &Part) -> Result<PartId, RepoError>;
    async fn find_by_mpn(&self, mpn: &NormalizedMpn) -> Result<Option<Part>, RepoError>;
    async fn search(&self, query: &str, limit: u32) -> Result<Vec<Part>, RepoError>;
    async fn insert_status(&self, status: &LifecycleStatus) -> Result<(), RepoError>;
    async fn latest_statuses(&self, part_id: &PartId) -> Result<Vec<LifecycleStatus>, RepoError>;
    async fn upsert_alternate(&self, alt: &AlternatePart) -> Result<(), RepoError>;
    async fn alternates_for(&self, part_id: &PartId) -> Result<Vec<AlternatePart>, RepoError>;
    async fn watchlist_parts_for_user(&self, user_id: uuid::Uuid) -> Result<Vec<Part>, RepoError>;
    async fn add_to_watchlist(
        &self,
        user_id: uuid::Uuid,
        part_id: &PartId,
    ) -> Result<(), RepoError>;
    async fn remove_from_watchlist(
        &self,
        user_id: uuid::Uuid,
        part_id: &PartId,
    ) -> Result<(), RepoError>;
    async fn all_parts_paginated(
        &self,
        cursor: Option<PartId>,
        limit: u32,
    ) -> Result<Vec<Part>, RepoError>;
}

#[derive(Debug, thiserror::Error)]
pub enum RepoError {
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("storage error: {0}")]
    Storage(String),
}
