import type { EmailQueueMessage } from "./types";

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPayloadContent(
  payload: EmailQueueMessage,
): Promise<{ hash: string; size: number }> {
  const content = JSON.stringify({
    subject: payload.subject,
    html: payload.html ?? null,
    text: payload.text ?? null,
  });
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return { hash: toHex(digest), size: encoded.byteLength };
}

