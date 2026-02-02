# Football Squad Manager

React/Next.js app for managing a football squad: Google login + phone verification, game registrations, admin tools, and player check-in.

## Stack

- Next.js (App Router)
- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth + DB + Storage)

## Local Setup

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm install
```

Create `.env.local`:

```sh
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Run dev server:

```sh
npm run dev
```

## Scripts

```sh
npm run dev
npm run build
npm run start
npm run lint
```

## Auth Flow (Hybrid)

1. Google OAuth login.
2. If `profiles.phone_number` is missing, user is redirected to `/onboarding`.
3. Phone OTP verification updates `profiles.phone_number`.
4. App access is granted after phone verification.

## Project Structure

```
src/
  app/            # Next.js routes (App Router)
  screens/        # Page UI components (migrated from Vite)
  components/     # Reusable UI and features
  contexts/       # Auth context
  integrations/   # Supabase client
```

## Deployment (Vercel)

- Framework: Next.js
- Build command: `npm run build`
- Output directory: `.next` (default)
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Notes

- If login redirects loop, verify Supabase Site URL and Redirect URLs match the deployed domain.
- Phone OTP uses Supabase Auth `phone_change` flow.
