# Agent Wallet Guard

Agent Wallet Guard is a Next.js MVP that places a policy and audit boundary between an AI agent and a PayPal Sandbox account. It evaluates every payment request server-side, uses Supabase PostgreSQL through Prisma, supports Payouts and Orders v2 providers, and records a tamper-evident SHA-256 audit chain.

## Setup

1. Copy `.env.example` to `.env`.
2. Replace `DATABASE_URL` with the Prisma connection string from your Supabase project. Do not use the Supabase publishable key as `DATABASE_URL`.
3. Set `MANDATE_SIGNING_SECRET` to a long random value. Add PayPal Sandbox credentials for real Sandbox calls; without credentials the app uses a clearly labeled demo provider response.
4. Install dependencies with `npm install`.
5. Create the Supabase schema and seed the admin, demo agent, mandate, and policy:

   ```bash
   npm run db:push
   npm run db:seed
   ```

5. Start the app with `npm run dev`, then open `http://localhost:3000`.

Default dashboard credentials are `admin@example.com` / `demo-password`; change them through `ADMIN_EMAIL` and `ADMIN_PASSWORD` before seeding.

## Demo

The simulator calls the actual agent API with `Bearer demo-agent-key` and the seeded `demo-mandate`.

- A $12 request to `sandbox-store.example` in `electronics` passes policy checks and uses the configured payment mode.
- Increase the amount above $20 to trigger the hard transaction-cap block.
- Change the merchant to an unknown merchant to trigger the allowlist block.
- Use `giftcards.example` or a disallowed category to trigger a hard block.
- Put prompt-injection text in the reasoning field: it remains untrusted data and cannot override server rules.
- Repeat approved requests until a daily/weekly limit is exceeded.

## Configuration

`PAYMENT_MODE=payouts` is the default and performs autonomous Sandbox payouts when merchant email and credentials are available. `PAYMENT_MODE=orders` creates a PayPal Checkout order and returns an approval URL. Missing PayPal or Anthropic credentials fail safe and are visible as demo/manual-approval behavior rather than silently using live services.

## Supabase database configuration

The application database is PostgreSQL on Supabase. In Supabase, open **Project Settings → Database → Connect → Prisma** and copy the connection string into `DATABASE_URL`. If the direct host is unavailable on your network, use the Supavisor session pooler URL supplied by Supabase. Run:

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

The `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` values are used only by the optional Supabase SSR client/middleware. Prisma must use the server-only database connection string.

## Validation

```bash
npm run lint
npm run build
npm test
```

The dashboard's audit section can recompute the chain. Any changed payload/hash causes `/api/audit/verify` to report the first broken sequence.

## Android APK

The Android app is a Capacitor shell around the Next.js dashboard. The Next.js server remains the secure backend; do not put PayPal or Anthropic secrets in the APK.

1. Add `CAPACITOR_SERVER_URL` to `.env` and set it to the URL the Android WebView should load. Capacitor loads this value from `.env` when synchronizing.
2. Install Android Studio and the Android SDK, then ensure `adb` and Java/Gradle are available.
3. Generate the Android project once:

   ```bash
   npx cap add android
   npm run mobile:sync
   ```

4. Build a debug APK:

   ```bash
   npm run mobile:build:debug
   ```

   The APK is written under `android/app/build/outputs/apk/debug/`.

For USB debugging, start Next.js with `npm run dev -- --hostname 0.0.0.0`, run `adb reverse tcp:3000 tcp:3000`, set `CAPACITOR_SERVER_URL=http://127.0.0.1:3000`, sync, and install with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

## Cloud hosting with Render

`render.yaml` and `Dockerfile` are included for a Render deployment using Supabase PostgreSQL, so the Render service no longer needs a persistent disk.

1. Push this folder to a GitHub repository.
2. In Render, choose **New → Blueprint**, select the repository, and apply `render.yaml`.
3. Enter the secret values requested by Render. Keep PayPal Sandbox credentials and `MANDATE_SIGNING_SECRET` private.
4. Verify the deployment at `https://YOUR-SERVICE.onrender.com/api/health`.
5. Set `APP_BASE_URL` to that HTTPS URL.
6. Set `CAPACITOR_SERVER_URL` in the local `.env` to the same HTTPS URL, run `npx cap sync android`, and rebuild the APK.

The cloud service runs `prisma db push` and seeds the admin/demo records when it starts. Change `ADMIN_PASSWORD` before the first deployment and set the Supabase `DATABASE_URL` in Render.
