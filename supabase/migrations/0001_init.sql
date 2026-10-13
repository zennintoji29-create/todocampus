-- =====================================================================
-- CampusOS — 0001_init.sql
-- Supabase PostgreSQL: schema, indexes, triggers, RLS, storage policies.
-- Idempotent enough to be re-run on a fresh project:
--   supabase db reset            (local)
--   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 0. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role         as enum ('student','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type publish_status    as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type assignment_type   as enum ('assignment','project','lab','presentation','essay','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type priority_level    as enum ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type assessment_kind   as enum ('quiz','test','exam','midterm','viva','lab_exam');
exception when duplicate_object then null; end $$;
do $$ begin
  create type announce_category as enum ('notice','class','academic','schedule','event','exam','urgent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type opportunity_cat   as enum ('internship','placement','hackathon','workshop','scholarship','competition','conference','chapter_event');
exception when duplicate_object then null; end $$;
do $$ begin
  create type audience_type     as enum ('all','students','admins','semester');
exception when duplicate_object then null; end $$;
do $$ begin
  create type source_type       as enum ('personal','assignment','assessment','opportunity');
exception when duplicate_object then null; end $$;
do $$ begin
  create type task_status       as enum ('todo','in_progress','completed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type topic_status      as enum ('not_started','in_progress','completed','revision_needed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type career_status     as enum ('saved','planning','applied','assessment','interview','offer','rejected','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type goal_metric       as enum ('topics_completed','assignments_completed','tasks_completed','dsa_problems','study_sessions','study_minutes');
exception when duplicate_object then null; end $$;
do $$ begin
  create type event_kind        as enum ('study_session','exam','assignment','task','event','reminder');
exception when duplicate_object then null; end $$;
do $$ begin
  create type entity_type       as enum ('assignment','assessment','announcement','opportunity','syllabus_unit','syllabus_topic','subject','semester');
exception when duplicate_object then null; end $$;
do $$ begin
  create type doc_kind          as enum ('class_notes','assignment','study_resource','reference','handwritten','personal','syllabus','other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. Helper functions
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- =====================================================================
-- 2. Core: profiles
-- =====================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  role          user_role     not null default 'student',
  roll_number   text,
  semester_id   uuid,
  avatar_path   text,
  timezone      text not null default 'UTC',
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);
comment on column public.profiles.role is
  'Server-authoritative role. Students cannot update their own role: the RLS UPDATE policy below forbids it.';

create table if not exists public.admin_emails (
  email     text primary key,
  created_at timestamptz not null default now()
);

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role helpers (must be defined AFTER profiles table exists)
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'student'::user_role);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_user_role() = 'admin'; $$;

-- New user -> profile (default student, or admin only if allow-listed).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role user_role := 'student';
begin
  if lower(coalesce(new.raw_user_meta_data->>'requested_role','')) = 'admin'
     or exists (select 1 from public.admin_emails where email = lower(new.email)) then
    v_role := 'admin';
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,'user'),'@',1)),
          v_role)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 3. Academic structure: semesters -> subjects -> units -> topics
-- =====================================================================
create table if not exists public.semesters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  number      integer not null check (number between 1 and 12),
  start_date  date,
  end_date    date,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (number)
);

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  code        text not null,
  name        text not null,
  credits     numeric(3,1) check (credits is null or credits >= 0),
  faculty     text,
  description text,
  position    integer not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (semester_id, code)
);

create table if not exists public.syllabus_units (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  unit_number integer not null check (unit_number > 0),
  title       text not null,
  description text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (subject_id, unit_number)
);

create table if not exists public.syllabus_topics (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.syllabus_units(id) on delete cascade,
  title         text not null,
  details       text,
  outcomes      text,
  position      integer not null default 0,
  est_minutes   integer check (est_minutes is null or est_minutes > 0),
  is_optional   boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles
  drop constraint if exists profiles_semester_id_fkey;
alter table public.profiles
  add constraint profiles_semester_id_fkey foreign key (semester_id)
  references public.semesters(id) on delete set null;

create index if not exists idx_subjects_semester on public.subjects(semester_id);
create index if not exists idx_units_subject     on public.syllabus_units(subject_id);
create index if not exists idx_topics_unit       on public.syllabus_topics(unit_id, position);

create trigger trg_semesters_updated before update on public.semesters   for each row execute function public.set_updated_at();
create trigger trg_subjects_updated  before update on public.subjects    for each row execute function public.set_updated_at();
create trigger trg_units_updated     before update on public.syllabus_units   for each row execute function public.set_updated_at();
create trigger trg_topics_updated    before update on public.syllabus_topics  for each row execute function public.set_updated_at();

-- =====================================================================
-- 4. Official content: assignments, assessments, announcements, opportunities
-- =====================================================================
create table if not exists public.assignments (
  id               uuid primary key default gen_random_uuid(),
  code             text,
  title            text not null check (length(btrim(title)) > 0),
  description      text not null default '',
  subject_id       uuid references public.subjects(id)  on delete set null,
  semester_id      uuid references public.semesters(id) on delete set null,
  kind             assignment_type not null default 'assignment',
  instructions     text,
  reference_links  jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(reference_links) = 'array'),
  publish_date     date,
  deadline         timestamptz not null,
  priority         priority_level not null default 'medium',
  status           publish_status not null default 'draft',
  archived_at      timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  updated_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_assignments_status_deadline on public.assignments(status, deadline);
create index if not exists idx_assignments_subject on public.assignments(subject_id, status);
create index if not exists idx_assignments_semester on public.assignments(semester_id, status);

create table if not exists public.assessments (
  id               uuid primary key default gen_random_uuid(),
  kind             assessment_kind not null default 'quiz',
  title            text not null check (length(btrim(title)) > 0),
  subject_id       uuid references public.subjects(id)  on delete set null,
  semester_id      uuid references public.semesters(id) on delete set null,
  starts_at        timestamptz not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  syllabus_coverage text,
  instructions     text,
  reference_links  jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(reference_links) = 'array'),
  venue            text,
  status           publish_status not null default 'draft',
  archived_at      timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  updated_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_assessments_start on public.assessments(status, starts_at);

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  body          text not null default '',
  category      announce_category not null default 'notice',
  audience      audience_type not null default 'all',
  audience_semester_id uuid references public.semesters(id) on delete cascade,
  is_pinned     boolean not null default false,
  publish_at    timestamptz not null default now(),
  status        publish_status not null default 'draft',
  archived_at   timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_announcements_pub on public.announcements(status, publish_at desc);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)     on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table if not exists public.opportunities (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (length(btrim(title)) > 0),
  category          opportunity_cat not null,
  organization      text not null default '',
  role              text,
  eligibility       text,
  description       text not null default '',
  apply_url         text check (apply_url is null or apply_url ~* '^https?://'),
  application_deadline timestamptz,
  publish_date      date,
  location          text,
  stipend           text,
  status            publish_status not null default 'draft',
  archived_at       timestamptz,
  created_by        uuid references public.profiles(id) on delete set null,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_opportunities_status on public.opportunities(status, category, application_deadline);

-- Official resources & generic attachments (storage-backed)
create table if not exists public.official_resources (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  url          text check (url is null or url ~* '^https?://'),
  storage_path text,
  subject_id   uuid references public.subjects(id) on delete set null,
  semester_id  uuid references public.semesters(id) on delete set null,
  topic_id     uuid references public.syllabus_topics(id) on delete set null,
  status       publish_status not null default 'published',
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.attachments (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('assignment','assessment','announcement','opportunity','official_resource')),
  entity_id   uuid not null,
  label       text not null default '',
  storage_path text not null,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_attachments_entity on public.attachments(entity_type, entity_id);

create trigger trg_assignments_updated   before update on public.assignments   for each row execute function public.set_updated_at();
create trigger trg_assessments_updated   before update on public.assessments   for each row execute function public.set_updated_at();
create trigger trg_announcements_updated before update on public.announcements for each row execute function public.set_updated_at();
create trigger trg_opportunities_updated before update on public.opportunities for each row execute function public.set_updated_at();
create trigger trg_offres_updated       before update on public.official_resources for each row execute function public.set_updated_at();

-- =====================================================================
-- 5. Personal workspace
-- =====================================================================
create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  source_type       source_type not null default 'personal',
  source_id         uuid,                       -- assignment/assessment/opportunity id
  -- Official snapshot (kept in sync by trigger; never student-editable)
  official_title       text,
  official_description text,
  official_deadline    timestamptz,
  official_status      publish_status,
  source_unavailable   boolean not null default false,
  synced_at            timestamptz,
  -- Personal fields (student-owned)
  title            text not null check (length(btrim(title)) > 0),
  description      text,
  subject_id       uuid references public.subjects(id) on delete set null,
  semester_id      uuid references public.semesters(id) on delete set null,
  deadline         timestamptz,
  priority         priority_level not null default 'medium',
  status           task_status not null default 'todo',
  personal_notes   text,
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes >= 0),
  is_focus         boolean not null default false,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint personal_or_linked check (
    (source_type = 'personal' and source_id is null) or
    (source_type <> 'personal' and source_id is not null)
  ),
  constraint deadline_matches_official check (
    source_type = 'personal' or deadline is not distinct from official_deadline
  )
);
-- Rule 6: an item can only be imported once per student (DB-enforced).
create unique index if not exists uniq_task_import
  on public.tasks(user_id, source_type, source_id)
  where source_id is not null;
create index if not exists idx_tasks_user_deadline on public.tasks(user_id, status, deadline);
create index if not exists idx_tasks_user_subject  on public.tasks(user_id, subject_id);

create table if not exists public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  title      text not null check (length(btrim(title)) > 0),
  is_done    boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_subtasks_task on public.subtasks(task_id, position);
create trigger trg_subtasks_updated before update on public.subtasks for each row execute function public.set_updated_at();

-- Per-subject auto-subscribe
create table if not exists public.subject_subscriptions (
  user_id               uuid not null references public.profiles(id) on delete cascade,
  subject_id            uuid not null references public.subjects(id)  on delete cascade,
  auto_import_assignments boolean not null default true,
  auto_import_assessments  boolean not null default false,
  created_at            timestamptz not null default now(),
  primary key (user_id, subject_id)
);

create table if not exists public.topic_progress (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  topic_id        uuid not null references public.syllabus_topics(id) on delete cascade,
  status          topic_status not null default 'not_started',
  notes           text,
  last_studied_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, topic_id)
);
create index if not exists idx_topic_progress_user on public.topic_progress(user_id, status);
create trigger trg_topic_progress_updated before update on public.topic_progress for each row execute function public.set_updated_at();

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  content     text,
  tags        text[] not null default '{}',
  semester_id uuid references public.semesters(id) on delete set null,
  subject_id  uuid references public.subjects(id)  on delete set null,
  unit_id     uuid references public.syllabus_units(id) on delete cascade,
  topic_id    uuid references public.syllabus_topics(id) on delete cascade,
  is_pinned   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_notes_user on public.notes(user_id, updated_at desc);
create trigger trg_notes_updated before update on public.notes for each row execute function public.set_updated_at();

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  description  text,
  kind         doc_kind not null default 'other',
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes > 0),
  extracted_text text,
  extract_status text check (extract_status is null or extract_status in ('pending','done','unsupported','failed')),
  semester_id  uuid references public.semesters(id) on delete set null,
  subject_id   uuid references public.subjects(id)  on delete set null,
  unit_id      uuid references public.syllabus_units(id) on delete set null,
  topic_id     uuid references public.syllabus_topics(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_documents_user on public.documents(user_id, updated_at desc);
create trigger trg_documents_updated before update on public.documents for each row execute function public.set_updated_at();

create table if not exists public.career_applications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  source_opportunity_id uuid references public.opportunities(id) on delete set null,
  title               text not null,
  organization        text not null default '',
  role                text,
  opportunity_type    opportunity_cat not null default 'internship',
  apply_url           text check (apply_url is null or apply_url ~* '^https?://'),
  deadline            timestamptz,
  applied_on          date,
  status              career_status not null default 'saved',
  personal_notes      text,
  next_action         text,
  links               jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists uniq_career_import
  on public.career_applications(user_id, source_opportunity_id)
  where source_opportunity_id is not null;
create index if not exists idx_career_user_status on public.career_applications(user_id, status);

create table if not exists public.study_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  description  text,
  kind         event_kind not null default 'study_session',
  subject_id   uuid references public.subjects(id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  location     text,
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint study_event_span check (ends_at > starts_at)
);
create index if not exists idx_events_user_start on public.study_events(user_id, starts_at);

create table if not exists public.weekly_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  week_start  date not null,
  title       text not null,
  metric      goal_metric not null,
  target      integer not null check (target > 0),
  subject_id  uuid references public.subjects(id) on delete set null,
  unit_id     uuid references public.syllabus_units(id) on delete set null,
  completed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start, title)
);
create index if not exists idx_goals_user_week on public.weekly_goals(user_id, week_start desc);
create trigger trg_goals_updated before update on public.weekly_goals for each row execute function public.set_updated_at();

create table if not exists public.goal_logs (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.weekly_goals(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     integer not null check (amount <> 0),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists idx_goal_logs_goal on public.goal_logs(goal_id, created_at desc);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'announcement',
  title       text not null,
  body        text,
  link        text,
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, read_at, created_at desc);
create unique index if not exists uniq_notification_event
  on public.notifications(user_id, kind, entity_type, entity_id)
  where entity_id is not null and kind in ('announcement','deadline');

create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_user on public.activity_log(user_id, created_at desc);

-- =====================================================================
-- 6. Triggers: timestamps, sync, notifications, activity
-- =====================================================================
create trigger trg_tasks_updated before update on public.tasks for each row execute function public.set_updated_at();

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log(user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), tg_op, tg_table_name, coalesce((to_jsonb(new)->>'id')::uuid, null),
          jsonb_build_object('title', coalesce(to_jsonb(new)->>'title', '')));
  return new;
end $$;

-- Keep linked tasks' OFFICIAL fields in sync without touching personal fields
create or replace function public.sync_task_from_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tasks
     set official_title       = new.title,
         official_description = new.description,
         official_deadline    = new.deadline,
         official_status      = new.status,
         deadline             = new.deadline,       -- official deadline is authoritative
         source_unavailable   = (new.status = 'archived'),
         synced_at            = now()
   where source_type = 'assignment' and source_id = new.id;
  return new;
end $$;
create trigger trg_sync_assignment after update of title, description, deadline, status on public.assignments
  for each row execute function public.sync_task_from_assignment();

create or replace function public.sync_task_from_assessment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tasks
     set official_title       = new.title,
         official_description = coalesce(new.instructions, ''),
         official_deadline    = new.starts_at,
         official_status      = new.status,
         deadline             = new.starts_at,
         source_unavailable   = (new.status = 'archived'),
         synced_at            = now()
   where source_type = 'assessment' and source_id = new.id;
  return new;
end $$;
create trigger trg_sync_assessment after update of title, instructions, starts_at, status on public.assessments
  for each row execute function public.sync_task_from_assessment();

-- Hard-delete of an official record must not silently destroy personal history
create or replace function public.mark_tasks_source_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tasks
     set source_unavailable = true, synced_at = now()
   where source_type = 'assignment' and source_id = old.id;
  return old;
end $$;
create trigger trg_tasks_assignment_deleted after delete on public.assignments
  for each row execute function public.mark_tasks_source_gone();

create or replace function public.mark_tasks_source_gone_assessment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tasks set source_unavailable = true, synced_at = now()
   where source_type = 'assessment' and source_id = old.id;
  return old;
end $$;
create trigger trg_tasks_assessment_deleted after delete on public.assessments
  for each row execute function public.mark_tasks_source_gone_assessment();

-- Fan out in-app notifications when an announcement is published
create or replace function public.notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    insert into public.notifications(user_id, kind, title, body, link, entity_type, entity_id)
    select p.id, 'announcement', new.title,
           left(coalesce(new.body,''), 180),
           '/announcements/' || new.id, 'announcement', new.id
      from public.profiles p
     where case new.audience
             when 'admins'    then p.role = 'admin'
             when 'students'  then p.role = 'student'
             when 'semester'  then p.semester_id = new.audience_semester_id
             else true
           end
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger trg_announcement_notify
  after insert or update of status on public.announcements
  for each row execute function public.notify_announcement();

create trigger trg_activity_tasks  after insert or update on public.tasks      for each row execute function public.log_activity();
create trigger trg_activity_notes  after insert or update on public.notes      for each row execute function public.log_activity();
create trigger trg_activity_career after insert or update on public.career_applications for each row execute function public.log_activity();

-- =====================================================================
-- 7. Row Level Security
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.admin_emails         enable row level security;
alter table public.semesters            enable row level security;
alter table public.subjects             enable row level security;
alter table public.syllabus_units       enable row level security;
alter table public.syllabus_topics      enable row level security;
alter table public.assignments          enable row level security;
alter table public.assessments          enable row level security;
alter table public.announcements        enable row level security;
alter table public.announcement_reads   enable row level security;
alter table public.opportunities        enable row level security;
alter table public.official_resources   enable row level security;
alter table public.attachments          enable row level security;
alter table public.tasks                enable row level security;
alter table public.subtasks              enable row level security;
alter table public.subject_subscriptions enable row level security;
alter table public.topic_progress       enable row level security;
alter table public.notes                enable row level security;
alter table public.documents             enable row level security;
alter table public.career_applications  enable row level security;
alter table public.study_events          enable row level security;
alter table public.weekly_goals          enable row level security;
alter table public.goal_logs             enable row level security;
alter table public.notifications         enable row level security;
alter table public.activity_log          enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert with check (id = auth.uid());
-- NOTE: role is NOT in the allowed column list (enforced by column grants below).
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = public.current_user_role());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- Least privilege: a student may only ever change these columns of their profile.
revoke update on public.profiles from authenticated;
grant update (full_name, roll_number, avatar_path, timezone, semester_id) on public.profiles to authenticated;

-- ---------- admin_emails (admin only) ----------
drop policy if exists admin_emails_admin on public.admin_emails;
create policy admin_emails_admin on public.admin_emails for all using (public.is_admin()) with check (public.is_admin());

-- ---------- official academic structure: public read, admin write ----------
do $$
declare t text;
begin
  foreach t in array array['semesters','subjects','syllabus_units','syllabus_topics'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'')', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t||'_write', t);
  end loop;
end $$;

-- ---------- assignments / assessments / opportunities / resources ----------
do $$
declare t text;
begin
  foreach t in array array['assignments','assessments','opportunities','official_resources'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read_pub', t);
    execute format(
      'create policy %I on public.%I for select using (status <> ''archived'' or public.is_admin())',
      t||'_read_pub', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t||'_write', t);
  end loop;
end $$;

-- ---------- announcements ----------
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select
  using (status = 'published' or public.is_admin());
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists announcement_reads_own on public.announcement_reads;
create policy announcement_reads_own on public.announcement_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- attachments (official files) ----------
drop policy if exists attachments_read on public.attachments;
create policy attachments_read on public.attachments for select using (auth.role() = 'authenticated');
drop policy if exists attachments_write on public.attachments;
create policy attachments_write on public.attachments for all using (public.is_admin()) with check (public.is_admin());

-- ---------- tasks (private per student) ----------
drop policy if exists tasks_own on public.tasks;
create policy tasks_own on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- subtasks ----------
drop policy if exists subtasks_own on public.subtasks;
create policy subtasks_own on public.subtasks for all
  using (exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()));

-- ---------- subscriptions ----------
drop policy if exists subs_own on public.subject_subscriptions;
create policy subs_own on public.subject_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- topic progress ----------
drop policy if exists topic_progress_own on public.topic_progress;
create policy topic_progress_own on public.topic_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- notes / documents / career / events / goals ----------
do $$
declare t text;
begin
  foreach t in array array['notes','documents','career_applications','study_events','weekly_goals','notifications'] loop
    execute format('drop policy if exists %I on public.%I', t||'_own', t);
    execute format('create policy %I on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_own', t);
  end loop;
end $$;

drop policy if exists goal_logs_own on public.goal_logs;
create policy goal_logs_own on public.goal_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- activity log ----------
drop policy if exists activity_read_own on public.activity_log;
create policy activity_read_own on public.activity_log for select
  using (user_id = auth.uid() or public.is_admin());

-- =====================================================================
-- 8. Storage
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('official', 'official', false),
       ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists official_files_read on storage.objects;
create policy official_files_read on storage.objects for select
  using (bucket_id = 'official' and auth.role() = 'authenticated');

drop policy if exists official_files_write on storage.objects;
create policy official_files_write on storage.objects for insert
  with check (bucket_id = 'official' and public.is_admin());
drop policy if exists official_files_update on storage.objects;
create policy official_files_update on storage.objects for update using (bucket_id = 'official' and public.is_admin());
drop policy if exists official_files_delete on storage.objects;
create policy official_files_delete on storage.objects for delete using (bucket_id = 'official' and public.is_admin());

-- Private bucket: object key must start with the owner's uid folder.
drop policy if exists documents_read_own on storage.objects;
create policy documents_read_own on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists documents_write_own on storage.objects;
create policy documents_write_own on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists documents_update_own on storage.objects;
create policy documents_update_own on storage.objects for update
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists documents_delete_own on storage.objects;
create policy documents_delete_own on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
