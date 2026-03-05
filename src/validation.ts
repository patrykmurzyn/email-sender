import { z } from "zod";
import type { EmailQueueMessage } from "./types";

const recipientEmailField = z.string().email().max(320);

function extractAddressEmail(value: string): string {
  const match = value.match(/<([^<>]+)>/);
  return (match?.[1] ?? value).trim();
}

function isValidFromAddress(value: string): boolean {
  const emailPart = extractAddressEmail(value);
  return z.string().email().safeParse(emailPart).success;
}

function metadataWithinLimit(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return true;
    return new TextEncoder().encode(serialized).byteLength <= 8192;
  } catch {
    return false;
  }
}

const tagSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

const payloadSchema = z
  .object({
    messageId: z.string().uuid(),
    from: z.string().min(1).max(512).refine(isValidFromAddress, {
      message: "from must contain a valid email address",
    }),
    to: z.array(recipientEmailField).min(1).max(50),
    cc: z.array(recipientEmailField).max(50).optional(),
    bcc: z.array(recipientEmailField).max(50).optional(),
    replyTo: recipientEmailField.optional(),
    subject: z.string().min(1).max(998),
    html: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    tags: z.array(tagSchema).optional(),
    metadata: z.record(z.unknown()).optional().refine(metadataWithinLimit, {
      message: "metadata is too large (max 8KB serialized)",
    }),
  })
  .strict()
  .refine((value) => Boolean(value.html || value.text), {
    message: "At least one of html or text must be provided",
  });

export function normalizeQueueBody(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }
  return body;
}

export function parsePayload(body: unknown): {
  ok: true;
  payload: EmailQueueMessage;
} | {
  ok: false;
  error: string;
} {
  const normalized = normalizeQueueBody(body);
  const parsed = payloadSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }
  return { ok: true, payload: parsed.data };
}
