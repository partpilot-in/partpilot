-- User-editable account profile data. Authentication credentials remain in
-- auth.users; this table stores application-facing profile fields.

create table user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    first_name text not null default '',
    last_name text not null default '',
    job text not null default '',
    company text not null default '',
    linkedin text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into user_profiles (user_id, email, first_name, last_name, job, company, linkedin)
select
    id,
    coalesce(email, ''),
    coalesce(
        nullif(trim(raw_user_meta_data ->> 'first_name'), ''),
        split_part(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''), ' ', 1),
        ''
    ),
    coalesce(
        nullif(trim(raw_user_meta_data ->> 'last_name'), ''),
        nullif(regexp_replace(
            coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''),
            '^\S+\s*',
            ''
        ), ''),
        ''
    ),
    coalesce(raw_user_meta_data ->> 'job', ''),
    coalesce(raw_user_meta_data ->> 'company', raw_user_meta_data ->> 'organization_name', ''),
    coalesce(raw_user_meta_data ->> 'linkedin', '')
from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.user_profiles (user_id, email, first_name, last_name, job, company, linkedin)
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
            split_part(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1),
            ''
        ),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
            nullif(regexp_replace(
                coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
                '^\S+\s*',
                ''
            ), ''),
            ''
        ),
        coalesce(new.raw_user_meta_data ->> 'job', ''),
        coalesce(new.raw_user_meta_data ->> 'company', new.raw_user_meta_data ->> 'organization_name', ''),
        coalesce(new.raw_user_meta_data ->> 'linkedin', '')
    )
    on conflict (user_id) do update set email = excluded.email;
    return new;
end;
$$;

create trigger create_profile_after_auth_user
after insert on auth.users
for each row execute function public.create_user_profile();

create or replace function public.sync_user_profile_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    update public.user_profiles
    set email = coalesce(new.email, ''), updated_at = now()
    where user_id = new.id;
    return new;
end;
$$;

create trigger sync_profile_after_auth_email_change
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_user_profile_email();

alter table user_profiles enable row level security;

create policy "users manage own profile" on user_profiles
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on user_profiles to authenticated;
