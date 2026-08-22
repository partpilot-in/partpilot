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
