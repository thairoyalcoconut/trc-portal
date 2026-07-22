# TRC Portal

Internal web portal for Thai Royal Coconut Co., Ltd. — login required,
each department only sees its own data, admins see everything.

**Stack:** Next.js 14 (App Router) + Supabase (Postgres, Auth, Row Level
Security). Deploys free/cheap for a team under 20 people.

## How it works

- **Login required everywhere.** `middleware.ts` checks the session on
  every request and redirects to `/login` if you're not signed in.
- **Department separation happens in the database**, not just the UI.
  Every table (`records`, `requests`) has Row Level Security policies
  that only let a user read/write rows where `department_id` matches
  their own profile — enforced by Postgres itself, so it can't be
  bypassed by calling the API directly.
- **Roles:** `staff` (submit records/requests), `manager` (also
  approve/reject requests, delete records, within their own
  department), `admin` (sees and manages everything, assigns
  departments/roles to users).
- New sign-ups start with no department — an admin must assign one
  before that user can see any data.

## 1. Create your Supabase project (5 min)

1. Go to https://supabase.com → New project. Pick a region close to
   Thailand (e.g. Singapore) for the best latency.
2. Wait for it to finish provisioning.
3. Open **SQL Editor** → New query → paste the contents of
   `supabase/migrations/0001_init.sql` → Run.
   This creates the tables, security policies, and five starter
   departments (rename/add/remove them later in the Admin panel).
4. Open **Project Settings → API**. You'll need:
   - `Project URL`
   - `anon public` key
   - `service_role` key (secret — treat like a password)

Optional but recommended: **Authentication → Providers → Email** →
turn OFF "Confirm email" while testing internally, so new accounts can
log in immediately. Turn it back on once you're ready for production
if you want email verification.

## 2. Run it locally

```bash
cp .env.local.example .env.local
# paste in your Project URL / anon key / service_role key
npm install
npm run dev
```

Open http://localhost:3000 → you'll be redirected to `/login`.

1. Click "Create an account", sign up with your own email.
2. In Supabase: **Table Editor → profiles** → find your row → set
   `role` to `admin` (and pick a `department_id` if you want).
3. Sign back in → you'll now see the **Admin** tab → assign
   departments/roles to everyone else as they sign up.

## 3. Deploy so the whole company can use it

1. Push this folder to a GitHub repo (private).
2. Go to https://vercel.com → New Project → import that repo.
3. Add the same three environment variables from `.env.local` in
   Vercel's project settings.
4. Deploy. Vercel gives you an HTTPS URL — share that with staff.

That's the whole "cloud-hosted, login required" setup — no servers to
maintain.

## What's included

- `app/login` — sign in / sign up
- `app/dashboard` — per-department summary + chart, recent requests
- `app/records` — add/view/delete department records (flexible
  title + category + notes; extend `data jsonb` for more fields)
- `app/requests` — submit a request, managers/admins approve/reject
- `app/admin` — manage departments, assign users to a department + role

## Extending it

- **More fields per record:** the `data` column is `jsonb`, so you
  can store any structured fields per category (e.g. inventory counts,
  QA test results) without changing the schema. Update the form in
  `app/records/page.tsx` accordingly.
- **More departments:** add them from the Admin panel — no code change
  needed.
- **Sign-in with Google/Microsoft** (instead of email/password): in
  Supabase → Authentication → Providers, enable Google or Azure, then
  swap the login form for `supabase.auth.signInWithOAuth(...)`.
- **File uploads:** Supabase Storage buckets can be scoped with the
  same department-based RLS pattern used here.

<!-- redeploy trigger: repo made public 2026-07-22T14:04:59Z -->
