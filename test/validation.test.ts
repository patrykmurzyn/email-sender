import { describe, expect, it } from "vitest";
import { parsePayload } from "../src/validation";

const validPayload = {
  messageId: "8fce0e66-bd1c-46d2-aa9a-fced3e243f68",
  from: "Acme <noreply@example.com>",
  to: ["jan@example.com"],
  subject: "Order #123",
  html: "<h1>Hi</h1>",
};

describe("parsePayload", () => {
  it("accepts a valid payload", () => {
    const parsed = parsePayload(validPayload);
    expect(parsed.ok).toBe(true);
  });

  it("rejects payload without html/text", () => {
    const parsed = parsePayload({
      ...validPayload,
      html: undefined,
      text: undefined,
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects unknown fields", () => {
    const parsed = parsePayload({
      ...validPayload,
      extraField: "not-allowed",
    });
    expect(parsed.ok).toBe(false);
  });
});

