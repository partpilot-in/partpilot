-- 0000_auth_schema_setup.sql
create schema if not exists auth;
create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    phone text,
    raw_user_meta_data jsonb default '{}',
    created_at timestamptz default now()
);

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

create or replace function auth.uid() returns uuid as $$
  select null::uuid;
$$ language sql stable;

-- 0001_init_core_schema.sql
-- Core reference data: sources, parts, and reconciled/raw lifecycle statuses.

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create table if not exists sources (
    id serial primary key,
    name text not null unique,        -- 'digikey', 'mouser', 'octopart', 'manufacturer_pcn'
    trust_weight real not null default 0.5
);

create table if not exists parts (
    id uuid primary key default gen_random_uuid(),
    mpn text not null,
    manufacturer text not null,
    description text,
    category text,
    parameters jsonb not null default '{}',   -- PartParameters HashMap, category-agnostic
    created_at timestamptz not null default now(),
    unique (mpn, manufacturer)
);
create index if not exists parts_mpn_trgm on parts using gin (mpn gin_trgm_ops);
create index if not exists parts_description_trgm on parts using gin (description gin_trgm_ops);
create index if not exists parts_category_idx on parts (category);

create table if not exists lifecycle_statuses (
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
-- 0002_user_data_and_alternates.sql
-- Alternate part matches, per-user data (watchlist, BOMs, API keys), and
-- source health tracking for the worker's ingestion sweep.

create table alternates (
    original_id uuid not null references parts(id) on delete cascade,
    alternate_id uuid not null references parts(id) on delete cascade,
    match_kind text not null check (match_kind in ('manufacturer_cross_ref','form_fit_function','same_family')),
    similarity real not null check (similarity between 0 and 1),
    primary key (original_id, alternate_id)
);

create table watchlist (
    user_id uuid not null references auth.users(id) on delete cascade,
    part_id uuid not null references parts(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, part_id)
);

create table boms (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text,
    filename text,
    uploaded_at timestamptz not null default now()
);

create table bom_lines (
    bom_id uuid not null references boms(id) on delete cascade,
    line_no int not null,
    mpn_raw text not null,
    manufacturer_raw text,
    description_raw text,
    matched_part_id uuid references parts(id),
    primary key (bom_id, line_no)
);
create index bom_lines_matched_part_idx on bom_lines (matched_part_id);

create table api_keys (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    key_hash text not null unique,
    scopes text[] not null default '{}',
    created_at timestamptz not null default now()
);

create table source_health (
    source_id int primary key references sources(id),
    last_success_at timestamptz,
    consecutive_failures int not null default 0
);
-- 0003_rls_policies.sql
-- Row Level Security: user-owned tables are locked to their owner; reference
-- data (parts, lifecycle_statuses, alternates, sources) is public-read, with
-- writes restricted to the service role (server/worker bypass RLS by design
-- when connecting with the service role key — never expose that key to the
-- client).

alter table sources enable row level security;
create policy "public read sources" on sources for select using (true);

alter table watchlist enable row level security;
create policy "users manage own watchlist" on watchlist
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table boms enable row level security;
create policy "users manage own boms" on boms
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table bom_lines enable row level security;
create policy "users manage own bom lines" on bom_lines
    for all using (
        exists (select 1 from boms where boms.id = bom_lines.bom_id and boms.user_id = auth.uid())
    ) with check (
        exists (select 1 from boms where boms.id = bom_lines.bom_id and boms.user_id = auth.uid())
    );

alter table api_keys enable row level security;
create policy "users manage own api keys" on api_keys
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table parts enable row level security;
create policy "public read parts" on parts for select using (true);

alter table lifecycle_statuses enable row level security;
create policy "public read lifecycle" on lifecycle_statuses for select using (true);

alter table alternates enable row level security;
create policy "public read alternates" on alternates for select using (true);

alter table source_health enable row level security;
-- 0004_bom_line_qty_price.sql
-- Adds the Qty and Price columns needed by the client's BOM table.
-- Portability: pure vanilla Postgres, no Supabase-specific types or schemas.

alter table bom_lines
    add column qty integer not null default 1,
    add column unit_price numeric(12,4);
-- 0005_compliance_and_origin.sql
-- Adds "Made In" to parts, and compliance status as rows (not fixed columns)
-- so new standards (RoHS, REACH, conflict minerals, ...) don't need a
-- migration to add later.
-- Portability: pure vanilla Postgres. RLS policy below uses `using (true)`
-- (public read) only — no auth.uid() or auth schema dependency, so this
-- migration runs unchanged on plain Postgres.

alter table parts
    add column country_of_origin text;

create table part_compliance (
    part_id uuid not null references parts(id) on delete cascade,
    standard text not null,           -- 'rohs', 'reach', 'conflict_minerals', ...
    status text not null check (status in ('pass','fail','unknown')),
    primary key (part_id, standard)
);

alter table part_compliance enable row level security;
create policy "public read part_compliance" on part_compliance for select using (true);
-- 0006_community_insights.sql
-- Community Pulse: synthesized forum digest per part, with citations.
-- Populated by worker's insight-sweep mode via the
-- community-pulse pipeline.
-- Portability: pure vanilla Postgres. RLS policies below are public-read
-- only (`using (true)`) — no auth.uid() or auth schema dependency.

create table community_insights (
    part_id uuid primary key references parts(id) on delete cascade,
    summary text,
    sentiment text not null check (sentiment in ('positive','mixed','negative','insufficient')),
    common_praise jsonb not null default '[]',
    common_issues jsonb not null default '[]',
    based_on_post_count int not null default 0,
    generated_at timestamptz not null
);

create table community_insight_citations (
    id bigserial primary key,
    part_id uuid not null references community_insights(part_id) on delete cascade,
    source text not null,
    url text not null,
    title text not null,
    posted_at timestamptz,
    engagement int
);
create index community_insight_citations_part_idx on community_insight_citations (part_id);

alter table community_insights enable row level security;
create policy "public read community_insights" on community_insights for select using (true);

alter table community_insight_citations enable row level security;
create policy "public read community_insight_citations" on community_insight_citations for select using (true);
-- 0007_frontend_contract_views.sql
-- Aligns the database contract with the current React client shapes:
-- Part, BomLine, Project, and Important parts.

alter table parts
    add column if not exists unit_price numeric(12,4) not null default 0,
    add column if not exists score integer not null default 72;

update parts
set
    description = coalesce(nullif(description, ''), 'No description available'),
    category = coalesce(nullif(category, ''), 'Uncategorized'),
    country_of_origin = coalesce(nullif(country_of_origin, ''), 'Unknown')
where description is null
   or description = ''
   or category is null
   or category = ''
   or country_of_origin is null
   or country_of_origin = '';

alter table parts
    alter column description set default 'No description available',
    alter column category set default 'Uncategorized',
    alter column country_of_origin set default 'Unknown',
    alter column country_of_origin set not null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'parts_score_range') then
        alter table parts add constraint parts_score_range check (score between 0 and 100);
    end if;
end $$;

alter table bom_lines
    add column if not exists id uuid default gen_random_uuid(),
    add column if not exists country_of_origin text,
    add column if not exists category text,
    add column if not exists compliance jsonb not null default '[]',
    add column if not exists lifecycle_stage text,
    add column if not exists score integer;

update bom_lines set id = gen_random_uuid() where id is null;
update bom_lines set unit_price = 0 where unit_price is null;
update bom_lines set qty = 1 where qty is null or qty < 1;

alter table bom_lines
    alter column id set not null,
    alter column unit_price set default 0,
    alter column unit_price set not null,
    alter column qty set default 1,
    alter column qty set not null;

create unique index if not exists bom_lines_id_key on bom_lines (id);

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'bom_lines_qty_positive') then
        alter table bom_lines add constraint bom_lines_qty_positive check (qty > 0);
    end if;

    if not exists (select 1 from pg_constraint where conname = 'bom_lines_score_range') then
        alter table bom_lines add constraint bom_lines_score_range check (score is null or score between 0 and 100);
    end if;

    if not exists (select 1 from pg_constraint where conname = 'bom_lines_lifecycle_stage_valid') then
        alter table bom_lines add constraint bom_lines_lifecycle_stage_valid
            check (lifecycle_stage is null or lifecycle_stage in ('active','nrnd','last_time_buy','obsolete','unknown'));
    end if;
end $$;

create table if not exists important_parts (
    user_id uuid not null references auth.users(id) on delete cascade,
    part_id uuid not null references parts(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, part_id)
);

insert into important_parts (user_id, part_id, created_at)
select user_id, part_id, created_at
from watchlist
on conflict (user_id, part_id) do nothing;

alter table important_parts enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'important_parts'
          and policyname = 'users manage own important parts'
    ) then
        create policy "users manage own important parts" on important_parts
            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;
end $$;

create or replace view partpilot_part_api as
select
    p.id,
    p.mpn,
    p.manufacturer,
    coalesce(nullif(p.description, ''), 'No description available') as description,
    coalesce(nullif(p.category, ''), 'Uncategorized') as category,
    p.parameters,
    coalesce(latest.stage, 'unknown') as lifecycle_stage,
    p.score,
    coalesce(nullif(p.country_of_origin, ''), 'Unknown') as country_of_origin,
    p.unit_price,
    coalesce(compliance.rows, '[]'::jsonb) as compliance
from parts p
left join lateral (
    select stage
    from lifecycle_statuses ls
    where ls.part_id = p.id
    order by ls.reported_at desc
    limit 1
) latest on true
left join lateral (
    select jsonb_agg(
        jsonb_build_object('standard', pc.standard, 'status', pc.status)
        order by pc.standard
    ) as rows
    from part_compliance pc
    where pc.part_id = p.id
) compliance on true;

create or replace view partpilot_bom_line_api as
select
    bl.id,
    bl.bom_id,
    coalesce(bl.matched_part_id, bl.id) as part_id,
    bl.line_no,
    coalesce(nullif(bl.mpn_raw, ''), p.mpn, 'UNKNOWN-' || bl.line_no::text) as mpn,
    coalesce(nullif(bl.description_raw, ''), nullif(p.description, ''), 'BOM line ' || bl.line_no::text) as description,
    coalesce(nullif(bl.manufacturer_raw, ''), p.manufacturer, 'Unknown') as manufacturer,
    coalesce(nullif(bl.country_of_origin, ''), nullif(p.country_of_origin, ''), 'Unknown') as country_of_origin,
    coalesce(nullif(bl.category, ''), nullif(p.category, ''), 'Uncategorized') as category,
    bl.qty,
    coalesce(bl.unit_price, p.unit_price, 0) as unit_price,
    case
        when jsonb_typeof(bl.compliance) = 'array' then
            case
                when jsonb_array_length(bl.compliance) > 0 then bl.compliance
                else coalesce(compliance.rows, '[]'::jsonb)
            end
        else coalesce(compliance.rows, '[]'::jsonb)
    end as compliance,
    coalesce(bl.lifecycle_stage, latest.stage, 'unknown') as lifecycle_stage,
    coalesce(bl.score, p.score, 72) as score
from bom_lines bl
left join parts p on p.id = bl.matched_part_id
left join lateral (
    select stage
    from lifecycle_statuses ls
    where ls.part_id = p.id
    order by ls.reported_at desc
    limit 1
) latest on true
left join lateral (
    select jsonb_agg(
        jsonb_build_object('standard', pc.standard, 'status', pc.status)
        order by pc.standard
    ) as rows
    from part_compliance pc
    where pc.part_id = p.id
) compliance on true;

create or replace view partpilot_project_api as
select
    b.id,
    coalesce(nullif(b.name, ''), 'Untitled') as name,
    count(l.id)::int as part_count,
    b.uploaded_at,
    'You'::text as owner,
    coalesce(min(l.score), 0)::int as lowest_score
from boms b
left join partpilot_bom_line_api l on l.bom_id = b.id
group by b.id, b.name, b.uploaded_at;

create or replace view partpilot_important_part_api as
select
    ip.user_id,
    ip.created_at,
    p.id,
    p.mpn,
    p.manufacturer,
    p.description,
    p.category,
    p.parameters,
    p.lifecycle_stage,
    p.score,
    p.country_of_origin,
    p.unit_price,
    p.compliance
from important_parts ip
join partpilot_part_api p on p.id = ip.part_id;

grant select on partpilot_part_api to anon, authenticated;
grant select on partpilot_bom_line_api to authenticated;
grant select on partpilot_project_api to authenticated;
grant select on partpilot_important_part_api to authenticated;
grant select, insert, update, delete on important_parts to authenticated;
-- Server-backed manually managed inventory for the My Parts page.

create table user_parts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    mpn text not null,
    manufacturer text not null,
    description text not null default 'Manually added part',
    category text not null default 'Uncategorized',
    lifecycle_stage text not null default 'unknown'
        check (lifecycle_stage in ('active','nrnd','last_time_buy','obsolete','unknown')),
    score integer not null default 72 check (score between 0 and 100),
    country_of_origin text not null default 'Unknown',
    unit_price numeric(12,4) not null default 0 check (unit_price >= 0),
    compliance jsonb not null default '[]',
    parameters jsonb not null default '{}',
    quantity integer not null default 1 check (quantity > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index user_parts_owner_mpn_manufacturer_key
    on user_parts (user_id, lower(mpn), lower(manufacturer));

alter table user_parts enable row level security;

create policy "users manage own manually added parts" on user_parts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on user_parts to authenticated;
-- User-editable account profile data. Authentication credentials remain in
-- auth.users; this table stores application-facing profile fields.

create table user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    first_name text not null default '',
    last_name text not null default '',
    job text not null default '',
    company text not null default '',
    linkedin text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into user_profiles (user_id, email, first_name, last_name, job, company, linkedin)
select
    id,
    coalesce(email, ''),
    coalesce(
        nullif(trim(raw_user_meta_data ->> 'first_name'), ''),
        split_part(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''), ' ', 1),
        ''
    ),
    coalesce(
        nullif(trim(raw_user_meta_data ->> 'last_name'), ''),
        nullif(regexp_replace(
            coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''),
            '^\S+\s*',
            ''
        ), ''),
        ''
    ),
    coalesce(raw_user_meta_data ->> 'job', ''),
    coalesce(raw_user_meta_data ->> 'company', raw_user_meta_data ->> 'organization_name', ''),
    coalesce(raw_user_meta_data ->> 'linkedin', '')
from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.user_profiles (user_id, email, first_name, last_name, job, company, linkedin)
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
            split_part(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1),
            ''
        ),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
            nullif(regexp_replace(
                coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
                '^\S+\s*',
                ''
            ), ''),
            ''
        ),
        coalesce(new.raw_user_meta_data ->> 'job', ''),
        coalesce(new.raw_user_meta_data ->> 'company', new.raw_user_meta_data ->> 'organization_name', ''),
        coalesce(new.raw_user_meta_data ->> 'linkedin', '')
    )
    on conflict (user_id) do update set email = excluded.email;
    return new;
end;
$$;

create trigger create_profile_after_auth_user
after insert on auth.users
for each row execute function public.create_user_profile();

create or replace function public.sync_user_profile_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    update public.user_profiles
    set email = coalesce(new.email, ''), updated_at = now()
    where user_id = new.id;
    return new;
end;
$$;

create trigger sync_profile_after_auth_email_change
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_user_profile_email();

alter table user_profiles enable row level security;

create policy "users manage own profile" on user_profiles
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on user_profiles to authenticated;
-- User-owned notes for catalog, manual, and BOM-only parts.
-- partpilot_points is reserved for trusted server/engine enrichment; the
-- user-facing API only updates user_note.

create table part_notes (
    user_id uuid not null references auth.users(id) on delete cascade,
    part_id uuid not null,
    user_note text not null default '',
    partpilot_points jsonb not null default '[]'
        check (jsonb_typeof(partpilot_points) = 'array'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, part_id)
);

comment on column part_notes.part_id is
    'Application part identifier; may reference a catalog part, user_parts row, or unmatched BOM part.';
comment on column part_notes.partpilot_points is
    'Read-only client insights reserved for future PartPilot engine output.';

alter table part_notes enable row level security;

create policy "users manage own part notes" on part_notes
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on part_notes to authenticated;
-- Ensure category is part of every persisted part representation.

alter table parts
    add column if not exists category text;

update parts
set category = 'Uncategorized'
where category is null or btrim(category) = '';

alter table parts
    alter column category set default 'Uncategorized',
    alter column category set not null;

create index if not exists parts_category_idx on parts (category);

alter table user_parts
    add column if not exists category text not null default 'Uncategorized';

update user_parts
set category = 'Uncategorized'
where btrim(category) = '';

alter table bom_lines
    add column if not exists category text;

comment on column parts.category is
    'Part category supplied by source data or inferred by the server from a BOM designator.';
comment on column user_parts.category is
    'User-owned part category.';
comment on column bom_lines.category is
    'Category supplied by the BOM or inferred by the server from its designator.';
-- IEC CDD-style category metadata for catalog, manual, and BOM-only parts.
-- The document shape is defined by docs/domain/component-cdd.schema.json. Empty JSON
-- objects are intentional until the PartPilot engine enrichment pipeline fills
-- source-backed values.

alter table parts
    add column if not exists component_metadata jsonb not null default '{}';

alter table user_parts
    add column if not exists component_metadata jsonb not null default '{}';

alter table bom_lines
    add column if not exists component_metadata jsonb default null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'parts_component_metadata_object') then
        alter table parts add constraint parts_component_metadata_object
            check (jsonb_typeof(component_metadata) = 'object');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'user_parts_component_metadata_object') then
        alter table user_parts add constraint user_parts_component_metadata_object
            check (jsonb_typeof(component_metadata) = 'object');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'bom_lines_component_metadata_object') then
        alter table bom_lines add constraint bom_lines_component_metadata_object
            check (component_metadata is null or jsonb_typeof(component_metadata) = 'object');
    end if;
end $$;

comment on column parts.component_metadata is
    'CDD component document conforming to docs/domain/component-cdd.schema.json; populated by PartPilot enrichment.';
comment on column user_parts.component_metadata is
    'CDD component document for a user-owned part.';
comment on column bom_lines.component_metadata is
    'Optional line-level CDD metadata override; catalog metadata is used when this is null or empty.';

create or replace view partpilot_part_api as
select
    p.id,
    p.mpn,
    p.manufacturer,
    coalesce(nullif(p.description, ''), 'No description available') as description,
    coalesce(nullif(p.category, ''), 'Uncategorized') as category,
    p.parameters,
    coalesce(latest.stage, 'unknown') as lifecycle_stage,
    p.score,
    coalesce(nullif(p.country_of_origin, ''), 'Unknown') as country_of_origin,
    p.unit_price,
    coalesce(compliance.rows, '[]'::jsonb) as compliance,
    coalesce(p.component_metadata, '{}'::jsonb) as component_metadata
from parts p
left join lateral (
    select stage
    from lifecycle_statuses ls
    where ls.part_id = p.id
    order by ls.reported_at desc
    limit 1
) latest on true
left join lateral (
    select jsonb_agg(
        jsonb_build_object('standard', pc.standard, 'status', pc.status)
        order by pc.standard
    ) as rows
    from part_compliance pc
    where pc.part_id = p.id
) compliance on true;

create or replace view partpilot_bom_line_api as
select
    bl.id,
    bl.bom_id,
    coalesce(bl.matched_part_id, bl.id) as part_id,
    bl.line_no,
    coalesce(nullif(bl.mpn_raw, ''), p.mpn, 'UNKNOWN-' || bl.line_no::text) as mpn,
    coalesce(nullif(bl.description_raw, ''), nullif(p.description, ''), 'BOM line ' || bl.line_no::text) as description,
    coalesce(nullif(bl.manufacturer_raw, ''), p.manufacturer, 'Unknown') as manufacturer,
    coalesce(nullif(bl.country_of_origin, ''), nullif(p.country_of_origin, ''), 'Unknown') as country_of_origin,
    coalesce(nullif(bl.category, ''), nullif(p.category, ''), 'Uncategorized') as category,
    bl.qty,
    coalesce(bl.unit_price, p.unit_price, 0) as unit_price,
    case
        when jsonb_typeof(bl.compliance) = 'array' then
            case
                when jsonb_array_length(bl.compliance) > 0 then bl.compliance
                else coalesce(compliance.rows, '[]'::jsonb)
            end
        else coalesce(compliance.rows, '[]'::jsonb)
    end as compliance,
    coalesce(bl.lifecycle_stage, latest.stage, 'unknown') as lifecycle_stage,
    coalesce(bl.score, p.score, 72) as score,
    coalesce(nullif(bl.component_metadata, '{}'::jsonb), p.component_metadata, '{}'::jsonb) as component_metadata
from bom_lines bl
left join parts p on p.id = bl.matched_part_id
left join lateral (
    select stage
    from lifecycle_statuses ls
    where ls.part_id = p.id
    order by ls.reported_at desc
    limit 1
) latest on true
left join lateral (
    select jsonb_agg(
        jsonb_build_object('standard', pc.standard, 'status', pc.status)
        order by pc.standard
    ) as rows
    from part_compliance pc
    where pc.part_id = p.id
) compliance on true;

create or replace view partpilot_important_part_api as
select
    ip.user_id,
    ip.created_at,
    p.id,
    p.mpn,
    p.manufacturer,
    p.description,
    p.category,
    p.parameters,
    p.lifecycle_stage,
    p.score,
    p.country_of_origin,
    p.unit_price,
    p.compliance,
    p.component_metadata
from important_parts ip
join partpilot_part_api p on p.id = ip.part_id;
-- Make component_metadata the single source of truth for component facts.
-- Core searchable identity, PartPilot score, and BOM context (quantity/line
-- price) remain relational columns. Lifecycle observations remain as history,
-- but their latest value is projected into Characteristics by the API view.

create or replace function merge_component_metadata(base_document jsonb, override_document jsonb)
returns jsonb
language sql
immutable
as $$
    select coalesce(base_document, '{}'::jsonb)
        || coalesce(override_document, '{}'::jsonb)
        || coalesce((
            select jsonb_object_agg(
                entry.key,
                coalesce(base_document -> entry.key, '{}'::jsonb) || entry.value
            )
            from jsonb_each(coalesce(override_document, '{}'::jsonb)) entry
            where jsonb_typeof(entry.value) = 'object'
              and jsonb_typeof(base_document -> entry.key) = 'object'
        ), '{}'::jsonb)
$$;

-- Preserve legacy catalog values in their CDD sections. Existing CDD values
-- win when both representations contain the same property.
update parts p
set component_metadata = merge_component_metadata(
    jsonb_strip_nulls(jsonb_build_object(
        'regulatory', jsonb_strip_nulls(jsonb_build_object(
            'countryOfOrigin', nullif(nullif(btrim(p.country_of_origin), ''), 'Unknown')
        )),
        'commercial', jsonb_strip_nulls(jsonb_build_object(
            'priceBreaks', case when p.unit_price > 0 then
                jsonb_build_array(jsonb_build_object('quantity', 1, 'unitPrice', p.unit_price))
            end
        )),
        'electrical', case when p.parameters <> '{}'::jsonb then jsonb_build_object(
            'additionalProperties', (
                select jsonb_agg(jsonb_build_object(
                    'value', parameter.value,
                    'definition', parameter.key,
                    'source', 'legacy-parameters'
                ) order by parameter.key)
                from jsonb_each(p.parameters) parameter
            )
        ) else '{}'::jsonb end
    )),
    p.component_metadata
);

update parts p
set component_metadata = merge_component_metadata(
    jsonb_build_object('environmental', coalesce((
        select jsonb_object_agg(mapped.field_name, to_jsonb(mapped.status = 'pass'))
        from (
            select
                case lower(pc.standard)
                    when 'rohs' then 'rohsCompliant'
                    when 'reach' then 'reachCompliant'
                end as field_name,
                pc.status
            from part_compliance pc
            where pc.part_id = p.id
              and lower(pc.standard) in ('rohs', 'reach')
              and pc.status in ('pass', 'fail')
        ) mapped
        where mapped.field_name is not null
    ), '{}'::jsonb)),
    component_metadata
);

-- Preserve manually managed part characteristics before removing legacy
-- columns. The frontend will write these paths directly after this migration.
update user_parts p
set component_metadata = merge_component_metadata(
    jsonb_strip_nulls(jsonb_build_object(
        'regulatory', jsonb_strip_nulls(jsonb_build_object(
            'countryOfOrigin', nullif(nullif(btrim(p.country_of_origin), ''), 'Unknown')
        )),
        'commercial', jsonb_strip_nulls(jsonb_build_object(
            'lifecycleStatus', case p.lifecycle_stage
                when 'active' then 'Active'
                when 'nrnd' then 'NRND'
                when 'last_time_buy' then 'EOL'
                when 'obsolete' then 'Obsolete'
                else null
            end,
            'priceBreaks', case when p.unit_price > 0 then
                jsonb_build_array(jsonb_build_object('quantity', 1, 'unitPrice', p.unit_price))
            end
        )),
        'environmental', coalesce((
            select jsonb_object_agg(mapped.field_name, mapped.field_value)
            from (
                select
                    case lower(record ->> 'standard')
                        when 'rohs' then 'rohsCompliant'
                        when 'reach' then 'reachCompliant'
                    end as field_name,
                    to_jsonb((record ->> 'status') = 'pass') as field_value
                from jsonb_array_elements(
                    case when jsonb_typeof(p.compliance) = 'array' then p.compliance else '[]'::jsonb end
                ) record
                where record ->> 'status' in ('pass', 'fail')
            ) mapped
            where mapped.field_name is not null
        ), '{}'::jsonb),
        'electrical', case when p.parameters <> '{}'::jsonb then jsonb_build_object(
            'additionalProperties', (
                select jsonb_agg(jsonb_build_object(
                    'value', parameter.value,
                    'definition', parameter.key,
                    'source', 'legacy-parameters'
                ) order by parameter.key)
                from jsonb_each(p.parameters) parameter
            )
        ) else '{}'::jsonb end
    )),
    p.component_metadata
);

-- BOM price stays on the line because it is project/procurement context. All
-- component facts move into the line's optional Characteristics override.
update bom_lines line
set component_metadata = merge_component_metadata(
    jsonb_strip_nulls(jsonb_build_object(
        'regulatory', jsonb_strip_nulls(jsonb_build_object(
            'countryOfOrigin', nullif(nullif(btrim(line.country_of_origin), ''), 'Unknown')
        )),
        'commercial', jsonb_strip_nulls(jsonb_build_object(
            'lifecycleStatus', case line.lifecycle_stage
                when 'active' then 'Active'
                when 'nrnd' then 'NRND'
                when 'last_time_buy' then 'EOL'
                when 'obsolete' then 'Obsolete'
                else null
            end
        )),
        'environmental', coalesce((
            select jsonb_object_agg(mapped.field_name, mapped.field_value)
            from (
                select
                    case lower(record ->> 'standard')
                        when 'rohs' then 'rohsCompliant'
                        when 'reach' then 'reachCompliant'
                    end as field_name,
                    to_jsonb((record ->> 'status') = 'pass') as field_value
                from jsonb_array_elements(
                    case when jsonb_typeof(line.compliance) = 'array' then line.compliance else '[]'::jsonb end
                ) record
                where record ->> 'status' in ('pass', 'fail')
            ) mapped
            where mapped.field_name is not null
        ), '{}'::jsonb)
    )),
    coalesce(line.component_metadata, '{}'::jsonb)
);

drop view if exists partpilot_project_api;
drop view if exists partpilot_important_part_api;
drop view if exists partpilot_bom_line_api;
drop view if exists partpilot_part_api;

drop table if exists part_compliance;

alter table parts
    drop column if exists country_of_origin,
    drop column if exists unit_price,
    drop column if exists parameters;

alter table user_parts
    drop column if exists lifecycle_stage,
    drop column if exists country_of_origin,
    drop column if exists unit_price,
    drop column if exists compliance,
    drop column if exists parameters;

alter table bom_lines
    drop column if exists country_of_origin,
    drop column if exists compliance,
    drop column if exists lifecycle_stage;

create or replace view partpilot_part_api as
select
    p.id,
    p.mpn,
    p.manufacturer,
    coalesce(nullif(p.description, ''), 'No description available') as description,
    coalesce(nullif(p.category, ''), 'Uncategorized') as category,
    p.score,
    merge_component_metadata(
        p.component_metadata,
        case when latest.stage is null then '{}'::jsonb else jsonb_build_object(
            'commercial', jsonb_build_object(
                'lifecycleStatus', case latest.stage
                    when 'active' then 'Active'
                    when 'nrnd' then 'NRND'
                    when 'last_time_buy' then 'EOL'
                    when 'obsolete' then 'Obsolete'
                    else 'Unknown'
                end
            )
        ) end
    ) as component_metadata
from parts p
left join lateral (
    select stage
    from lifecycle_statuses ls
    where ls.part_id = p.id
    order by ls.reported_at desc
    limit 1
) latest on true;

create or replace view partpilot_bom_line_api as
select
    bl.id,
    bl.bom_id,
    coalesce(bl.matched_part_id, bl.id) as part_id,
    bl.line_no,
    coalesce(nullif(bl.mpn_raw, ''), p.mpn, 'UNKNOWN-' || bl.line_no::text) as mpn,
    coalesce(nullif(bl.description_raw, ''), nullif(p.description, ''), 'BOM line ' || bl.line_no::text) as description,
    coalesce(nullif(bl.manufacturer_raw, ''), p.manufacturer, 'Unknown') as manufacturer,
    coalesce(nullif(bl.category, ''), nullif(p.category, ''), 'Uncategorized') as category,
    bl.qty,
    coalesce(bl.unit_price, 0) as unit_price,
    coalesce(bl.score, p.score, 72) as score,
    merge_component_metadata(p.component_metadata, bl.component_metadata) as component_metadata
from bom_lines bl
left join partpilot_part_api p on p.id = bl.matched_part_id;

create or replace view partpilot_project_api as
select
    b.id,
    coalesce(nullif(b.name, ''), 'Untitled') as name,
    count(l.id)::int as part_count,
    b.uploaded_at,
    'You'::text as owner,
    coalesce(min(l.score), 0)::int as lowest_score
from boms b
left join partpilot_bom_line_api l on l.bom_id = b.id
group by b.id, b.name, b.uploaded_at;

create or replace view partpilot_important_part_api as
select
    ip.user_id,
    ip.created_at,
    p.id,
    p.mpn,
    p.manufacturer,
    p.description,
    p.category,
    p.score,
    p.component_metadata
from important_parts ip
join partpilot_part_api p on p.id = ip.part_id;

grant select on partpilot_part_api to anon, authenticated;
grant select on partpilot_bom_line_api to authenticated;
grant select on partpilot_project_api to authenticated;
grant select on partpilot_important_part_api to authenticated;
-- Add profile contact details, organization identity, and the account's
-- billing tier. Payments are not connected yet, so every account starts on
-- the Hobby plan.

alter table user_profiles
    add column if not exists phone text not null default '',
    add column if not exists organization_slug text not null default 'personal',
    add column if not exists github text not null default '',
    add column if not exists billing_plan text not null default 'hobby';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'user_profiles_billing_plan_check') then
        alter table user_profiles add constraint user_profiles_billing_plan_check
            check (billing_plan in ('hobby', 'startup', 'scale', 'enterprise'));
    end if;
end $$;

update user_profiles as profile
set
    phone = coalesce(
        nullif(trim(users.raw_user_meta_data ->> 'phone'), ''),
        nullif(trim(users.raw_user_meta_data ->> 'phone_number'), ''),
        nullif(trim(users.phone), ''),
        ''
    ),
    organization_slug = coalesce(
        nullif(trim(users.raw_user_meta_data ->> 'organization_slug'), ''),
        nullif(trim(users.raw_user_meta_data ->> 'org_slug'), ''),
        'personal'
    ),
    github = coalesce(
        nullif(trim(users.raw_user_meta_data ->> 'github'), ''),
        nullif(trim(users.raw_user_meta_data ->> 'github_url'), ''),
        ''
    ),
    billing_plan = case
        when users.raw_user_meta_data ->> 'billing_plan' in ('hobby', 'startup', 'scale', 'enterprise')
            then users.raw_user_meta_data ->> 'billing_plan'
        else 'hobby'
    end
from auth.users as users
where users.id = profile.user_id;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.user_profiles (
        user_id,
        email,
        first_name,
        last_name,
        phone,
        job,
        company,
        organization_slug,
        github,
        linkedin,
        billing_plan
    )
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
            split_part(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1),
            ''
        ),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
            nullif(regexp_replace(
                coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
                '^\S+\s*',
                ''
            ), ''),
            ''
        ),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'phone_number'), ''),
            nullif(trim(new.phone), ''),
            ''
        ),
        coalesce(new.raw_user_meta_data ->> 'job', ''),
        coalesce(new.raw_user_meta_data ->> 'company', new.raw_user_meta_data ->> 'organization_name', ''),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'organization_slug'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'org_slug'), ''),
            'personal'
        ),
        coalesce(new.raw_user_meta_data ->> 'github', new.raw_user_meta_data ->> 'github_url', ''),
        coalesce(new.raw_user_meta_data ->> 'linkedin', ''),
        case
            when new.raw_user_meta_data ->> 'billing_plan' in ('hobby', 'startup', 'scale', 'enterprise')
                then new.raw_user_meta_data ->> 'billing_plan'
            else 'hobby'
        end
    )
    on conflict (user_id) do update set email = excluded.email;
    return new;
end;
$$;
-- Resolve Supabase security linter findings without changing the API views'
-- columns or grants. Invoker security makes the underlying table permissions
-- and RLS policies apply to the role querying each view.

alter view public.partpilot_part_api
    set (security_invoker = true);

alter view public.partpilot_bom_line_api
    set (security_invoker = true);

alter view public.partpilot_project_api
    set (security_invoker = true);

alter view public.partpilot_important_part_api
    set (security_invoker = true);

-- Some deployed environments contain an older application-managed migration
-- ledger in public. It is not created by this repository, so guard the change
-- to keep fresh database deployments valid. No client policy is intentional:
-- administrative migration metadata should not be exposed through PostgREST.
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        execute 'alter table public.schema_migrations enable row level security';
    end if;
end $$;
-- Persist a complete adapter snapshot while retaining unrelated metadata keys.
-- The worker/server database role calls this function after
-- DataSourceConnector::fetch_part returns a PartSnapshot.

insert into sources (name, trust_weight)
values ('digikey', 0.85)
on conflict (name) do update
set trust_weight = excluded.trust_weight;

create or replace function upsert_source_part_snapshot(
    source_name text,
    part_mpn text,
    part_manufacturer text,
    part_description text,
    part_category text,
    part_component_metadata jsonb,
    lifecycle_stage text,
    lifecycle_last_time_buy_date date,
    lifecycle_confidence real,
    lifecycle_reported_at timestamptz,
    lifecycle_raw_payload_ref text
)
returns uuid
language plpgsql
as $$
declare
    resolved_part_id uuid;
    resolved_source_id integer;
begin
    if jsonb_typeof(coalesce(part_component_metadata, '{}'::jsonb)) <> 'object' then
        raise exception 'part_component_metadata must be a JSON object';
    end if;

    if lifecycle_stage not in ('active', 'nrnd', 'last_time_buy', 'obsolete', 'unknown') then
        raise exception 'invalid lifecycle stage: %', lifecycle_stage;
    end if;

    select id into resolved_source_id
    from sources
    where name = source_name;

    if resolved_source_id is null then
        raise exception 'unknown source: %', source_name;
    end if;

    insert into parts (
        mpn,
        manufacturer,
        description,
        category,
        component_metadata
    ) values (
        part_mpn,
        part_manufacturer,
        coalesce(nullif(btrim(part_description), ''), 'No description available'),
        coalesce(nullif(btrim(part_category), ''), 'Uncategorized'),
        coalesce(part_component_metadata, '{}'::jsonb)
    )
    on conflict (mpn, manufacturer) do update set
        description = case
            when nullif(btrim(part_description), '') is null then parts.description
            else excluded.description
        end,
        category = case
            when nullif(btrim(part_category), '') is null then parts.category
            else excluded.category
        end,
        component_metadata = merge_component_metadata(
            parts.component_metadata,
            excluded.component_metadata
        )
    returning id into resolved_part_id;

    insert into lifecycle_statuses (
        part_id,
        source_id,
        stage,
        last_time_buy_date,
        confidence,
        reported_at,
        raw_payload_ref
    ) values (
        resolved_part_id,
        resolved_source_id,
        lifecycle_stage,
        lifecycle_last_time_buy_date,
        lifecycle_confidence,
        lifecycle_reported_at,
        lifecycle_raw_payload_ref
    );

    return resolved_part_id;
end;
$$;

comment on function upsert_source_part_snapshot(
    text, text, text, text, text, jsonb, text, date, real, timestamptz, text
) is
    'Atomically upserts source-backed catalog fields/CDD metadata and appends one lifecycle observation.';

revoke execute on function upsert_source_part_snapshot(
    text, text, text, text, text, jsonb, text, date, real, timestamptz, text
) from public;
