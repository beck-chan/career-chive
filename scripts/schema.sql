-- CareerChive schema: one-user archive settings, login rate-limit rows,
-- organizations, days, and the work / citation rows on each day.
-- Notes, rating, comments, and attendance live on the day row (1:1).
--
-- Run this in the Supabase SQL editor on an empty project. The Next app
-- talks to these tables with the service role (checkpoint 2). There is no
-- Google SSO and no public anon access.

-- ---------------------------------------------------------------------------
-- settings (singleton id = 1)
-- ---------------------------------------------------------------------------

-- Username + password hash for FLAG_PRIVATE. password_encrypted is an
-- AES-256-GCM copy keyed from SESSION_SECRET so Settings can refill the
-- password field; login still verifies password_hash (scrypt). It cannot
-- be derived from the hash. Archive Start is the floor for logging pickers
-- and for creating day rows. Autogenerate From is when empty weekday shells
-- start; it is independent of Archive Start (clamped up to Archive Start
-- when generating so inserts are not rejected). Both start null. timezone
-- (IANA, default UTC) is the calendar day and auto-generate
-- midnight for this archive. Factory Reset leaves this row in place.
create table public.settings (
  id integer primary key check (id = 1),
  username text not null default '',
  password_hash text not null default '',
  password_encrypted text,
  archive_start_date date,
  autogenerate_start_date date,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1);

create or replace function public.set_settings_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger settings_set_updated_at
  before update on public.settings
  for each row
  execute function public.set_settings_updated_at();

alter table public.settings enable row level security;
-- No anon/authenticated policies: the app server uses service_role.
grant select, insert, update, delete on public.settings to service_role;

-- ---------------------------------------------------------------------------
-- login_attempts (FLAG_PRIVATE: 3 failed POSTs per rolling hour)
-- ---------------------------------------------------------------------------

-- One row per failed login POST. Count by ip and by username independently.
-- A fourth try in that window is rejected without checking the password.
-- Successful login does not clear the window.
create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  username text not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_ip_attempted_at_idx
  on public.login_attempts (ip, attempted_at desc);

create index login_attempts_username_attempted_at_idx
  on public.login_attempts (username, attempted_at desc);

alter table public.login_attempts enable row level security;
grant select, insert, update, delete on public.login_attempts to service_role;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

-- Weekday flags Sun–Sat (0=Sunday … 6=Saturday). Work orgs default Mon–Fri.
-- Unchecking a weekday stops new auto-inserts; it does not delete rows.
create table public.organizations (
  id text primary key,
  name text not null,
  date_active date,
  date_inactive date,
  hidden boolean not null default false,
  auto_generate_days integer[] not null default '{1,2,3,4,5}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_weekdays_valid check (
    auto_generate_days <@ '{0,1,2,3,4,5,6}'::integer[]
  )
);

create index organizations_name_idx on public.organizations (lower(name));

alter table public.organizations enable row level security;
grant select, insert, update, delete on public.organizations to service_role;

-- ---------------------------------------------------------------------------
-- days (attendance, notes, rating, comments)
-- ---------------------------------------------------------------------------

create table public.days (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  work_date date not null,
  attendance text,
  notes text not null default '',
  rating smallint,
  comments text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint days_organization_work_date unique (organization_id, work_date),
  constraint days_attendance_valid check (
    attendance is null
    or attendance in ('worked', 'sick', 'stat', 'pto')
  ),
  constraint days_rating_valid check (
    rating is null or rating between 1 and 5
  )
);

create index days_organization_work_date_idx
  on public.days (organization_id, work_date desc);

alter table public.days enable row level security;
grant select, insert, update, delete on public.days to service_role;

-- Calendar "today" in the install timezone (fallback UTC).
create or replace function public.archive_today()
returns date
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  tz text;
begin
  select coalesce(nullif(trim(s.timezone), ''), 'UTC')
    into tz
  from public.settings s
  where s.id = 1;
  tz := coalesce(tz, 'UTC');
  begin
    return (now() at time zone tz)::date;
  exception
    when others then
      return (now() at time zone 'UTC')::date;
  end;
end;
$fn$;

revoke all on function public.archive_today() from public;
grant execute on function public.archive_today() to service_role;

-- Manual Create Entry / save may not insert a work_date outside the logging
-- window: Archive Start (today if unset) through today, then Date Active
-- through the day before Date Inactive. Date Inactive itself is outside.
-- Existing rows stay if those bounds move later.
create or replace function public.reject_days_outside_logging_window()
returns trigger
language plpgsql
as $fn$
declare
  archive_start date;
  today_local date;
  date_active date;
  date_inactive date;
begin
  today_local := public.archive_today();

  if new.work_date > today_local then
    raise exception 'Cannot create an entry in the future.';
  end if;

  select s.archive_start_date into archive_start
  from public.settings s
  where s.id = 1;

  if archive_start is not null and new.work_date < archive_start then
    raise exception 'Cannot create an entry before the archive start date.';
  end if;

  if archive_start is null and new.work_date < today_local then
    raise exception 'Cannot create an entry before the archive start date.';
  end if;

  select o.date_active, o.date_inactive
    into date_active, date_inactive
  from public.organizations o
  where o.id = new.organization_id;

  if date_active is not null and new.work_date < date_active then
    raise exception 'Cannot create an entry before the organization date active.';
  end if;

  if date_inactive is not null and new.work_date >= date_inactive then
    raise exception 'Cannot create an entry on or after the organization date inactive.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists days_reject_before_archive_start on public.days;
drop trigger if exists days_reject_outside_logging_window on public.days;
create trigger days_reject_outside_logging_window
  before insert on public.days
  for each row
  execute function public.reject_days_outside_logging_window();

-- ---------------------------------------------------------------------------
-- work (Work Completed rows on a day)
-- ---------------------------------------------------------------------------

create table public.work (
  id text primary key,
  day_id uuid not null references public.days (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  link text not null default '',
  position integer not null default 0
);

create index work_day_id_position_idx on public.work (day_id, position);

alter table public.work enable row level security;
grant select, insert, update, delete on public.work to service_role;

-- ---------------------------------------------------------------------------
-- citations (Citations / Artifacts rows on a day)
-- ---------------------------------------------------------------------------

-- attachment is the original filename shown in the UI.
-- attachment_key is the Cloudflare R2 object key once uploads are wired.
create table public.citations (
  id text primary key,
  day_id uuid not null references public.days (id) on delete cascade,
  title text not null default '',
  url text not null default '',
  attachment text not null default '',
  attachment_key text not null default '',
  position integer not null default 0
);

create index citations_day_id_position_idx on public.citations (day_id, position);

alter table public.citations enable row level security;
grant select, insert, update, delete on public.citations to service_role;

-- ---------------------------------------------------------------------------
-- Auto-Generate Days
-- ---------------------------------------------------------------------------

-- Empty weekday shells for each visible org's checked flags, in
-- [max(autogenerate_start, archive_start, date_active),
--  min(timezone today, the day before date_inactive)]. Date Inactive is
-- outside the window. Hidden orgs are skipped (existing
-- rows stay; unhiding catch-up fills). Does nothing until
-- autogenerate_start_date is set. Attendance starts unset.
-- No future dates, no canned content. Unique
-- (organization_id, work_date) + ON CONFLICT DO NOTHING: never duplicate,
-- never overwrite, never delete (moving Autogenerate From later leaves
-- older rows). Unchecked weekdays are skipped. Catch-up fills missing
-- checked weekdays from Autogenerate From through timezone today when the
-- date is set or the function runs; pg_cron then inserts the new local
-- day near that timezone's midnight. Not called here — a new install
-- starts with zero day rows.
create or replace function public.ensure_generated_days()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  gen_start date;
  archive_start date;
  today_local date;
  window_start date;
begin
  select s.autogenerate_start_date, s.archive_start_date
    into gen_start, archive_start
  from public.settings s
  where s.id = 1;

  if gen_start is null then
    return;
  end if;

  today_local := public.archive_today();
  window_start := gen_start;
  if archive_start is not null and archive_start > window_start then
    window_start := archive_start;
  end if;

  insert into public.days (organization_id, work_date, attendance)
  select
    o.id,
    gs.work_date,
    null
  from public.organizations o
  cross join lateral (
    select d::date as work_date
    from generate_series(
      greatest(
        window_start,
        coalesce(o.date_active, window_start)
      )::timestamp,
      least(
        today_local,
        coalesce(o.date_inactive - 1, today_local)
      )::timestamp,
      interval '1 day'
    ) as d
  ) gs
  where not o.hidden
    and extract(dow from gs.work_date)::integer = any (o.auto_generate_days)
    and gs.work_date <= today_local
    and (o.date_inactive is null or gs.work_date < o.date_inactive)
    and greatest(
      window_start,
      coalesce(o.date_active, window_start)
    ) <= least(
      today_local,
      coalesce(o.date_inactive - 1, today_local)
    )
  on conflict (organization_id, work_date) do nothing;
end;
$fn$;

revoke all on function public.ensure_generated_days() from public;
grant execute on function public.ensure_generated_days() to service_role;

-- Catch-up when Autogenerate From is first set or moved earlier. Moving
-- it later does not delete rows and does not need a new fill. Archive
-- Start no longer fills days.
create or replace function public.ensure_days_on_autogenerate_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.autogenerate_start_date is not null
     and (
       old.autogenerate_start_date is distinct from new.autogenerate_start_date
     )
     and (
       old.autogenerate_start_date is null
       or new.autogenerate_start_date < old.autogenerate_start_date
     ) then
    perform public.ensure_generated_days();
  end if;
  return new;
end;
$fn$;

drop trigger if exists settings_ensure_days_on_archive_start on public.settings;
drop trigger if exists settings_ensure_days_on_autogenerate_start on public.settings;
create trigger settings_ensure_days_on_autogenerate_start
  after update of autogenerate_start_date on public.settings
  for each row
  execute function public.ensure_days_on_autogenerate_start();

create or replace function public.ensure_days_on_timezone()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.timezone is distinct from old.timezone then
    perform public.ensure_generated_days();
  end if;
  return new;
end;
$fn$;

drop trigger if exists settings_ensure_days_on_timezone on public.settings;
create trigger settings_ensure_days_on_timezone
  after update of timezone on public.settings
  for each row
  execute function public.ensure_days_on_timezone();

-- Hourly pg_cron so timezone midnight is hit within an hour. Recreate-same
-- name overwrites. Local Postgres without pg_cron still accepts this file.
-- No Vercel Cron.
do $cron$
begin
  create extension if not exists pg_cron;

  -- Recreate-same-name overwrites (unschedule by id, then schedule).
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'careerchive-ensure-days';

  perform cron.schedule(
    'careerchive-ensure-days',
    '0 * * * *',
    $job$select public.ensure_generated_days()$job$
  );
exception
  when others then
    raise notice
      'pg_cron not available; skipped careerchive-ensure-days (%).',
      sqlerrm;
end;
$cron$;
