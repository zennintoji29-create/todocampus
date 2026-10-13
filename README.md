# CampusOS

A full-stack academic productivity platform for B.Tech students: one command center for
assignments, quizzes, syllabus progress, notes, exams, placements and internships.

Built with **React + Vite + TypeScript + Tailwind CSS v4 + Supabase** (Postgres, Auth,
Storage, Row Level Security). No extra backend server — Postgres RLS is the authority for
every read and write.

## Architecture

```
campusos/
├── src/
│   ├── lib/          # supabase client, typed data layer, pure domain logic, error mapping
│   ├── hooks/        # auth/session, async data, reminders, debounce
│   ├── components/   # design system (ui/), shared domain widgets, app shell + guards
│   ├── pages/
│   │   ├── auth.tsx  # login, register, forgot/reset password
│   │   ├── student/  # dashboard, tasks, calendar, syllabus, notes, career, official feeds
│   │   └── admin/    # overview, assignments, assessments, curriculum, announcements,
│   │                 # opportunities, resources, users & roles
│   └── App.tsx       # lazy-loaded routes with role-aware guards
└── supabase/
    ├── migrations/0001_init.sql   # schema, constraints, indexes, triggers, RLS, storage policies
    └── seed.sql                   # labelled demo data for local development
```

Two worlds, one database:

- **Official content** (assignments, assessments, syllabus, announcements, opportunities) —
  written only by admins, readable by everyone signed in.
- **Personal workspace** (tasks, subtasks, topic progress, notes, documents, applications,
  study events, goals) — strictly `user_id = auth.uid()` via RLS; invisible to admins and
  other students.

The **import system** links them: `tasks.source_type + source_id` reference the official
row; DB triggers keep the official snapshot fields in sync (including deadline changes)
without ever touching the student's personal fields. A partial unique index makes double
import impossible. Archiving or deleting the official row marks `source_unavailable`
instead of destroying personal history.

## Quick start

Requirements: Node 20+ and a free [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

Apply the database (choose one):

```bash
# Option A — Supabase CLI (recommended)
supabase link --project-ref <ref>
supabase db push            # or: supabase db reset locally

# Option B — SQL editor in the dashboard
#   paste the contents of supabase/migrations/0001_init.sql and Run
#   (optional) paste supabase/seed.sql for demo content
```

Then:

```bash
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run test       # domain-logic unit tests (vitest)
npm run typecheck
```

## Creating the first admin

1. Register normally in the UI (`/register`) — new accounts are **students** by default.
2. Make yourself an admin once, using either:
   - the SQL editor: `insert into public.admin_emails(email) values ('you@college.edu');`
     *before* registering (auto-promotes on signup), or
   - `update public.profiles set role = 'admin' where email = 'you@college.edu';`
     *after* registering.
3. Afterwards promote/demote people from **Admin → Users & Roles** in the app.
   The allow-list there is the safe way to grant admin on signup.

Students cannot promote themselves: the role column is excluded from their
column-level grant and RLS `with check` re-verifies it on every update.

## Deployment

Any static host works (Vercel, Netlify, Cloudflare Pages). Set
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as environment variables and point the
SPA rewrite to `index.html`. In Supabase → Authentication → URL Configuration, add your
production URL to the redirect allow list (password-reset emails link back to
`/reset-password`).

## Security model

- Only the **anon** key ships to the browser; there is no service-role code anywhere.
- RLS is enabled on all 25 tables with least-privilege policies (see
  `supabase/migrations/0001_init.sql` §7).
- Column grants stop students from editing `profiles.role`.
- Two storage buckets: `official` (admin writes, authenticated reads) and `documents`
  (each object lives under `auth.uid()/…`, so only the owner can read/write/delete).
- Upload validation (type allow list, 10 MB cap) runs on both client and DB policies.
- `scripts/verify-rls.sql` is an executable access-control test suite — run it against
  the database to verify scenarios A–G from the spec (duplicate import, isolation,
  role escalation, official write attempts, announcement fan-out).
