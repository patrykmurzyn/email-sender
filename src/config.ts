import type { AppConfig, Env } from "./types";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseOptionalPositiveInt(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("DAILY_LIMIT must be a positive integer when provided");
  }
  return parsed;
}

function assertSecret(name: keyof Env, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
}

export function getConfig(env: Env): AppConfig {
  assertSecret("RESEND_API_KEY", env.RESEND_API_KEY);
  assertSecret("TURSO_DATABASE_URL", env.TURSO_DATABASE_URL);
  assertSecret("TURSO_AUTH_TOKEN", env.TURSO_AUTH_TOKEN);

  return {
    dailyLimit: parseOptionalPositiveInt(env.DAILY_LIMIT),
    rateLimitDelayMs: parsePositiveInt(env.RATE_LIMIT_DELAY_MS, 1000),
    rateLimitRetrySeconds: parsePositiveInt(env.RATE_LIMIT_RETRY_SECONDS, 3600),
    retry429MinSeconds: parsePositiveInt(env.RETRY_429_MIN_SECONDS, 60),
    retry429MaxSeconds: parsePositiveInt(env.RETRY_429_MAX_SECONDS, 300),
    retry5xxSeconds: parsePositiveInt(env.RETRY_5XX_SECONDS, 60),
    retryNetworkSeconds: parsePositiveInt(env.RETRY_NETWORK_SECONDS, 60),
    resendTimeoutMs: parsePositiveInt(env.RESEND_TIMEOUT_MS, 15000),
  };
}
