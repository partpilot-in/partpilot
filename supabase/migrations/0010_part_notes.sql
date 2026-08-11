-- User-owned notes for catalog, manual, and BOM-only parts.
-- partpilot_points is reserved for trusted server/engine enrichment; the
-- user-facing API only updates user_note.

create table part_notes (
    user_id uuid not null references auth.users(id) on delete cascade,
    part_id uuid not null,
    user_note text not null default '',
    partpilot_points jsonb not null default '[]'
        check (jsonb_typeof(partpilot_points) = 'array'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, part_id)
);

comment on column part_notes.part_id is
    'Application part identifier; may reference a catalog part, user_parts row, or unmatched BOM part.';
comment on column part_notes.partpilot_points is
    'Read-only client insights reserved for future PartPilot engine output.';

alter table part_notes enable row level security;

create policy "users manage own part notes" on part_notes
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on part_notes to authenticated;
