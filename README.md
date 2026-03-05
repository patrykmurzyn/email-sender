# Email Consumer Worker

Cloudflare Queue consumer for reliable email delivery using:
- Cloudflare Queues (`emails`)
- Cloudflare Workers
- Resend API
- Turso/libSQL event log

## Features

- Queue payload validation (`zod`)
- Idempotency by `messageId` (`sent` uniqueness)
- Rolling 24h soft limit (`DAILY_SOFT_LIMIT`, default `95`)
- Retry policy for temporary errors (`429`, `5xx`, network/timeouts)
- Audit log for all attempts (`email_events`)
- Metadata + content hash retention (without persisting full body content)

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Apply SQL migration from `migrations/0001_email_events.sql` to Turso.

3. Set worker secrets:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
```

4. Run locally:

```bash
npm run dev
```

5. Run tests:

```bash
npm test
```

## GitHub CI/CD (auto deploy)

Workflow file: `.github/workflows/worker-ci-cd.yml`

- On `pull_request` to `main`: runs typecheck + tests.
- On `push` to `main`: runs typecheck + tests + deploy to Cloudflare Worker.

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Notes:

- Worker runtime secrets (`RESEND_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) stay in Cloudflare Workers Secrets and are not stored in GitHub.
- Auto deployment is triggered by `push`/merge to `main`, not by `git pull`.

## Important

If any Turso token was shared publicly, rotate it before deployment.
