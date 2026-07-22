-- 0003_rls_policies.sql
-- Row Level Security: user-owned tables are locked to their owner; reference
-- data (parts, lifecycle_statuses, alternates, sources) is public-read, with
-- writes restricted to the service role (server/worker bypass RLS by design
-- when connecting with the service role key — never expose that key to the
-- client).

alter table watchlist enable row level security;
create policy "users manage own watchlist" on watchlist
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table boms enable row level security;
create policy "users manage own boms" on boms
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table bom_lines enable row level security;
create policy "users read own bom lines" on bom_lines
    for select using (
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
