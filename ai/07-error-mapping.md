# Mapowanie Błędów Resend -> Akcja Workera

## Tabela decyzji

| Warunek | Kategoria | Status DB | Akcja queue |
|---|---|---|---|
| HTTP 200/201 i `data.id` | sukces | `sent` | `ack()` |
| HTTP 429 | tymczasowy limit providera | `retryable_error` | `retry(delay 60-300s)` |
| HTTP 5xx | błąd providera | `retryable_error` | `retry(delay 60s)` |
| timeout/network error | błąd infrastruktury | `retryable_error` | `retry(delay 60s)` |
| lokalny limit >= 95/24h | ograniczenie biznesowe | `rate_limited` | `retry(delay 3600s)` |
| HTTP 4xx walidacyjny (poza 429) | błąd trwały payloadu | `permanent_error` | `ack()` |
| payload niezgodny ze schematem | błąd trwały | `invalid_payload` | `ack()` |
| już wcześniej `sent` dla `message_id` | duplikat | `duplicate` | `ack()` |

## Przykładowe kody błędów do `error_code`

- `RESEND_429`
- `RESEND_5XX`
- `NETWORK_TIMEOUT`
- `DAILY_LIMIT_REACHED`
- `INVALID_PAYLOAD`
- `RESEND_VALIDATION_ERROR`
- `DUPLICATE_MESSAGE`

## Wymagane pola logowane przy błędzie

1. `message_id`
2. `status`
3. `error_code`
4. `error_message`
5. `provider`
6. `created_at`
7. `queue_message_id`
