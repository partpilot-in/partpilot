-- 0001_init_core_schema.sql
-- Core reference data: sources, parts, and reconciled/raw lifecycle statuses.

create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

create table sources (
    id serial primary key,
    name text not null unique,        -- 'digikey', 'mouser', 'octopart', 'manufacturer_pcn'
    trust_weight real not null default 0.5
);

create table parts (
    id uuid primary key default gen_random_uuid(),
    mpn text not null,
    manufacturer text not null,
    description text,
    category text,
    parameters jsonb not null default '{}',   -- PartParameters HashMap, category-agnostic
    created_at timestamptz not null default now(),
    unique (mpn, manufacturer)
);
create index parts_mpn_trgm on parts using gin (mpn gin_trgm_ops);
create index parts_description_trgm on parts using gin (description gin_trgm_ops);
create index parts_category_idx on parts (category);

create table lifecycle_statuses (
    id bigserial primary key,
    part_id uuid not null references parts(id) on delete cascade,
    source_id int not null references sources(id),
    stage text not null check (stage in ('active','nrnd','last_time_buy','obsolete','unknown')),
    last_time_buy_date date,
    confidence real not null check (confidence between 0 and 1),
    reported_at timestamptz not null,
    raw_payload_ref text
);
create index lifecycle_part_idx on lifecycle_statuses (part_id, reported_at desc);
create index lifecycle_source_idx on lifecycle_statuses (source_id, reported_at desc);
