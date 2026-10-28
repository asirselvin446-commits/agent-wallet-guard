# Agent Wallet Guard

Agent Wallet Guard places a server-side policy and audit boundary between an AI agent and a PayPal Sandbox account. It evaluates each request against a signed mandate, requires review for uncertain LLM results, supports Sandbox Payouts and Checkout Orders, and records payment decisions in a verifiable hash chain. The dashboard includes agent management, mandate issuance, approvals, a judge-ready simulator, and a payment ledger.

## Setup

Use Node.js 20.9 or newer.

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and `DIRECT_URL` to your PostgreSQL database. For local development, a local PostgreSQL instance works; the included sample URLs are for Supabase.
2. Set `MANDATE_SIGNING_SECRET` to a random value of at least 32 characters. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `DEMO_AGENT_API_KEY` to credentials you control.
3. To run the full PayPal flow, use Sandbox app credentials only and keep `PAYPAL_BASE_URL` as `https://api-m.sandbox.paypal.com`. Choose `PAYMENT_MODE=orders` or `payouts`. If you do not have Sandbox credentials yet, local development uses a clearly labeled simulation that never calls PayPal.
4. Install dependencies with `npm install`.
5. Create the schema and seed the dashboard user, demo agent, mandate, policy, and approved Sandbox recipient:

   ```bash
   npm run db:push
   npm run db:seed
   ```

6. Start the app with `npm run dev`, then open `http://localhost:3000`.

Local seed defaults are `admin@example.com` / `demo-password` with agent key `demo-agent-key`; replace all three before exposing an app beyond your development machine. Production seeding requires an admin password of at least 12 characters and an agent key of at least 32 characters.

## Demo

The dashboard simulator is protected by the signed-in user session and uses the same payment decision service as the external agent API. It does not expose the demo agent API key to the browser. When PayPal credentials are configured, an approved request reaches the PayPal Sandbox. Without them, the ledger marks the result as **Local simulation** and does not claim a transfer occurred.

- A $12 request to `sandbox-store.example` in `electronics` passes the seeded policy, then either creates a Sandbox payment or a visibly labeled local simulation.
- Increase the amount above $20 to trigger the hard transaction-cap block.
- Change the merchant to an unknown merchant to trigger the allowlist block.
- Use `giftcards.example` or a disallowed category to trigger a hard block.
- Put prompt-injection text in the reasoning field: the LLM receives it as untrusted data, and hard policy blocks still take precedence.
- Repeat approved requests until a daily/weekly limit is exceeded.

For payout mode, the mandate also allowlists the merchant's Sandbox PayPal email. A merchant name match alone never authorizes an agent to redirect funds to another recipient.

## Connect an agent

Register an agent in **Agents** and copy its API key when shown. Issue a mandate in **Rules** and copy the mandate ID from the displayed mandate details. The key is stored hashed and cannot be recovered from the dashboard. Agents authenticate with `Authorization: Bearer <agent-key>` and should reuse the same idempotency key when retrying a request (maximum 38 letters, digits, `_` or `-`).

```bash
curl -X POST http://localhost:3000/api/agent/payment-requests \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mandateId":"demo-mandate","merchantName":"sandbox-store.example","merchantPayPalEmail":"merchant@example.com","amount":12,"currency":"USD","category":"electronics","userInstruction":"Buy a phone case under $20","agentReasoning":"The case matches the user request.","idempotencyKey":"judge-demo-0001"}'
```

The response includes the decision, each evaluated rule, risk-check details, and payment status. Retrying with the same agent and idempotency key returns the original result.

## Configuration

`PAYMENT_MODE=payouts` sends payouts to allowlisted Sandbox recipient emails. PayPal's initial payout response remains pending until status refresh confirms completion. `PAYMENT_MODE=orders` creates a Checkout order, returns its approval URL, and captures it on PayPal's return to the app. The configured base URL is validated against the Sandbox hostname; live PayPal endpoints are rejected. Set the server-side `GEMINI_API_KEY` to enable Gemini risk assessment; `GEMINI_MODEL` defaults to `gemini-2.5-flash`. A Gemini model name in the older `LLM_MODEL` setting is also accepted. Missing Gemini credentials or an unavailable risk check route requests to manual approval. In local development, missing PayPal credentials produce a pending, labeled simulation and never a fake completed payment. Production simulation requires explicitly setting `ALLOW_SIMULATED_PAYMENTS=true`; keep it false for real Sandbox demonstrations.

## Supabase database configuration

The application database is PostgreSQL on Supabase. In Supabase, open **Project Settings → Database → Connect → Prisma** and copy the connection string into `DATABASE_URL`. If the direct host is unavailable on your network, use the Supavisor session pooler URL supplied by Supabase. Run:

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

Prisma uses the server-only `DATABASE_URL`. The `NEXT_PUBLIC_SUPABASE_*` values are optional and are not used for dashboard authentication or payment decisions.

## Validation

```bash
npm run lint
npm run build
npm test
```

The dashboard's audit section can recompute the chain. Any changed payload/hash causes `/api/audit/verify` to report the first broken sequence.

## Android APK

The Android app is a Capacitor shell around the Next.js dashboard. The Next.js server remains the secure backend; do not put PayPal or Gemini secrets in the APK.

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

The container starts the web server directly; it does not run schema changes or reset demo credentials on every restart. Before the first deployment, apply the schema with `npm run db:push` and seed with `npm run db:seed` from a trusted environment configured with the same database URLs. Change `ADMIN_PASSWORD` before deployment and set the Supabase `DATABASE_URL` in Render.
