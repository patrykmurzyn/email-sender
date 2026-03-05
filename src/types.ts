import type { Client } from "@libsql/client";

export type EmailEventStatus =
  | "received"
  | "duplicate"
  | "rate_limited"
  | "sent"
  | "retryable_error"
  | "permanent_error"
  | "invalid_payload";

export interface EmailTag {
  name: string;
  value: string;
}

export interface EmailQueueMessage {
  messageId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  tags?: EmailTag[];
  metadata?: Record<string, unknown>;
}

export interface Env {
  RESEND_API_KEY: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  DAILY_LIMIT?: string;
  RATE_LIMIT_DELAY_MS?: string;
  RATE_LIMIT_RETRY_SECONDS?: string;
  RETRY_429_MIN_SECONDS?: string;
  RETRY_429_MAX_SECONDS?: string;
  RETRY_5XX_SECONDS?: string;
  RETRY_NETWORK_SECONDS?: string;
  RESEND_TIMEOUT_MS?: string;
}

export interface AppConfig {
  dailyLimit: number | null;
  rateLimitDelayMs: number;
  rateLimitRetrySeconds: number;
  retry429MinSeconds: number;
  retry429MaxSeconds: number;
  retry5xxSeconds: number;
  retryNetworkSeconds: number;
  resendTimeoutMs: number;
}

export interface EventInsert {
  messageId: string;
  status: EmailEventStatus;
  queueMessageId: string;
  fromEmail?: string;
  toEmails?: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  replyTo?: string;
  subject?: string;
  metadata?: Record<string, unknown>;
  contentHash?: string;
  contentSize?: number;
  provider?: string;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  sentAt?: string;
}

export interface EventRepository {
  hasSentMessage(messageId: string): Promise<boolean>;
  countSentToday(): Promise<number>;
  insertEvent(event: EventInsert): Promise<void>;
}

export type DeliveryResult =
  | { ok: true; providerMessageId: string }
  | {
      ok: false;
      retryable: boolean;
      errorCode: string;
      errorMessage: string;
      retryDelaySeconds?: number;
    };

export interface DeliveryClient {
  sendEmail(payload: EmailQueueMessage): Promise<DeliveryResult>;
}

export interface ProcessorDeps {
  config: AppConfig;
  repository: EventRepository;
  deliveryClient: DeliveryClient;
  sleep: (ms: number) => Promise<void>;
  hashContent: (payload: EmailQueueMessage) => Promise<{ hash: string; size: number }>;
  logger: Pick<Console, "error" | "info" | "warn">;
}

export interface LibsqlEnv {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export interface RepositoryOptions {
  client?: Client;
}
