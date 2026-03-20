#!/usr/bin/env node
import { createClient } from "@libsql/client";
import { readdir, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");
const STATE_FILE = join(__dirname, "..", ".migrations_state");

async function loadEnv() {
  try {
    const envContent = await readFile(join(__dirname, "..", ".env"), "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join("=").trim();
        }
      }
    }
  } catch {
    // .env not found, rely on environment variables
  }
}

await loadEnv();

async function getAppliedMigrations() {
  try {
    const content = await readFile(STATE_FILE, "utf-8");
    return new Set(content.split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

async function saveAppliedMigrations(migrations) {
  await writeFile(STATE_FILE, [...migrations].sort().join("\n") + "\n");
}

async function runMigrations() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  const migrationFiles = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = await getAppliedMigrations();
  const pending = migrationFiles.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("No pending migrations");
    return;
  }

  console.log(`Running ${pending.length} migration(s)...`);

  for (const file of pending) {
    console.log(`  Running: ${file}`);
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");

    try {
      await client.executeMultiple(sql);
      applied.add(file);
      await saveAppliedMigrations(applied);
      console.log(`  Applied: ${file}`);
    } catch (error) {
      console.error(`  Failed: ${file}`);
      console.error(error);
      process.exit(1);
    }
  }

  console.log("All migrations applied successfully");
}

runMigrations();
