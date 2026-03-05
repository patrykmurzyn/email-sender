PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,

  from_email TEXT,
  to_emails_json TEXT,
  cc_emails_json TEXT,
  bcc_emails_json TEXT,
  reply_to TEXT,
  subject TEXT,

  -- Metadata-only retention policy.
  content_hash TEXT,
  content_size INTEGER,

  status TEXT NOT NULL CHECK (status IN (
    'received',
    'duplicate',
    'rate_limited',
    'sent',
    'retryable_error',
    'permanent_error',
    'invalid_payload'
  )),

  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,

  metadata_json TEXT,
  queue_message_id TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_unique_sent_message
ON email_events(message_id)
WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_email_events_sent_at
ON email_events(sent_at)
WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_email_events_message_id_created_at
ON email_events(message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_status_created_at
ON email_events(status, created_at DESC);

CREATE VIEW IF NOT EXISTS v_sent_today AS
SELECT COUNT(*) AS sent_count_today
FROM email_events
WHERE status = 'sent'
  AND date(sent_at) = date('now');
