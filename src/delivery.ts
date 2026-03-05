import { retryDelayFor429 } from "./policy";
import type { AppConfig, DeliveryClient, DeliveryResult, EmailQueueMessage } from "./types";

interface SendResponseData {
  id?: string;
}

interface SendResponseError {
  message?: string;
}

interface SendResponseBody {
  data?: SendResponseData;
  error?: SendResponseError;
}

export function createResendClient(
  apiKey: string,
  config: AppConfig,
  fetchFn: typeof fetch = fetch,
): DeliveryClient {
  return {
    async sendEmail(payload: EmailQueueMessage): Promise<DeliveryResult> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.resendTimeoutMs);

      try {
        const response = await fetchFn("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": payload.messageId,
          },
          signal: controller.signal,
          body: JSON.stringify({
            from: payload.from,
            to: payload.to,
            cc: payload.cc,
            bcc: payload.bcc,
            reply_to: payload.replyTo,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            tags: payload.tags,
          }),
        });

        const body = (await response.json().catch(() => ({}))) as SendResponseBody;
        const providerError = body.error?.message || `Resend HTTP ${response.status}`;

        if ((response.status === 200 || response.status === 201) && body.data?.id) {
          return { ok: true, providerMessageId: body.data.id };
        }

        if (response.status === 429) {
          return {
            ok: false,
            retryable: true,
            errorCode: "RESEND_429",
            errorMessage: providerError,
            retryDelaySeconds: retryDelayFor429(config),
          };
        }

        if (response.status >= 500) {
          return {
            ok: false,
            retryable: true,
            errorCode: "RESEND_5XX",
            errorMessage: providerError,
            retryDelaySeconds: config.retry5xxSeconds,
          };
        }

        return {
          ok: false,
          retryable: false,
          errorCode: "RESEND_VALIDATION_ERROR",
          errorMessage: providerError,
        };
      } catch (error) {
        const isAbort = error instanceof DOMException && error.name === "AbortError";
        return {
          ok: false,
          retryable: true,
          errorCode: isAbort ? "NETWORK_TIMEOUT" : "NETWORK_ERROR",
          errorMessage: error instanceof Error ? error.message : "Unknown network error",
          retryDelaySeconds: config.retryNetworkSeconds,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
