-- Align component_metadata with the DatasheetXML v0.3 structure.
--
-- component_metadata remains a partial JSON projection because catalog parts
-- do not always have instance-only fields such as referenceDesignator. Empty
-- objects are also retained for parts that have not been enriched yet.
-- Legacy documentation keys remain in place so existing readers continue to
-- work; canonical Documentation.documents and top-level edaModels are added.
-- Datasheet is retained as a PartPilot document-type extension because the
-- source XSD models the datasheet as the root document rather than a link.

create or replace function datasheet_v03_uri_array(value jsonb)
returns jsonb
language sql
immutable
parallel safe
as $$
    select case jsonb_typeof(value)
        when 'string' then
            case when nullif(btrim(value #>> '{}'), '') is null
                then '[]'::jsonb
                else jsonb_build_array(btrim(value #>> '{}'))
            end
        when 'array' then coalesce((
            select jsonb_agg(to_jsonb(uri) order by uri)
            from (
                select distinct btrim(entry #>> '{}') as uri
                from jsonb_array_elements(value) entry
                where jsonb_typeof(entry) = 'string'
                  and nullif(btrim(entry #>> '{}'), '') is not null
            ) normalized
        ), '[]'::jsonb)
        else '[]'::jsonb
    end
$$;

create or replace function datasheet_v03_eda_models(document jsonb)
returns jsonb
language sql
immutable
parallel safe
as $$
    with model_keys(key) as (
        values
            ('bsdl'),
            ('ibis'),
            ('spice'),
            ('svd'),
            ('symbol'),
            ('footprint'),
            ('threeDModel')
    ), normalized as (
        select
            key,
            coalesce((
                select jsonb_agg(to_jsonb(uri) order by uri)
                from (
                    select distinct btrim(entry #>> '{}') as uri
                    from jsonb_array_elements(
                        datasheet_v03_uri_array(document -> 'edaModels' -> key)
                        || datasheet_v03_uri_array(document -> 'documentation' -> 'edaModels' -> key)
                        || datasheet_v03_uri_array(document -> 'documentation' -> key)
                    ) entry
                    where jsonb_typeof(entry) = 'string'
                      and nullif(btrim(entry #>> '{}'), '') is not null
                ) unique_uris
            ), '[]'::jsonb) as uris
        from model_keys
    )
    select coalesce(jsonb_object_agg(key, uris order by key), '{}'::jsonb)
    from normalized
    where uris <> '[]'::jsonb
$$;

create or replace function datasheet_v03_document_entries(documentation jsonb)
returns jsonb
language sql
immutable
parallel safe
as $$
    with existing_entries as (
        select entry
        from jsonb_array_elements(
            case
                when jsonb_typeof(documentation -> 'documents') = 'array'
                    then documentation -> 'documents'
                when jsonb_typeof(documentation -> 'documents' -> 'document') = 'array'
                    then documentation -> 'documents' -> 'document'
                else '[]'::jsonb
            end
        ) entry
        where jsonb_typeof(entry) = 'object'
    ), legacy_sources(document_type, uris) as (
        values
            (
                'Datasheet'::text,
                datasheet_v03_uri_array(documentation -> 'datasheetUrl')
            ),
            (
                'Application Note'::text,
                datasheet_v03_uri_array(documentation -> 'applicationNotes')
                || datasheet_v03_uri_array(documentation -> 'applicationNote')
            ),
            (
                'Technical Note'::text,
                datasheet_v03_uri_array(documentation -> 'technicalNotes')
                || datasheet_v03_uri_array(documentation -> 'technicalNote')
            ),
            (
                'Errata'::text,
                datasheet_v03_uri_array(documentation -> 'errata')
            ),
            (
                'PCN'::text,
                datasheet_v03_uri_array(documentation -> 'changeNotifications')
                || datasheet_v03_uri_array(documentation -> 'pcn')
            )
    ), legacy_entries as (
        select
            jsonb_build_object(
                'documentType', document_type,
                'url', uri #>> '{}'
            )
            || case
                when document_type = 'Datasheet'
                 and jsonb_typeof(documentation -> 'datasheetRevision') = 'string'
                 and nullif(btrim(documentation ->> 'datasheetRevision'), '') is not null
                    then jsonb_build_object(
                        'revision', btrim(documentation ->> 'datasheetRevision')
                    )
                else '{}'::jsonb
            end as entry
        from legacy_sources
        cross join lateral jsonb_array_elements(uris) uri
    ), combined as (
        select entry from existing_entries
        union
        select entry from legacy_entries
    )
    select coalesce(
        jsonb_agg(entry order by entry ->> 'documentType', entry ->> 'url'),
        '[]'::jsonb
    )
    from combined
$$;

create or replace function normalize_component_metadata_v03(document jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
as $$
declare
    normalized jsonb;
    documentation jsonb;
    documents jsonb;
    eda_models jsonb;
begin
    if document is null or jsonb_typeof(document) <> 'object' then
        return document;
    end if;

    if document = '{}'::jsonb then
        return document;
    end if;

    normalized := document || jsonb_build_object(
        'version', coalesce(nullif(document ->> 'version', ''), '1'),
        'schemaVersion', '0.3'
    );

    eda_models := datasheet_v03_eda_models(document);
    if eda_models <> '{}'::jsonb then
        normalized := normalized || jsonb_build_object('edaModels', eda_models);
    end if;

    documentation := document -> 'documentation';
    if jsonb_typeof(documentation) = 'object' then
        documents := datasheet_v03_document_entries(documentation);
        if documents <> '[]'::jsonb then
            normalized := normalized || jsonb_build_object(
                'documentation', documentation || jsonb_build_object('documents', documents)
            );
        end if;
    end if;

    return normalized;
end;
$$;

create or replace function component_metadata_matches_datasheet_v03(document jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
    select document is null or (
        jsonb_typeof(document) = 'object'
        and (
            document = '{}'::jsonb
            or (
                jsonb_typeof(document -> 'version') is not distinct from 'string'
                and document ->> 'schemaVersion' = '0.3'
            )
        )
        and not exists (
            select 1
            from jsonb_each(
                case when jsonb_typeof(document) = 'object'
                    then document
                    else '{}'::jsonb
                end
            ) section
            where section.key in (
                'identification', 'electrical', 'mechanical', 'thermal',
                'material', 'environmental', 'reliability', 'regulatory',
                'manufacturing', 'commercial', 'packaging', 'documentation',
                'edaModels'
            )
              and jsonb_typeof(section.value) <> 'object'
        )
        and (
            not (document ? 'edaModels')
            or (
                jsonb_typeof(document -> 'edaModels') = 'object'
                and not exists (
                    select 1
                    from jsonb_each(
                        case when jsonb_typeof(document -> 'edaModels') = 'object'
                            then document -> 'edaModels'
                            else '{}'::jsonb
                        end
                    ) model
                    where model.key not in (
                        'bsdl', 'ibis', 'spice', 'svd', 'symbol',
                        'footprint', 'threeDModel'
                    )
                       or jsonb_typeof(model.value) <> 'array'
                       or exists (
                            select 1
                            from jsonb_array_elements(
                                case when jsonb_typeof(model.value) = 'array'
                                    then model.value
                                    else '[]'::jsonb
                                end
                            ) uri
                            where jsonb_typeof(uri) <> 'string'
                               or nullif(btrim(uri #>> '{}'), '') is null
                       )
                )
            )
        )
        and (
            not coalesce((document -> 'documentation') ? 'documents', false)
            or (
                jsonb_typeof(document -> 'documentation' -> 'documents') is not distinct from 'array'
                and not exists (
                    select 1
                    from jsonb_array_elements(
                        case when jsonb_typeof(document -> 'documentation' -> 'documents') = 'array'
                            then document -> 'documentation' -> 'documents'
                            else '[]'::jsonb
                        end
                    ) entry
                    where jsonb_typeof(entry) is distinct from 'object'
                       or jsonb_typeof(entry -> 'documentType') is distinct from 'string'
                       or coalesce(entry ->> 'documentType', '') not in (
                            'Datasheet', 'Application Note', 'Technical Note',
                            'Errata', 'PCN'
                       )
                       or jsonb_typeof(entry -> 'url') is distinct from 'string'
                       or nullif(btrim(entry ->> 'url'), '') is null
                       or exists (
                            select 1
                            from jsonb_each(
                                case when jsonb_typeof(entry) = 'object'
                                    then entry
                                    else '{}'::jsonb
                                end
                            ) field
                            where field.key not in (
                                'documentType', 'title', 'documentNumber',
                                'revision', 'date', 'url'
                            )
                               or (
                                    field.key in (
                                        'documentType', 'title', 'documentNumber',
                                        'revision', 'date', 'url'
                                    )
                                    and jsonb_typeof(field.value) is distinct from 'string'
                               )
                       )
                )
            )
        )
        and (
            not coalesce((document -> 'documentation') ? 'complianceCertificates', false)
            or (
                jsonb_typeof(document -> 'documentation' -> 'complianceCertificates') is not distinct from 'array'
                and not exists (
                    select 1
                    from jsonb_array_elements(
                        case when jsonb_typeof(document -> 'documentation' -> 'complianceCertificates') = 'array'
                            then document -> 'documentation' -> 'complianceCertificates'
                            else '[]'::jsonb
                        end
                    ) uri
                    where jsonb_typeof(uri) is distinct from 'string'
                       or nullif(btrim(uri #>> '{}'), '') is null
                )
            )
        )
        and (
            not coalesce((document -> 'documentation') ? 'revisionHistory', false)
            or (
                jsonb_typeof(document -> 'documentation' -> 'revisionHistory') is not distinct from 'array'
                and not exists (
                    select 1
                    from jsonb_array_elements(
                        case when jsonb_typeof(document -> 'documentation' -> 'revisionHistory') = 'array'
                            then document -> 'documentation' -> 'revisionHistory'
                            else '[]'::jsonb
                        end
                    ) entry
                    where jsonb_typeof(entry) is distinct from 'object'
                       or exists (
                            select 1
                            from jsonb_each(
                                case when jsonb_typeof(entry) = 'object'
                                    then entry
                                    else '{}'::jsonb
                                end
                            ) field
                            where field.key not in ('revision', 'date', 'notes')
                               or jsonb_typeof(field.value) is distinct from 'string'
                       )
                )
            )
        )
    )
$$;

create or replace function normalize_component_metadata_v03_trigger()
returns trigger
language plpgsql
as $$
begin
    new.component_metadata := normalize_component_metadata_v03(new.component_metadata);
    return new;
end;
$$;

update parts
set component_metadata = normalize_component_metadata_v03(component_metadata)
where component_metadata <> '{}'::jsonb;

update user_parts
set component_metadata = normalize_component_metadata_v03(component_metadata)
where component_metadata <> '{}'::jsonb;

update bom_lines
set component_metadata = normalize_component_metadata_v03(component_metadata)
where component_metadata is not null
  and component_metadata <> '{}'::jsonb;

drop trigger if exists parts_normalize_component_metadata_v03 on parts;
create trigger parts_normalize_component_metadata_v03
before insert or update of component_metadata on parts
for each row execute function normalize_component_metadata_v03_trigger();

drop trigger if exists user_parts_normalize_component_metadata_v03 on user_parts;
create trigger user_parts_normalize_component_metadata_v03
before insert or update of component_metadata on user_parts
for each row execute function normalize_component_metadata_v03_trigger();

drop trigger if exists bom_lines_normalize_component_metadata_v03 on bom_lines;
create trigger bom_lines_normalize_component_metadata_v03
before insert or update of component_metadata on bom_lines
for each row execute function normalize_component_metadata_v03_trigger();

alter table parts
    drop constraint if exists parts_component_metadata_datasheet_v03;
alter table parts
    add constraint parts_component_metadata_datasheet_v03
    check (component_metadata_matches_datasheet_v03(component_metadata));

alter table user_parts
    drop constraint if exists user_parts_component_metadata_datasheet_v03;
alter table user_parts
    add constraint user_parts_component_metadata_datasheet_v03
    check (component_metadata_matches_datasheet_v03(component_metadata));

alter table bom_lines
    drop constraint if exists bom_lines_component_metadata_datasheet_v03;
alter table bom_lines
    add constraint bom_lines_component_metadata_datasheet_v03
    check (component_metadata_matches_datasheet_v03(component_metadata));

comment on column parts.component_metadata is
    'Partial DatasheetXML v0.3 JSON projection. Non-empty documents carry version/schemaVersion; datasheets are included in documentation.documents and EDA models under top-level edaModels.';
comment on column user_parts.component_metadata is
    'User-owned partial DatasheetXML v0.3 JSON projection normalized on write.';
comment on column bom_lines.component_metadata is
    'Optional line-level DatasheetXML v0.3 metadata override normalized on write.';

comment on function normalize_component_metadata_v03(jsonb) is
    'Normalizes legacy component metadata into the DatasheetXML v0.3 JSON projection without removing compatibility keys.';
comment on function component_metadata_matches_datasheet_v03(jsonb) is
    'Validates DatasheetXML v0.3 root sections plus canonical Documentation (including the Datasheet extension) and EDA model structures.';
