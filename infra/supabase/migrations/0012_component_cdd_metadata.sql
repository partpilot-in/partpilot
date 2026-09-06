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
