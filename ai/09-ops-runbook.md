# Runbook Operacyjny

## Szybkie zapytania SQL

Ile wysłano w 24h:
```sql
SELECT sent_count_24h FROM v_sent_last_24h;
```

Ile zostało do soft limitu 95:
```sql
SELECT MAX(0, 95 - sent_count_24h) AS remaining FROM v_sent_last_24h;
```

Ostatnie błędy:
```sql
SELECT message_id, status, error_code, error_message, created_at
FROM email_events
WHERE status IN ('retryable_error', 'permanent_error', 'invalid_payload')
ORDER BY created_at DESC
LIMIT 100;
```

Czy wiadomość była wysłana:
```sql
SELECT 1
FROM email_events
WHERE message_id = ? AND status = 'sent'
LIMIT 1;
```

## Sygnały alarmowe

1. Rosnący backlog queue.
2. Wysoki udział `retryable_error`.
3. Częsty `DAILY_LIMIT_REACHED` przed końcem doby.
4. Dużo `permanent_error` (problem z payloadami/validacją).

## Działania przy incydencie

1. Sprawdź status domeny i API key w Resend.
2. Sprawdź dostępność Turso.
3. Sprawdź `wrangler tail` pod kątem kodów błędów.
4. Jeśli limit dzienny za niski, zmień soft limit lub plan Resend.
