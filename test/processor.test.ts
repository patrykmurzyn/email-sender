import { describe, expect, it, vi } from "vitest";
import { processQueueMessage } from "../src/processor";
import type { AppConfig, DeliveryClient, EventInsert, EventRepository } from "../src/types";

const config: AppConfig = {
  dailySoftLimit: 95,
  dailyHardLimit: 100,
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

function deps(overrides: Partial<{ sent: boolean; sent24h: number; delivery: DeliveryClient["sendEmail"] }> = {}) {
  const events: EventInsert[] = [];
  const repository: EventRepository = {
    hasSentMessage: vi.fn(async () => overrides.sent ?? false),
    countSentLast24Hours: vi.fn(async () => overrides.sent24h ?? 0),
    insertEvent: vi.fn(async (event) => {
      events.push(event);
    }),
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
    events,
    repository,
    deliveryClient,
  };
}

describe("processQueueMessage", () => {
  it("acks duplicate message_id", async () => {
    const msg = message(basePayload);
    const testDeps = deps({ sent: true });

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => undefined,
      nowIso: () => "2026-03-05T00:00:00.000Z",
      logger: console,
    });

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(testDeps.events.some((event) => event.status === "duplicate")).toBe(true);
  });

  it("retries when daily limit is reached", async () => {
    const msg = message(basePayload);
    const testDeps = deps({ sent24h: 95 });

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => undefined,
      nowIso: () => "2026-03-05T00:00:00.000Z",
      logger: console,
    });

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 3600 });
    expect(testDeps.events.some((event) => event.status === "rate_limited")).toBe(true);
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
      sleep: async () => undefined,
      nowIso: () => "2026-03-05T00:00:00.000Z",
      logger: console,
    });

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
    expect(testDeps.events.some((event) => event.status === "retryable_error")).toBe(true);
  });

  it("acks invalid payload", async () => {
    const msg = message({ invalid: true });
    const testDeps = deps();

    await processQueueMessage(msg, {
      config,
      repository: testDeps.repository,
      deliveryClient: testDeps.deliveryClient,
      hashContent: async () => ({ hash: "abc", size: 1 }),
      sleep: async () => undefined,
      nowIso: () => "2026-03-05T00:00:00.000Z",
      logger: console,
    });

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(testDeps.events.some((event) => event.status === "invalid_payload")).toBe(true);
  });
});

