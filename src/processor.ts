import { parsePayload } from "./validation";
import type { EmailQueueMessage, ProcessorDeps } from "./types";

interface QueueMessageLike {
  id: string;
  body: unknown;
  ack: () => void;
  retry: (options?: { delaySeconds?: number }) => void;
}

function safeRecord(
  deps: ProcessorDeps,
  event: {
    messageId: string;
    queueMessageId: string;
    status:
      | "received"
      | "duplicate"
      | "rate_limited"
      | "sent"
      | "retryable_error"
      | "permanent_error"
      | "invalid_payload";
    fromEmail?: string;
    toEmails?: string[];
    ccEmails?: string[];
    bccEmails?: string[];
    replyTo?: string;
    subject?: string;
    metadata?: Record<string, unknown>;
    contentHash?: string;
    contentSize?: number;
    providerMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
    sentAt?: string;
  },
): Promise<void> {
  return deps.repository.insertEvent(event).catch((error) => {
    deps.logger.error("Failed to persist email event", {
      messageId: event.messageId,
      status: event.status,
      queueMessageId: event.queueMessageId,
      error: error instanceof Error ? error.message : "Unknown DB error",
    });
  });
}

function eventBase(payload: EmailQueueMessage, content: { hash: string; size: number }) {
  return {
    messageId: payload.messageId,
    fromEmail: payload.from,
    toEmails: payload.to,
    ccEmails: payload.cc,
    bccEmails: payload.bcc,
    replyTo: payload.replyTo,
    subject: payload.subject,
    metadata: payload.metadata,
    contentHash: content.hash,
    contentSize: content.size,
  };
}

export async function processQueueMessage(
  message: QueueMessageLike,
  deps: ProcessorDeps,
): Promise<void> {
  const parsedPayload = parsePayload(message.body);

  if (!parsedPayload.ok) {
    await safeRecord(deps, {
      messageId: `invalid:${message.id}`,
      queueMessageId: message.id,
      status: "invalid_payload",
      errorCode: "INVALID_PAYLOAD",
      errorMessage: parsedPayload.error,
    });
    message.ack();
    await deps.sleep(deps.config.rateLimitDelayMs);
    return;
  }

  const payload = parsedPayload.payload;
  const content = await deps.hashContent(payload);
  const base = eventBase(payload, content);

  await safeRecord(deps, {
    ...base,
    queueMessageId: message.id,
    status: "received",
  });

  try {
    const alreadySent = await deps.repository.hasSentMessage(payload.messageId);
    if (alreadySent) {
      await safeRecord(deps, {
        ...base,
        queueMessageId: message.id,
        status: "duplicate",
        errorCode: "DUPLICATE_MESSAGE",
        errorMessage: "Message already marked as sent",
      });
      message.ack();
      await deps.sleep(deps.config.rateLimitDelayMs);
      return;
    }

    const sentToday = await deps.repository.countSentToday();
    if (deps.config.dailyLimit !== null && sentToday >= deps.config.dailyLimit) {
      await safeRecord(deps, {
        ...base,
        queueMessageId: message.id,
        status: "rate_limited",
        errorCode: "DAILY_LIMIT_REACHED",
        errorMessage: `Daily limit ${deps.config.dailyLimit} reached`,
      });
      message.retry({ delaySeconds: deps.config.rateLimitRetrySeconds });
      await deps.sleep(deps.config.rateLimitDelayMs);
      return;
    }
  } catch (error) {
    await safeRecord(deps, {
      ...base,
      queueMessageId: message.id,
      status: "retryable_error",
      errorCode: "DB_UNAVAILABLE",
      errorMessage: error instanceof Error ? error.message : "Unknown DB error",
    });
    message.retry({ delaySeconds: deps.config.retryNetworkSeconds });
    await deps.sleep(deps.config.rateLimitDelayMs);
    return;
  }

  const delivery = await deps.deliveryClient.sendEmail(payload);

  if (delivery.ok) {
    try {
      await deps.repository.insertEvent({
        ...base,
        queueMessageId: message.id,
        status: "sent",
        providerMessageId: delivery.providerMessageId,
      });
      message.ack();
    } catch (error) {
      await safeRecord(deps, {
        ...base,
        queueMessageId: message.id,
        status: "retryable_error",
        errorCode: "DB_UNAVAILABLE_AFTER_SEND",
        errorMessage: error instanceof Error ? error.message : "Unknown DB error after send",
      });
      message.retry({ delaySeconds: deps.config.retryNetworkSeconds });
    }
    await deps.sleep(deps.config.rateLimitDelayMs);
    return;
  }

  if (delivery.retryable) {
    await safeRecord(deps, {
      ...base,
      queueMessageId: message.id,
      status: "retryable_error",
      errorCode: delivery.errorCode,
      errorMessage: delivery.errorMessage,
    });
    message.retry({ delaySeconds: delivery.retryDelaySeconds ?? deps.config.retryNetworkSeconds });
    await deps.sleep(deps.config.rateLimitDelayMs);
    return;
  }

  await safeRecord(deps, {
    ...base,
    queueMessageId: message.id,
    status: "permanent_error",
    errorCode: delivery.errorCode,
    errorMessage: delivery.errorMessage,
  });
  message.ack();
  await deps.sleep(deps.config.rateLimitDelayMs);
}
