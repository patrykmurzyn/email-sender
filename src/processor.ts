import { parsePayload } from "./validation";
import type { EmailQueueMessage, ProcessorDeps } from "./types";

interface QueueMessageLike {
  id: string;
  body: unknown;
  ack: () => void;
  retry: (options?: { delaySeconds?: number }) => void;
}

function logError(
  logger: ProcessorDeps["logger"],
  message: string,
  context: Record<string, unknown>,
): void {
  logger.error(message, context);
}

export async function processQueueMessage(
  message: QueueMessageLike,
  deps: ProcessorDeps,
): Promise<void> {
  const parsedPayload = parsePayload(message.body);

  if (!parsedPayload.ok) {
    await deps.sleep(deps.config.rateLimitDelayMs);
    message.ack();
    return;
  }

  const payload = parsedPayload.payload;
  const content = await deps.hashContent(payload);
  const queueMessageId = deps.makeQueueMessageId();

  let reservationResult: "duplicate" | "rate_limited" | "ok";
  try {
    reservationResult = await deps.repository.checkAndReserve(
      payload.messageId,
      deps.config.dailyLimit,
    );
  } catch (error) {
    logError(deps.logger, "Failed to check reservation", {
      messageId: payload.messageId,
      queueMessageId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    await deps.sleep(deps.config.retryNetworkSeconds);
    message.retry({ delaySeconds: deps.config.retryNetworkSeconds });
    return;
  }

  if (reservationResult === "duplicate") {
    await deps.sleep(deps.config.rateLimitDelayMs);
    message.ack();
    return;
  }

  if (reservationResult === "rate_limited") {
    await deps.sleep(deps.config.rateLimitDelayMs);
    message.retry({ delaySeconds: deps.config.rateLimitRetrySeconds });
    return;
  }

  try {
    await deps.repository.insertSendingEvent({
      messageId: payload.messageId,
      queueMessageId,
      status: "sending",
      fromEmail: payload.from,
      toEmails: payload.to,
      ccEmails: payload.cc,
      bccEmails: payload.bcc,
      replyTo: payload.replyTo,
      subject: payload.subject,
      metadata: payload.metadata,
      contentHash: content.hash,
      contentSize: content.size,
    });
  } catch (error) {
    logError(deps.logger, "Failed to insert sending event", {
      messageId: payload.messageId,
      queueMessageId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    await deps.sleep(deps.config.retryNetworkSeconds);
    message.retry({ delaySeconds: deps.config.retryNetworkSeconds });
    return;
  }

  const delivery = await deps.deliveryClient.sendEmail(payload);

  if (delivery.ok) {
    try {
      await deps.repository.markAsSent(delivery.providerMessageId, queueMessageId);
      message.ack();
    } catch (error) {
      logError(deps.logger, "Failed to mark as sent after successful delivery", {
        messageId: payload.messageId,
        queueMessageId,
        providerMessageId: delivery.providerMessageId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      message.retry({ delaySeconds: deps.config.retryNetworkSeconds });
    }
    await deps.sleep(deps.config.rateLimitDelayMs);
    return;
  }

  if (delivery.retryable) {
    try {
      await deps.repository.markAsFailed(
        queueMessageId,
        delivery.errorCode,
        delivery.errorMessage,
      );
    } catch (error) {
      logError(deps.logger, "Failed to mark as failed", {
        messageId: payload.messageId,
        queueMessageId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    await deps.sleep(deps.config.rateLimitDelayMs);
    message.retry({ delaySeconds: delivery.retryDelaySeconds ?? deps.config.retryNetworkSeconds });
    return;
  }

  try {
    await deps.repository.markAsFailed(
      queueMessageId,
      delivery.errorCode,
      delivery.errorMessage,
    );
  } catch (error) {
    logError(deps.logger, "Failed to mark as failed", {
      messageId: payload.messageId,
      queueMessageId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
  await deps.sleep(deps.config.rateLimitDelayMs);
  message.ack();
}
