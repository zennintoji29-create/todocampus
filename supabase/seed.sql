-- =====================================================================
-- CampusOS — dev seed (LABELLED DEMO DATA).
-- Safe to run on a fresh local project only. Creates no user accounts
-- (Supabase Auth rows cannot be seeded with a usable password hash here);
-- register through the UI instead.
-- Run with:  supabase db reset
-- =====================================================================

-- Promote yourself to admin (replace with your email):
-- insert into public.admin_emails(email) values ('you@college.edu') on conflict do nothing;
-- After registering, promote an existing admin without touching auth.users directly:
--   update public.profiles set role = 'admin' where email = 'you@college.edu';

insert into public.semesters (id, name, number, start_date, end_date, is_active) values
 ('11111111-1111-4111-8111-111111111111','Semester 5',5,'2025-07-21','2025-12-19',true),
 ('22222222-2222-4222-8222-222222222222','Semester 6',6,'2026-01-05','2026-05-16',false)
on conflict (id) do nothing;

insert into public.subjects (id, semester_id, code, name, credits, faculty, position) values
 ('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','CS301','Database Management Systems',4.0,'Dr. R. Menon',1),
 ('a2222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','CS302','Operating Systems',4.0,'Prof. A. Iyer',2),
 ('a3333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','CS303','Computer Networks',3.0,'Dr. S. Kulkarni',3),
 ('a4444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','MA301','Discrete Mathematics',3.0,'Dr. P. Nair',4)
on conflict (id) do nothing;

insert into public.syllabus_units (id, subject_id, unit_number, title, description) values
 ('b1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',1,'Relational Model','ER model, relations, keys, normalisation'),
 ('b2222222-2222-4222-8222-222222222222','a1111111-1111-4111-8111-111111111111',2,'SQL and Query Processing','DDL, DML, joins, indexing'),
 ('b3333333-3333-4333-8333-333333333333','a2222222-2222-4222-8222-222222222222',1,'Processes and Threads','Scheduling, synchronisation, deadlocks'),
 ('b4444444-4444-4444-8444-444444444444','a2222222-2222-4222-8222-222222222222',2,'Memory Management','Paging, segmentation, virtual memory')
on conflict (id) do nothing;

insert into public.syllabus_topics (id, unit_id, title, position, est_minutes) values
 ('c1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111','Entity-Relationship modelling',1,90),
 ('c2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','Relational algebra',2,90),
 ('c3333333-3333-4333-8333-333333333333','b1111111-1111-4111-8111-111111111111','Normal forms (1NF - 4NF)',3,120),
 ('c4444444-4444-4444-8444-444444444444','b2222222-2222-4222-8222-222222222222','SQL DDL and constraints',1,90),
 ('c5555555-5555-4555-8555-555555555555','b2222222-2222-4222-8222-222222222222','Joins and subqueries',2,120),
 ('c6666666-6666-4666-8666-666666666666','b2222222-2222-4222-8222-222222222222','Indexes and query plans',3,90),
 ('c7777777-7777-4777-8777-777777777777','b3333333-3333-4333-8333-333333333333','Scheduling algorithms',1,120),
 ('c8888888-8888-4888-8888-888888888888','b3333333-3333-4333-8333-333333333333','Classical synchronisation problems',2,120),
 ('c9999999-9999-4999-8999-999999999999','b4444444-4444-4444-8444-444444444444','Paging and page replacement',1,120)
on conflict (id) do nothing;

insert into public.assignments (id, code, title, description, subject_id, semester_id, kind, deadline, priority, status, instructions, reference_links, publish_date) values
 ('d1111111-1111-4111-8111-111111111111','DBMS-01','Normalisation Assignment','Normalise the given schema up to 3NF and explain each functional dependency.',
  'a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','assignment', now() + interval '3 days', 'high','published',
  'Submit as a single PDF, max 10 pages.', '["https://www.postgresql.org/docs/current/ddl.html"]', current_date),
 ('d2222222-2222-4222-8222-222222222222','OS-02','Scheduler Simulation','Write a simulation comparing FCFS, SJF and Round Robin.',
  'a2222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','project', now() + interval '9 days', 'medium','published',
  'Source code plus a short report.', '[]', current_date),
 ('d3333333-3333-4333-8333-333333333333','CN-01','TCP Congestion Control Lab','Measure throughput under varying congestion windows.',
  'a3333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','lab', now() - interval '2 days', 'urgent','published',
  'Bring your own capture files.', '[]', current_date - 7)
on conflict (id) do nothing;

insert into public.assessments (id, kind, title, subject_id, semester_id, starts_at, duration_minutes, syllabus_coverage, venue, status) values
 ('e1111111-1111-4111-8111-111111111111','quiz','DBMS Unit 1 Quiz','a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', now() + interval '2 days', 30, 'Unit 1: Relational Model','LH-302','published'),
 ('e2222222-2222-4222-8222-222222222222','midterm','OS Mid-Term Examination','a2222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111', now() + interval '16 days', 120, 'Units 1 - 2','Main Auditorium','published'),
 ('e3333333-3333-4333-8333-333333333333','exam','DBMS Final Examination','a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', now() + interval '60 days', 180, 'Full syllabus','Main Auditorium','published')
on conflict (id) do nothing;

insert into public.announcements (id, title, body, category, audience, publish_at, status, is_pinned) values
 ('f1111111-1111-4111-8111-111111111111','Mid-semester exam timetable published','The exam schedule for all subjects is now live in the Assessments section. Download the hall ticket format before the 20th.','exam','all', now(), 'published', true),
 ('f2222222-2222-4222-8222-222222222222','Library extended hours','Reading room hours are extended to 11 PM during the examination period.','notice','all', now() - interval '2 days','published', false),
 ('f3333333-3333-4333-8333-333333333333','Hackathon registration opens','A 36-hour inter-college hackathon opens on Monday. Teams of four.','event','students', now() - interval '1 day','published', false)
on conflict (id) do nothing;

insert into public.opportunities (id, title, category, organization, role, eligibility, description, apply_url, application_deadline, status) values
 ('a0111111-1111-4111-8111-111111111111','Backend Engineering Internship','internship','Nexlify','Backend Intern','B.Tech 2nd year+, 60% aggregate, Java or Go','Six-month paid internship building distributed services.','https://example.com/apply', now() + interval '12 days','published'),
 ('a0222222-2222-4222-8222-222222222222','Campus Placement Drive','placement','Meridian Systems','Graduate Engineer Trainee','Final year, no live backlogs','Mass hiring drive with pre-placement offer for shortlisted candidates.','https://example.com/mrd', now() + interval '30 days','published'),
 ('a0333333-3333-4333-8333-333333333333','Open Source Hackathon','hackathon','CampusOS Collective','Participant','Open to all years','Build and ship a project in 36 hours. Prizes and internships.','https://example.com/hack', now() + interval '7 days','published')
on conflict (id) do nothing;

insert into public.official_resources (title, description, url, subject_id, status) values
 ('DBMS Reference Notes (PDF)','Compiled reference for Units 1-2.','https://example.org/dbms.pdf','a1111111-1111-4111-8111-111111111111','published')
on conflict do nothing;
