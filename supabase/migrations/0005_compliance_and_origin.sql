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
