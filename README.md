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

## Integration for other services (how to send emails)

Other services should **not call Resend directly** in this architecture.
They should publish one message to Cloudflare Queue `emails`.
This Worker consumes the message asynchronously and handles delivery, retries, and logging.

### Recommended integration pattern

Use a producer Worker/service with a Queue producer binding and publish payloads to `emails`.

Example producer code (Cloudflare Worker):

```ts
interface Env {
  EMAILS_QUEUE: Queue;
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const message = {
      messageId: crypto.randomUUID(),
      from: "Acme <noreply@twojadomena.pl>",
      to: ["jan@example.com"],
      subject: "Order confirmation #123",
      html: "<h1>Dziekujemy</h1><p>Zamowienie przyjete.</p>",
      metadata: {
        source: "orders-service",
        orderId: "123",
      },
    };

    await env.EMAILS_QUEUE.send(message);
    return new Response("Queued", { status: 202 });
  },
};
```

### Payload contract (`emails` queue message)

Required fields:

- `messageId` (`string`, UUID): globally unique id for idempotency.
- `from` (`string`): sender, e.g. `Acme <noreply@twojadomena.pl>`.
- `to` (`string[]`): at least one recipient.
- `subject` (`string`): email subject, max 998 chars.
- one of: `html` (`string`) or `text` (`string`): at least one body format is required.

Optional fields:

- `cc` (`string[]`)
- `bcc` (`string[]`)
- `replyTo` (`string`)
- `tags` (`{ name: string; value: string }[]`)
- `metadata` (`Record<string, unknown>`) - business context (tenant/order/template etc.).

Rules:

- `messageId` should never be reused for different emails.
- `from` must belong to a verified Resend domain.
- Unknown fields are rejected (`additionalProperties: false` behavior).

### Full payload example

```json
{
  "messageId": "8fce0e66-bd1c-46d2-aa9a-fced3e243f68",
  "from": "Acme <noreply@twojadomena.pl>",
  "to": ["jan@example.com"],
  "cc": ["ops@example.com"],
  "subject": "Potwierdzenie zamowienia #123",
  "html": "<h1>Dziekujemy</h1><p>Twoje zamowienie jest przyjete.</p>",
  "text": "Dziekujemy. Twoje zamowienie jest przyjete.",
  "metadata": {
    "source": "orders-service",
    "tenantId": "acme",
    "orderId": "123"
  }
}
```

### What happens after publish

For each message the consumer Worker:

1. Validates payload schema.
2. Writes `received` event to DB.
3. Checks idempotency (`messageId` already `sent` -> `duplicate`, `ack`).
4. Checks rolling 24h limit (`>= DAILY_SOFT_LIMIT` -> `rate_limited`, `retry`).
5. Sends via Resend.
6. Stores final event (`sent`, `retryable_error`, `permanent_error`, `invalid_payload`).
7. Performs `ack()` or `retry()` based on error mapping.

### Delivery semantics and reliability

- At-least-once queue delivery is expected.
- Idempotency is enforced by `messageId` + unique `sent` constraint in DB.
- Temporary errors are retried (`429`, `5xx`, network/timeout).
- Permanent payload/validation errors are acknowledged without retry.
- All attempts are logged in `email_events`.

### Integration checklist for a new service

1. Generate `messageId` per outgoing email (UUID v4 recommended).
2. Send to Queue `emails` (not directly to Resend).
3. Always provide `metadata.source` (service name) for auditability.
4. Handle producer-side queue publish failures with retry in your service.
5. Track `messageId` in your service logs for cross-system debugging.

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

## Queue smoke test via `.env`

1. Copy:

```bash
cp .env.example .env
```

2. Fill values in `.env`:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_QUEUE_NAME=emails` (or `CF_QUEUE_ID`)
- test payload fields (`TEST_FROM`, `TEST_TO`, `TEST_HTML` or `TEST_TEXT`)

3. Send test message:

```bash
npm run queue:test
```

The script resolves `queue_id` from queue name (unless `CF_QUEUE_ID` is provided), sends one message, and prints generated `messageId`.

## Important

If any Turso token was shared publicly, rotate it before deployment.
