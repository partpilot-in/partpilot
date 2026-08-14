-- Add profile contact details, organization identity, and the account's
-- billing tier. Payments are not connected yet, so every account starts on
-- the Hobby plan.

alter table user_profiles
    add column phone text not null default '',
    add column organization_slug text not null default 'personal',
    add column github text not null default '',
    add column billing_plan text not null default 'hobby'
        check (billing_plan in ('hobby', 'startup', 'scale', 'enterprise'));

update user_profiles as profile
set
    phone = coalesce(
        nullif(trim(users.raw_user_meta_data ->> 'phone'), ''),
        nullif(trim(users.raw_user_meta_data ->> 'phone_number'), ''),
        nullif(trim(users.phone), ''),
        ''
    ),
    organization_slug = coalesce(
        nullif(trim(users.raw_user_meta_data ->> 'organization_slug'), ''),
        nullif(trim(users.raw_user_meta_data ->> 'org_slug'), ''),
        'personal'
    ),
    github = coalesce(
        nullif(trim(users.raw_user_meta_data ->> 'github'), ''),
        nullif(trim(users.raw_user_meta_data ->> 'github_url'), ''),
        ''
    ),
    billing_plan = case
        when users.raw_user_meta_data ->> 'billing_plan' in ('hobby', 'startup', 'scale', 'enterprise')
            then users.raw_user_meta_data ->> 'billing_plan'
        else 'hobby'
    end
from auth.users as users
where users.id = profile.user_id;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.user_profiles (
        user_id,
        email,
        first_name,
        last_name,
        phone,
        job,
        company,
        organization_slug,
        github,
        linkedin,
        billing_plan
    )
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
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'phone_number'), ''),
            nullif(trim(new.phone), ''),
            ''
        ),
        coalesce(new.raw_user_meta_data ->> 'job', ''),
        coalesce(new.raw_user_meta_data ->> 'company', new.raw_user_meta_data ->> 'organization_name', ''),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'organization_slug'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'org_slug'), ''),
            'personal'
        ),
        coalesce(new.raw_user_meta_data ->> 'github', new.raw_user_meta_data ->> 'github_url', ''),
        coalesce(new.raw_user_meta_data ->> 'linkedin', ''),
        case
            when new.raw_user_meta_data ->> 'billing_plan' in ('hobby', 'startup', 'scale', 'enterprise')
                then new.raw_user_meta_data ->> 'billing_plan'
            else 'hobby'
        end
    )
    on conflict (user_id) do update set email = excluded.email;
    return new;
end;
$$;
