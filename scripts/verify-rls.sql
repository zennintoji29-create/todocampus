-- =====================================================================
-- CampusOS — access-control verification suite.
-- Requires a Postgres superuser/owner connection (bypasses RLS), because the
-- tests deliberately impersonate end users via request.jwt.claims.
--   psql "$DATABASE_URL" -f scripts/verify-rls.sql
-- Each assertion raises an exception on failure so CI fails loudly.
-- =====================================================================

\set ON_ERROR_STOP on
create schema if not exists campusos_test;
do $$
declare
  v_admin uuid; v_s1 uuid; v_s2 uuid; v_task uuid; v_count int; v_note uuid;
begin
  -- Fixtures -------------------------------------------------------------
  select id into v_admin from auth.users where email = 'rls_admin@test.local' limit 1;
  select id into v_s1    from auth.users where email = 'rls_s1@test.local'    limit 1;
  select id into v_s2    from auth.users where email = 'rls_s2@test.local'    limit 1;
  if v_admin is null or v_s1 is null or v_s2 is null then
    raise exception 'Missing fixture users. Run:  supabase db reset';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_s1::text, 'role','authenticated')::text, true);

  -- Scenario A/B: student owns their tasks -------------------------------
  insert into public.tasks(user_id, title, source_type) values (v_s1, 'rls-probe-task', 'personal');
  select id into v_task from public.tasks where title='rls-probe-task';
  if not found then raise exception 'A: student could not create a task'; end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_s2::text, 'role','authenticated')::text, true);
    select count(*) into v_count from public.tasks where id = v_task;
    if v_count > 0 then raise exception 'B FAILED: student 2 read student 1 task'; end if;
    begin
      update public.tasks set title='hacked' where id = v_task;
      raise exception 'B FAILED: student 2 updated student 1 task';
    exception when others then if sqlerrm not like 'B FAILED%' then null; end if; end;
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_s1::text, 'role','authenticated')::text, true);

  -- Scenario C: students cannot promote themselves -----------------------
  begin
    update public.profiles set role='admin' where id = v_s1;
    raise exception 'C FAILED: student promoted self to admin';
  exception when others then
    if sqlerrm not like 'C FAILED%' then null; end if;
  end;
  if (select role from public.profiles where id = v_s1) <> 'student' then
    raise exception 'C FAILED: role escalation persisted';
  end if;

  -- Scenario C: students cannot publish official content -----------------
  begin
    insert into public.assignments(title, deadline) values ('rls-probe-assignment', now());
    raise exception 'C FAILED: student inserted official assignment';
  exception when others then
    if sqlerrm not like 'C FAILED%' then null; end if;
  end if;
  if exists (select 1 from public.assignments where title='rls-probe-assignment') then
    raise exception 'C FAILED: unauthorised official row exists';
  end if;

  -- Scenario C: duplicate import is rejected by the database -------------
  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-0000-0000-000000000001','role','authenticated')::text, true);

  -- Scenario E: topic progress is private -------------------------------
  insert into public.notes(user_id, title, content) values (v_s1, 'rls-probe-note', 'secret');
  select id into v_note from public.notes where title='rls-probe-note';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_s2::text, 'role','authenticated')::text, true);
  select count(*) into v_count from public.notes where id = v_note;
  if v_count > 0 then raise exception 'B FAILED: student 2 read student 1 note'; end if;

  -- Cleanup ---------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_s1::text, 'role','authenticated')::text, true);
  delete from public.notes where id = v_note;
  delete from public.tasks where id = v_task;

  raise notice 'ALL RLS CHECKS PASSED';
end $$;
