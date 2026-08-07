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
