#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function loadDotEnv(filepath) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function cfApiJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const msg = errors.length > 0 ? JSON.stringify(errors) : `HTTP ${response.status}`;
    throw new Error(`Cloudflare API request failed: ${msg}`);
  }
  return payload;
}

async function resolveQueueId({ accountId, apiToken, queueName, queueId }) {
  if (queueId) return queueId;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues`;
  const payload = await cfApiJson(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });
  const queues = Array.isArray(payload.result) ? payload.result : [];
  const queue = queues.find((item) => item.queue_name === queueName);
  if (!queue?.queue_id) {
    throw new Error(`Queue "${queueName}" not found in account ${accountId}`);
  }
  return queue.queue_id;
}

function buildTestBody() {
  const from = requireEnv("TEST_FROM");
  const to = requireEnv("TEST_TO");
  const subject = process.env.TEST_SUBJECT || "Queue smoke test";
  const html = process.env.TEST_HTML;
  const text = process.env.TEST_TEXT;

  if (!html && !text) {
    throw new Error("Provide TEST_HTML or TEST_TEXT in .env");
  }

  return {
    messageId: crypto.randomUUID(),
    from,
    to: [to],
    subject,
    html,
    text,
    metadata: {
      source: "queue-smoke-test",
      createdAt: new Date().toISOString(),
    },
  };
}

async function publishMessage({ accountId, apiToken, queueId, body }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues/${queueId}/messages`;
  await cfApiJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
}

async function main() {
  const cwd = process.cwd();
  loadDotEnv(path.join(cwd, ".env"));
  loadDotEnv(path.join(cwd, ".env.local"));

  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const queueName = process.env.CF_QUEUE_NAME || "emails";
  const queueId = process.env.CF_QUEUE_ID;

  const resolvedQueueId = await resolveQueueId({
    accountId,
    apiToken,
    queueName,
    queueId,
  });
  const body = buildTestBody();
  await publishMessage({
    accountId,
    apiToken,
    queueId: resolvedQueueId,
    body,
  });

  console.log("Message published successfully.");
  console.log(`queue_id=${resolvedQueueId}`);
  console.log(`messageId=${body.messageId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

