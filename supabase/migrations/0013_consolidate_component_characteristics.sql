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
