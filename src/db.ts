import { createClient, type Client } from "@libsql/client/web";
import type { EventInsert, EventRepository, LibsqlEnv, RepositoryOptions } from "./types";

function toJson(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function normalizeMessage(value: string | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 1000);
}

export class LibsqlEventRepository implements EventRepository {
  private readonly client: Client;

  constructor(env: LibsqlEnv, options: RepositoryOptions = {}) {
    this.client =
      options.client ??
      createClient({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      });
  }

  async checkAndReserve(
    messageId: string,
    limit: number | null,
  ): Promise<"duplicate" | "rate_limited" | "ok"> {
    const startTime = Date.now();
    const maxRetries = 3;
    const baseDelayMs = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const tx = this.client.executeMultiple(`
          BEGIN IMMEDIATE;
        `);

        await tx;

        const existingResult = await this.client.execute({
          sql: "SELECT 1 FROM email_events WHERE message_id = ?1 AND status = 'sent' LIMIT 1",
          args: [messageId],
        });

        if (existingResult.rows.length > 0) {
          await this.client.execute("ROLLBACK");
          return "duplicate";
        }

        const sendingResult = await this.client.execute({
          sql: "SELECT 1 FROM email_events WHERE message_id = ?1 AND status = 'sending' LIMIT 1",
          args: [messageId],
        });

        if (sendingResult.rows.length > 0) {
          await this.client.execute("ROLLBACK");
          return "duplicate";
        }

        if (limit !== null) {
          const countResult = await this.client.execute({
            sql: "SELECT COUNT(*) AS total FROM email_events WHERE status = 'sent' AND date(sent_at) = date('now')",
          });
          const count = Number(countResult.rows[0]?.total ?? 0);

          if (count >= limit) {
            await this.client.execute("ROLLBACK");
            return "rate_limited";
          }
        }

        await this.client.execute("COMMIT");
        return "ok";
      } catch (error) {
        try {
          await this.client.execute("ROLLBACK");
        } catch {
          // ignore rollback errors
        }

        if (attempt < maxRetries - 1) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

    return "ok";
  }

  async insertSendingEvent(event: EventInsert): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO email_events (
          id,
          message_id,
          from_email,
          to_emails_json,
          cc_emails_json,
          bcc_emails_json,
          reply_to,
          subject,
          content_hash,
          content_size,
          status,
          provider,
          provider_message_id,
          error_code,
          error_message,
          metadata_json,
          queue_message_id,
          sent_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18
        )
      `,
      args: [
        crypto.randomUUID(),
        event.messageId,
        event.fromEmail ?? null,
        toJson(event.toEmails),
        toJson(event.ccEmails),
        toJson(event.bccEmails),
        event.replyTo ?? null,
        event.subject ?? null,
        event.contentHash ?? null,
        event.contentSize ?? null,
        "sending",
        event.provider ?? "resend",
        null,
        null,
        null,
        toJson(event.metadata),
        event.queueMessageId,
        null,
      ],
    });
  }

  async markAsSent(providerMessageId: string, queueMessageId: string): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE email_events 
        SET status = 'sent', 
            provider_message_id = ?1,
            sent_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE queue_message_id = ?2 AND status = 'sending'
      `,
      args: [providerMessageId, queueMessageId],
    });
  }

  async markAsFailed(
    queueMessageId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE email_events 
        SET status = 'retryable_error',
            error_code = ?1,
            error_message = ?2
        WHERE queue_message_id = ?3 AND status = 'sending'
      `,
      args: [errorCode, normalizeMessage(errorMessage), queueMessageId],
    });
  }
}
