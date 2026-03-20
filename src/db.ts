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
    const existingResult = await this.client.execute({
      sql: "SELECT 1 FROM email_events WHERE message_id = ?1 AND status IN ('sent', 'sending') LIMIT 1",
      args: [messageId],
    });

    if (existingResult.rows.length > 0) {
      return "duplicate";
    }

    if (limit !== null) {
      const countResult = await this.client.execute({
        sql: "SELECT COUNT(*) AS total FROM email_events WHERE status = 'sent' AND date(sent_at) = date('now')",
      });
      const count = Number(countResult.rows[0]?.total ?? 0);

      if (count >= limit) {
        return "rate_limited";
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
    const result = await this.client.execute({
      sql: `
        UPDATE email_events 
        SET status = 'sent', 
            provider_message_id = ?1,
            sent_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE queue_message_id = ?2 AND status = 'sending'
      `,
      args: [providerMessageId, queueMessageId],
    });

    if (result.rowsAffected === 0) {
      throw new Error(`No sending event found for queue_message_id: ${queueMessageId}`);
    }
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
