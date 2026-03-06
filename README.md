# Email Consumer Worker

Consumer Cloudflare Queue `emails` that sends emails through Resend and stores delivery audit events in Turso/libSQL.

## Responsibilities

- Validate queue message payload (`zod`).
- Enforce idempotency by `messageId` (`sent` uniqueness).
- Enforce optional daily send limit (`DAILY_LIMIT`).
- Apply retry policy for temporary failures (`429`, `5xx`, network/timeout).
- Persist event history in `email_events`.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Apply **all** SQL migrations from `migrations/` in order:
`0001_email_events.sql`, `0002_drop_unused_sent_today_view.sql`, and next files if added later.

3. Set required Worker secrets:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
```

4. Run locally:

```bash
npm run dev
```

## Queue Contract (`emails`)

Queue message body must be a JSON object. Stringified JSON payloads are rejected.

Required fields:

- `messageId`: UUID.
- `from`: sender address (plain email or `Display Name <email@domain>`).
- `to`: non-empty array of valid recipient emails.
- `subject`: non-empty string, max 998 chars.
- at least one of: `html` or `text`.

Optional fields:

- `cc`, `bcc`: arrays of valid emails.
- `replyTo`: valid email.
- `tags`: `{ name: string; value: string }[]`.
- `metadata`: `Record<string, unknown>` (max 8KB serialized).

Additional/unknown fields are rejected.

Example payload:

```json
{
  "messageId": "8fce0e66-bd1c-46d2-aa9a-fced3e243f68",
  "from": "Acme <noreply@example.com>",
  "to": ["jan@example.com"],
  "subject": "Order confirmation #123",
  "html": "<h1>Thanks</h1>",
  "metadata": {
    "source": "orders-service",
    "orderId": "123"
  }
}
```

## Processing Flow

1. Validate payload.
2. Save `received` event.
3. Check idempotency.
4. Check daily limit.
5. Send through Resend.
6. Save final event: `sent`, `retryable_error`, `permanent_error`, `invalid_payload`, `duplicate`, or `rate_limited`.
7. `ack()` or `retry()` based on outcome.

## Commands

- Run tests: `npm test`
- Run tests in watch mode: `npm run test:watch`
- Type-check: `npm run typecheck`
- Queue smoke test: `npm run queue:test`

## CI/CD

Workflow: `.github/workflows/worker-ci-cd.yml`

- `pull_request` to `main`: typecheck + tests.
- `push` to `main`: typecheck + tests + deploy.
