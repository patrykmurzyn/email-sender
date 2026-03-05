# Zachowanie Consumer Workera

## Konfiguracja wykonania

- `max_batch_size = 1`
- `max_batch_timeout = 1`
- `max_concurrency = 1`
- throttle wewnętrzny: `sleep(1000)` po każdej obsłużonej wiadomości

To zapewnia około 1 wiadomość/sekundę.

## Algorytm (kolejność)

1. Odczytaj `message.body` i zwaliduj payload.
2. Sprawdź idempotencję:
- jeśli `message_id` ma już status `sent`, zakończ jako duplikat (`ack`).
3. Policz wysłane maile w rolling 24h:
- `count(sent where sent_at >= now - 24h)`.
4. Jeśli licznik >= 95:
- zapisz wpis `rate_limited`,
- `retry({ delaySeconds: 3600 })`.
5. Jeśli licznik < 95:
- wywołaj Resend API,
- zapisz wynik do DB.
6. Decyzja ack/retry:
- sukces -> `ack()`,
- błąd tymczasowy -> `retry()` (z opóźnieniem),
- błąd trwały -> `ack()`.
7. `await sleep(1000)`.

## Statusy zdarzeń w DB

- `received` - odebrano z kolejki
- `duplicate` - pominięto, bo już wysłane
- `rate_limited` - odroczono przez limit dobowy
- `sent` - wysłano poprawnie
- `retryable_error` - błąd tymczasowy, planowany retry
- `permanent_error` - błąd trwały, brak retry
- `invalid_payload` - payload nie przeszedł walidacji

## Logika idempotencji

- `message_id` jest kluczem biznesowym.
- Przy starcie przetwarzania odczytaj ostatni rekord dla `message_id`.
- Jeśli kiedykolwiek był `sent`, nie wysyłaj ponownie.

## Retry policy (proponowana)

- `429` -> retry z opóźnieniem 60-300s (można rosnąco)
- `5xx` -> retry z opóźnieniem 60s
- network timeout/error -> retry z opóźnieniem 60s
- lokalny `rate_limited` (limit dobowy) -> retry 3600s

## Kiedy `ack()` mimo błędu

- Niepoprawny payload (`invalid_payload`)
- Błędy walidacji adresów i pól z Resend (`4xx` non-rate-limit)
- Brak wymaganych danych konfiguracyjnych (po zapisaniu krytycznego logu)

## Kiedy `retry()`

- Resend `429`
- Resend `5xx`
- Timeouty i błędy sieciowe
- Przekroczony lokalny limit dobowy

## Timeouty i bezpieczeństwo

- Ustawić timeout HTTP do Resend (np. 10-15s).
- Wszystkie wyjątki muszą kończyć się wpisem do DB (o ile DB dostępne).
- Jeśli DB niedostępna, log do `console.error` z pełnym kontekstem.
