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
