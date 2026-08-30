-- 0006_community_insights.sql
-- Community Pulse: synthesized forum digest per part, with citations.
-- Populated by worker's insight-sweep mode via the
-- community-pulse pipeline.
-- Portability: pure vanilla Postgres. RLS policies below are public-read
-- only (`using (true)`) — no auth.uid() or auth schema dependency.

create table if not exists community_insights (
    part_id uuid primary key references parts(id) on delete cascade,
    summary text,
    sentiment text not null check (sentiment in ('positive','mixed','negative','insufficient')),
    common_praise jsonb not null default '[]',
    common_issues jsonb not null default '[]',
    based_on_post_count int not null default 0,
    generated_at timestamptz not null
);

create table if not exists community_insight_citations (
    id bigserial primary key,
    part_id uuid not null references community_insights(part_id) on delete cascade,
    source text not null,
    url text not null,
    title text not null,
    posted_at timestamptz,
    engagement int
);
create index if not exists community_insight_citations_part_idx on community_insight_citations (part_id);

alter table community_insights enable row level security;
alter table community_insight_citations enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_insights' and policyname = 'public read community_insights') then
        create policy "public read community_insights" on community_insights for select using (true);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_insight_citations' and policyname = 'public read community_insight_citations') then
        create policy "public read community_insight_citations" on community_insight_citations for select using (true);
    end if;
end $$;
