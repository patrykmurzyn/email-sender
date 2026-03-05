-- Migration: email event log + idempotencja + wydajne liczenie dobowego limitu

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,

  -- Dane routingu / wiadomości
  from_email TEXT NOT NULL,
  to_emails_json TEXT NOT NULL,
  cc_emails_json TEXT,
  bcc_emails_json TEXT,
  reply_to TEXT,
  subject TEXT NOT NULL,

  -- Treść (opcjonalnie trzymana w DB; przy dużych wolumenach rozważyć tylko hash/metadata)
  html_body TEXT,
  text_body TEXT,

  -- Status przetwarzania
  status TEXT NOT NULL CHECK (status IN (
    'received',
    'duplicate',
    'rate_limited',
    'sent',
    'retryable_error',
    'permanent_error',
    'invalid_payload'
  )),

  -- Provider
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,

  -- Błędy
  error_code TEXT,
  error_message TEXT,

  -- Dodatkowe dane
  metadata_json TEXT,
  queue_message_id TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at TEXT
);

-- Jednoznaczny sukces per message_id (idempotencja biznesowa)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_unique_sent_message
ON email_events(message_id)
WHERE status = 'sent';

-- Szybkie liczenie wysłanych w rolling 24h
CREATE INDEX IF NOT EXISTS idx_email_events_sent_at
ON email_events(sent_at)
WHERE status = 'sent';

-- Odczyt historii konkretnej wiadomości
CREATE INDEX IF NOT EXISTS idx_email_events_message_id_created_at
ON email_events(message_id, created_at DESC);

-- Odczyt problematycznych przypadków
CREATE INDEX IF NOT EXISTS idx_email_events_status_created_at
ON email_events(status, created_at DESC);

-- Widok pomocniczy: aktualny licznik wysyłek w 24h
CREATE VIEW IF NOT EXISTS v_sent_last_24h AS
SELECT COUNT(*) AS sent_count_24h
FROM email_events
WHERE status = 'sent'
  AND sent_at >= datetime('now', '-24 hours');

-- Przykładowe zapytania operacyjne:
-- 1) Czy message_id był już sent?
-- SELECT 1 FROM email_events WHERE message_id = ? AND status = 'sent' LIMIT 1;
--
-- 2) Ile wysłano w ostatnich 24h?
-- SELECT sent_count_24h FROM v_sent_last_24h;
--
-- 3) Ile zostało przy progu 95?
-- SELECT MAX(0, 95 - sent_count_24h) AS remaining FROM v_sent_last_24h;
