-- 0003_rls_policies.sql
-- Row Level Security: user-owned tables are locked to their owner; reference
-- data (parts, lifecycle_statuses, alternates, sources) is public-read, with
-- writes restricted to the service role.

alter table sources enable row level security;
alter table watchlist enable row level security;
alter table boms enable row level security;
alter table bom_lines enable row level security;
alter table api_keys enable row level security;
alter table parts enable row level security;
alter table lifecycle_statuses enable row level security;
alter table alternates enable row level security;
alter table source_health enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sources' and policyname = 'public read sources') then
        create policy "public read sources" on sources for select using (true);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'watchlist' and policyname = 'users manage own watchlist') then
        create policy "users manage own watchlist" on watchlist
            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'boms' and policyname = 'users manage own boms') then
        create policy "users manage own boms" on boms
            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bom_lines' and policyname = 'users manage own bom lines') then
        create policy "users manage own bom lines" on bom_lines
            for all using (
                exists (select 1 from boms where boms.id = bom_lines.bom_id and boms.user_id = auth.uid())
            ) with check (
                exists (select 1 from boms where boms.id = bom_lines.bom_id and boms.user_id = auth.uid())
            );
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'api_keys' and policyname = 'users manage own api keys') then
        create policy "users manage own api keys" on api_keys
            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'parts' and policyname = 'public read parts') then
        create policy "public read parts" on parts for select using (true);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lifecycle_statuses' and policyname = 'public read lifecycle') then
        create policy "public read lifecycle" on lifecycle_statuses for select using (true);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alternates' and policyname = 'public read alternates') then
        create policy "public read alternates" on alternates for select using (true);
    end if;
end $$;
