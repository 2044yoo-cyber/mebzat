# Medosha — Phase 1 setup

Phase 1 covers authentication, role-based onboarding, and a basic profile
shell. This is what's needed to run it against a real Supabase project.

## 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → API** and copy the Project URL, `anon` key,
   and `service_role` key into `.env.local` (see `.env.example`):

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

## 2. Run the database migrations

Open **SQL Editor** in the Supabase dashboard and run, in order:

1. [`supabase/migrations/0001_init_profiles.sql`](supabase/migrations/0001_init_profiles.sql)
   — creates the `profiles` table, RLS policies, the `avatars`/`covers`
   storage buckets, and the trigger that creates a profile row whenever a
   user signs up.
2. [`supabase/migrations/0002_progressive_profile.sql`](supabase/migrations/0002_progressive_profile.sql)
   — makes `email` nullable (phone-only sign-ups have none) and updates
   the trigger to auto-generate a username so new users never have to
   fill in a form before landing on the dashboard.

If you use the Supabase CLI instead: `supabase link` then `supabase db push`.

**Without these, signup will fail** once Supabase's own email/rate-limit
checks pass — the trigger that creates a profile row has nothing to
insert into, which aborts the whole signup transaction.

## 3. Configure Auth URLs

In **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` (and your production domain later).
- **Redirect URLs**: add `http://localhost:3000/auth/callback` and your
  production equivalent.

## 4. Enable Google sign-in

In **Authentication → Providers → Google**:

1. Create an OAuth client in the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Set the authorized redirect URI to the value Supabase shows on that
   provider page (`https://<project-ref>.supabase.co/auth/v1/callback`).
3. Paste the Client ID and Secret into Supabase and enable the provider.

## 5. Enable phone sign-in

In **Authentication → Providers → Phone**, enable it and configure an SMS
provider (Twilio, MessageBird, or Vonage). Without this, the phone tab on
signup/login will fail when sending a code.

## 6. Email templates (recommended)

The app supports both of Supabase's confirmation link formats:

- **Default (PKCE `code` param)** — works out of the box, handled by
  `src/app/auth/callback/route.ts`.
- **Token hash format** — if you customize templates to the newer pattern
  below, they're handled by `src/app/auth/confirm/route.ts`:

  ```
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/dashboard
  ```

Either works; you don't have to change the default templates for Phase 1.

## 7. Run it

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and sign up — you land straight on the
dashboard with a "Complete your profile" card. Fill in the rest whenever
you want via **Edit profile**.

Note: Supabase's default (non-custom-SMTP) email sending has a low rate
limit, and rejects some non-deliverable domains (e.g. `example.com`) as
invalid. Use a real inbox or a disposable one like `@mailinator.com` when
testing signup.

## Known dev-mode quirk

In `next dev` (Turbopack), the `/login` route's Suspense boundary can
occasionally get stuck showing its loading skeleton instead of revealing
the form — a Next.js 16.2 Turbopack dev-streaming quirk, not a code bug.
It does not reproduce in production (`next build && next start`). If you
hit it locally, a hard refresh resolves it.
