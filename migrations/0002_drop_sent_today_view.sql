PRAGMA foreign_keys = ON;

DROP VIEW IF EXISTS v_sent_today;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_sending_lock
ON email_events(message_id, status)
WHERE status = 'sending';

-- Add 'sending' status to allowed values (requires recreating the CHECK constraint)
DROP TABLE IF EXISTS email_events_new;
CREATE TABLE email_events_new (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  from_email TEXT,
  to_emails_json TEXT,
  cc_emails_json TEXT,
  bcc_emails_json TEXT,
  reply_to TEXT,
  subject TEXT,
  content_hash TEXT,
  content_size INTEGER,
  status TEXT NOT NULL CHECK (status IN (
    'sending',
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
INSERT INTO email_events_new SELECT * FROM email_events;
DROP TABLE email_events;
ALTER TABLE email_events_new RENAME TO email_events;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_unique_sent_message ON email_events(message_id) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_email_events_sent_at ON email_events(sent_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_email_events_message_id_created_at ON email_events(message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_status_created_at ON email_events(status, created_at DESC);
