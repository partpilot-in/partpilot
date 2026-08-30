-- 0002_user_data_and_alternates.sql
-- Alternate part matches, per-user data (watchlist, BOMs, API keys), and
-- source health tracking for the worker's ingestion sweep.

create table if not exists alternates (
    original_id uuid not null references parts(id) on delete cascade,
    alternate_id uuid not null references parts(id) on delete cascade,
    match_kind text not null check (match_kind in ('manufacturer_cross_ref','form_fit_function','same_family')),
    similarity real not null check (similarity between 0 and 1),
    primary key (original_id, alternate_id)
);

create table if not exists watchlist (
    user_id uuid not null references auth.users(id) on delete cascade,
    part_id uuid not null references parts(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, part_id)
);

create table if not exists boms (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text,
    filename text,
    uploaded_at timestamptz not null default now()
);

create table if not exists bom_lines (
    bom_id uuid not null references boms(id) on delete cascade,
    line_no int not null,
    mpn_raw text not null,
    manufacturer_raw text,
    description_raw text,
    matched_part_id uuid references parts(id),
    primary key (bom_id, line_no)
);
create index if not exists bom_lines_matched_part_idx on bom_lines (matched_part_id);

create table if not exists api_keys (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    key_hash text not null unique,
    scopes text[] not null default '{}',
    created_at timestamptz not null default now()
);

create table if not exists source_health (
    source_id int primary key references sources(id),
    last_success_at timestamptz,
    consecutive_failures int not null default 0
);
