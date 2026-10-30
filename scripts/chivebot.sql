-- CareerChive ChiveBot schema: chat sessions, messages, question
-- embeddings, and the Archive entry index used for retrieve.
--
-- Run this AFTER scripts/schema.sql, in the SQL editor or Direct psql
-- (not the pooler), when turning on FLAG_CHIVEBOT. Do not add these
-- objects to schema.sql. The Next app talks to these tables with the
-- Data API and SUPABASE_SECRET_KEY. There is no DATABASE_URL.
--
-- Embedding width is 768 (Gemini outputDimensionality / text-embedding-004).
-- Checkpoint 2 must use the same size.

-- ---------------------------------------------------------------------------
-- vector (pgvector)
-- ---------------------------------------------------------------------------

-- Hosted Supabase can enable this. Local Postgres without pgvector still
-- accepts the CREATE EXTENSION line; tables below need the type. If it
-- did not apply, enable vector in the Dashboard (Database → Extensions)
-- and re-run this file.
do $vector$
begin
  create extension if not exists vector;
exception
  when others then
    raise notice
      'vector not available; skipped create extension (%). Enable vector in Database → Extensions and re-run scripts/chivebot.sql.',
      sqlerrm;
end;
$vector$;

do $need_vector$
begin
  if to_regtype('vector') is null then
    raise exception
      'vector type is not available. Enable the vector extension in Database → Extensions, then re-run scripts/chivebot.sql.';
  end if;
end;
$need_vector$;

-- ---------------------------------------------------------------------------
-- chivebot_session (one chat thread)
-- ---------------------------------------------------------------------------

-- Clear Chat deletes this row. Messages and query embeddings cascade.
-- Factory Reset is not an org FK: checkpoint 2 must delete sessions too.
create table public.chivebot_session (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_chivebot_session_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger chivebot_session_set_updated_at
  before update on public.chivebot_session
  for each row
  execute function public.set_chivebot_session_updated_at();

alter table public.chivebot_session enable row level security;
grant select, insert, update, delete on public.chivebot_session to service_role;

-- ---------------------------------------------------------------------------
-- chivebot_message (user and assistant turns)
-- ---------------------------------------------------------------------------

-- Assistant rows may store citation targets (org + iso) used in the reply.
create table public.chivebot_message (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chivebot_session (id) on delete cascade,
  role text not null,
  content text not null default '',
  citations jsonb,
  created_at timestamptz not null default now(),
  constraint chivebot_message_role_valid check (role in ('user', 'assistant'))
);

create index chivebot_message_session_id_created_at_idx
  on public.chivebot_message (session_id, created_at);

alter table public.chivebot_message enable row level security;
grant select, insert, update, delete on public.chivebot_message to service_role;

-- ---------------------------------------------------------------------------
-- chivebot_query_embedding (one vector per user question)
-- ---------------------------------------------------------------------------

-- Written on Send. session_id is denormalized so Clear Chat can cascade
-- without walking messages. Unique on message_id: one vector per turn.
create table public.chivebot_query_embedding (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chivebot_session (id) on delete cascade,
  message_id uuid not null references public.chivebot_message (id) on delete cascade,
  embedding vector(768) not null,
  created_at timestamptz not null default now(),
  constraint chivebot_query_embedding_message_id_key unique (message_id)
);

create index chivebot_query_embedding_session_id_idx
  on public.chivebot_query_embedding (session_id);

alter table public.chivebot_query_embedding enable row level security;
grant select, insert, update, delete on public.chivebot_query_embedding to service_role;

-- ---------------------------------------------------------------------------
-- chivebot_entry_embedding (Archive field index)
-- ---------------------------------------------------------------------------

-- One row per embeddable field. Unique (section, source_id).
-- source_id is days.id for notes/comments/attendance/rating, work.id for
-- work_*, citations.id for citation_*. Empty auto-generated shells are
-- not embedded (checkpoint 2). embedding may be null if Gemini quota
-- fails on save; the Archive write still stands.
--
-- Org / day / work / citation FKs cascade so delete, clear day, bulk
-- delete, and deleting organizations (Factory Reset) drop matching rows.
create table public.chivebot_entry_embedding (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  source_id text not null,
  organization_id text not null references public.organizations (id) on delete cascade,
  day_id uuid not null references public.days (id) on delete cascade,
  work_date date not null,
  work_id text references public.work (id) on delete cascade,
  citation_id text references public.citations (id) on delete cascade,
  content text not null default '',
  embedding vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chivebot_entry_embedding_section_source unique (section, source_id),
  constraint chivebot_entry_embedding_section_valid check (
    section in (
      'notes',
      'comments',
      'attendance',
      'rating',
      'work_title',
      'work_description',
      'work_link',
      'citation_title',
      'citation_url',
      'citation_filename'
    )
  )
);

create index chivebot_entry_embedding_organization_id_idx
  on public.chivebot_entry_embedding (organization_id);

create index chivebot_entry_embedding_day_id_idx
  on public.chivebot_entry_embedding (day_id);

create index chivebot_entry_embedding_work_id_idx
  on public.chivebot_entry_embedding (work_id);

create index chivebot_entry_embedding_citation_id_idx
  on public.chivebot_entry_embedding (citation_id);

-- Optional: nearest-neighbor still works with a sequential scan if hnsw
-- is missing. Null embeddings are not indexed.
do $idx$
begin
  execute $sql$
    create index chivebot_entry_embedding_embedding_idx
      on public.chivebot_entry_embedding
      using hnsw (embedding vector_cosine_ops)
  $sql$;
exception
  when others then
    raise notice
      'hnsw index skipped (%). match_chivebot_entries still works.',
      sqlerrm;
end;
$idx$;

create or replace function public.set_chivebot_entry_embedding_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger chivebot_entry_embedding_set_updated_at
  before update on public.chivebot_entry_embedding
  for each row
  execute function public.set_chivebot_entry_embedding_updated_at();

alter table public.chivebot_entry_embedding enable row level security;
grant select, insert, update, delete on public.chivebot_entry_embedding to service_role;

-- ---------------------------------------------------------------------------
-- match_chivebot_entries
-- ---------------------------------------------------------------------------

-- Closest passages already inside the logging window: Archive Start (today
-- if unset) through today, then Date Active through the day before Date
-- Inactive. An organization with no Date Active contributes nothing.
-- Leftovers outside that window never take one of the match_count slots.
create or replace function public.match_chivebot_entries(
  query_embedding vector(768),
  match_count integer default 16
)
returns table (
  id uuid,
  section text,
  source_id text,
  organization_id text,
  day_id uuid,
  work_date date,
  work_id text,
  citation_id text,
  content text,
  similarity double precision
)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  today_local date;
  archive_start date;
begin
  -- Keep scanning the nearest-neighbor index until match_count rows inside
  -- the window are found. Older pgvector builds do not have this setting.
  begin
    perform set_config('hnsw.iterative_scan', 'strict_order', true);
  exception
    when undefined_object then
      null;
  end;

  today_local := public.archive_today();
  select s.archive_start_date into archive_start
  from public.settings s
  where s.id = 1;

  return query
  select
    e.id,
    e.section,
    e.source_id,
    e.organization_id,
    e.day_id,
    e.work_date,
    e.work_id,
    e.citation_id,
    e.content,
    (1 - (e.embedding <=> query_embedding))::double precision as similarity
  from public.chivebot_entry_embedding e
  join public.organizations o on o.id = e.organization_id
  where e.embedding is not null
    and o.date_active is not null
    and e.work_date >= greatest(coalesce(archive_start, today_local), o.date_active)
    and e.work_date <= least(
      today_local,
      coalesce(o.date_inactive - 1, today_local)
    )
  order by e.embedding <=> query_embedding
  limit greatest(coalesce(match_count, 16), 0);
end;
$fn$;

revoke all on function public.match_chivebot_entries(vector, integer) from public;
grant execute on function public.match_chivebot_entries(vector, integer) to service_role;
