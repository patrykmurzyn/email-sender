import { describe, expect, it, vi } from "vitest";
import { processQueueMessage } from "../src/processor";
import type { AppConfig, DeliveryClient, EventRepository } from "../src/types";

const config: AppConfig = {
  dailyLimit: 95,
  rateLimitDelayMs: 0,
  rateLimitRetrySeconds: 3600,
  retry429MinSeconds: 60,
  retry429MaxSeconds: 300,
  retry5xxSeconds: 60,
  retryNetworkSeconds: 60,
  resendTimeoutMs: 15000,
};

const basePayload = {
  messageId: "8fce0e66-bd1c-46d2-aa9a-fced3e243f68",
  from: "Acme <noreply@example.com>",
  to: ["jan@example.com"],
  subject: "Order #123",
  html: "<h1>Thanks</h1>",
};

function message(body: unknown) {
  return {
    id: "queue-1",
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function deps(
  overrides: Partial<{
    reservation: "duplicate" | "rate_limited" | "ok";
    insertSendingError: boolean;
    delivery: DeliveryClient["sendEmail"];
  }> = {},
) {
  const repository: EventRepository = {
    checkAndReserve: vi.fn(async () => overrides.reservation ?? "ok"),
    insertSendingEvent: vi.fn(async () => {
      if (overrides.insertSendingError) {
        throw new Error("DB insert failed");
      }
    }),
    markAsSent: vi.fn(async () => {}),
    markAsFailed: vi.fn(async () => {}),
  };

  const deliveryClient: DeliveryClient = {
    sendEmail:
      overrides.delivery ??
      vi.fn(async () => ({
        ok: true as const,
        providerMessageId: "res_123",
      })),
  };

  return {
    repository,
    deliveryClient,
  };
}

describe("processQueueMessage", () => {
  it("acks duplicate message_id", async () => {
    const msg = message(basePayload);
    const testDeps = deps({ reservation: "duplicate" });

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("retries when daily limit is reached", async () => {
    const msg = message(basePayload);
    const testDeps = deps({ reservation: "rate_limited" });

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 3600 });
  });

  it("retries for retryable provider errors", async () => {
    const msg = message(basePayload);
    const testDeps = deps({
      delivery: vi.fn(async () => ({
        ok: false as const,
        retryable: true,
        errorCode: "RESEND_429",
        errorMessage: "Rate limit",
        retryDelaySeconds: 120,
      })),
    });

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
    expect(testDeps.repository.markAsFailed).toHaveBeenCalledWith(
      "q-1",
      "RESEND_429",
      "Rate limit",
    );
  });

  it("acks invalid payload without calling repository", async () => {
    const msg = message({ invalid: true });
    const testDeps = deps();

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(testDeps.repository.checkAndReserve).not.toHaveBeenCalled();
  });

  it("retries when reservation check fails", async () => {
    const msg = message(basePayload);
    const testDeps = deps();
    (testDeps.repository.checkAndReserve as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("DB unavailable"),
    );

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });

  it("retries when insert sending event fails", async () => {
    const msg = message(basePayload);
    const testDeps = deps({ insertSendingError: true });

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });

  it("marks as sent on successful delivery", async () => {
    const msg = message(basePayload);
    const testDeps = deps();

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(testDeps.repository.markAsSent).toHaveBeenCalledWith("res_123", "q-1");
  });

  it("retries when markAsSent fails after successful delivery", async () => {
    const msg = message(basePayload);
    const testDeps = deps();
    (testDeps.repository.markAsSent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("DB write failed"),
    );

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });

  it("acks permanent errors without retry", async () => {
    const msg = message(basePayload);
    const testDeps = deps({
      delivery: vi.fn(async () => ({
        ok: false as const,
        retryable: false,
        errorCode: "RESEND_VALIDATION_ERROR",
        errorMessage: "Invalid email format",
      })),
    });

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => {},
      logger: console,
      makeQueueMessageId: () => "q-1",
    });

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(testDeps.repository.markAsFailed).toHaveBeenCalled();
  });
});
