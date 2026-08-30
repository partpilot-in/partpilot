-- Server-backed manually managed inventory for the My Parts page.

create table if not exists user_parts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    mpn text not null,
    manufacturer text not null,
    description text not null default 'Manually added part',
    category text not null default 'Uncategorized',
    lifecycle_stage text not null default 'unknown'
        check (lifecycle_stage in ('active','nrnd','last_time_buy','obsolete','unknown')),
    score integer not null default 72 check (score between 0 and 100),
    country_of_origin text not null default 'Unknown',
    unit_price numeric(12,4) not null default 0 check (unit_price >= 0),
    compliance jsonb not null default '[]',
    parameters jsonb not null default '{}',
    quantity integer not null default 1 check (quantity > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists user_parts_owner_mpn_manufacturer_key
    on user_parts (user_id, lower(mpn), lower(manufacturer));

alter table user_parts enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_parts'
          and policyname = 'users manage own manually added parts'
    ) then
        create policy "users manage own manually added parts" on user_parts
            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;
end $$;

grant select, insert, update, delete on user_parts to authenticated;
