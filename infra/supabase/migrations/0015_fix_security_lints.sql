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
