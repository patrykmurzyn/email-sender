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

  async hasSentMessage(messageId: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: "SELECT 1 AS found FROM email_events WHERE message_id = ?1 AND status = 'sent' LIMIT 1",
      args: [messageId],
    });
    return result.rows.length > 0;
  }

  async countSentLast24Hours(): Promise<number> {
    const result = await this.client.execute({
      sql: "SELECT COUNT(*) AS total FROM email_events WHERE status = 'sent' AND sent_at >= datetime('now', '-24 hours')",
    });
    const value = result.rows[0]?.total;
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string") return Number.parseInt(value, 10);
    return 0;
  }

  async insertEvent(event: EventInsert): Promise<void> {
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
        event.status,
        event.provider ?? "resend",
        event.providerMessageId ?? null,
        event.errorCode ?? null,
        normalizeMessage(event.errorMessage),
        toJson(event.metadata),
        event.queueMessageId,
        event.sentAt ?? null,
      ],
    });
  }
}

