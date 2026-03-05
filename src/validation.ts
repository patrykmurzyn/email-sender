import { z } from "zod";
import type { EmailQueueMessage } from "./types";

const emailLikeField = z.string().min(1).max(320);

const tagSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

const payloadSchema = z
  .object({
    messageId: z.string().uuid(),
    from: z.string().min(1),
    to: z.array(emailLikeField).min(1),
    cc: z.array(emailLikeField).optional(),
    bcc: z.array(emailLikeField).optional(),
    replyTo: emailLikeField.optional(),
    subject: z.string().min(1).max(998),
    html: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    tags: z.array(tagSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
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

