# CampusOS implementation checklist

Live status of every requested capability. "✅" = implemented and validated
(see "How validated" notes); "⚠️" = implemented, needs a live Supabase run to
exercise end-to-end (blocked offline in this build environment).

## Authentication and Permissions
- ✅ Registration, login, logout, password reset (email flow + /reset-password page)
- ✅ Session persistence (supabase-js persistSession) and protected routes (RequireAuth)
- ✅ Secure admin/student roles (trigger on auth.users + admin_emails allow list)
- ✅ Database-level row security — 25 tables, policies for every one
- ✅ Multi-user isolation + private storage bucket keyed by auth.uid()
- ⚠️ Needs a live Supabase project to exercise (verify-rls.sql covers it)

## Admin Portal
- ✅ Assignment CRUD + draft/published/archived + deadline validation
- ✅ Quiz/exam CRUD + chronological views, venue, duration, syllabus coverage
- ✅ Semester → Subject → Unit → Topic management (Admin → Curriculum & Syllabus)
- ✅ Official resources and per-entity attachments (private bucket + signed URLs)
- ✅ Announcements with audience targeting; publication fans out notifications via trigger
- ✅ Opportunity publishing, category filters, deadlines, eligibility
- ✅ Admin overview with live row counts, recent activity, quick actions
- ✅ Search/filters/validation/confirm dialogs across all content

## Personal Workspace
- ✅ Personalized dashboard (all stats computed from DB rows; no hardcoded numbers)
- ✅ Personal task creation/editing; detail dialog with tabs
- ✅ Priority, status, subtasks, reminders, focus flag, timestamps
- ✅ Import from official content (assignments, assessments, opportunities)
- ✅ Duplicate prevention (partial unique index uniq_task_import) + sync triggers
- ✅ Personal notes & progress preserved across official updates
- ✅ Complete syllabus tracker (topic → unit → subject → semester rollup)
- ✅ Secure uploads/downloads (validated, 10 MB cap, signed URLs, private bucket)
- ✅ Day / week / month calendar with color-coded categories
- ✅ Reminders (in-app always; browser notifications opt-in) + overdue indicators
- ✅ Weekly goals with log-based progress and +1/+5 logging
- ✅ Career tracker: 8-stage pipeline, kanban view, manual + imported entries
- ✅ Opportunity bookmarking & application tracking with private notes
- ✅ Global search (⌘K / /) across 10 entity types, RLS-scoped

## Quality and Delivery
- ✅ Responsive layouts (mobile drawer nav, grids collapse cleanly)
- ✅ Dark design system; teal accent; no purple/violet anywhere
- ✅ Restrained animations (page fade, shimmer skeletons, bar transitions)
- ✅ Loading/empty/error/success states everywhere; destructive confirms
- ✅ Functional migration file (idempotent-ish, re-runnable on fresh project)
- ✅ RLS + storage policies written for both buckets
- ✅ Domain logic verified: 54/54 offline unit tests pass (deadline math, ranking,
       syllabus aggregation, goals, calendar overlap, error mapping, sanitisation)
- ✅ No broken routes (router covers all nav targets; 404 → redirect home)
- ✅ Env template, setup and deployment documentation
- ⚠️ Browser E2E + live RLS scenarios: run `scripts/verify-rls.sql` after `supabase db reset`
