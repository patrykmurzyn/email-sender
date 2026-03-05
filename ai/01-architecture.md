# Architektura i Workflow

## Cel

Niezawodna, prosta wysyłka emaili z kolejki Cloudflare z kontrolą:
- tempa wysyłki (1/s),
- limitu dobowego (100/dzień na etapie testów),
- retry i logowaniem wszystkich prób.

## Komponenty

1. Producer (dowolna aplikacja)
- Publikuje wiadomości do kolejki `emails`.

2. Cloudflare Queue: `emails`
- Buforuje wiadomości do asynchronicznego przetwarzania.

3. Consumer Worker (Cloudflare)
- Odbiera wiadomości z `emails`.
- Waliduje payload.
- Sprawdza limit dobowy w Turso.
- Wysyła email przez Resend.
- Zapisuje wynik próby do Turso.
- Decyduje `ack()` vs `retry()`.

4. Resend
- Provider wysyłki emaili przez API.

5. Turso/libSQL
- Trwałe logi prób wysyłki.
- Podstawa do idempotencji i liczenia limitu dobowego.

## Workflow pojedynczej wiadomości

1. Producer wysyła payload do kolejki `emails`.
2. Worker odbiera 1 wiadomość (batch=1).
3. Worker sprawdza, czy `message_id` nie był już zakończony sukcesem.
4. Worker liczy ile maili `sent` było w ostatnich 24h.
5. Jeśli limit >= 95:
- zapisuje status `rate_limited`,
- wykonuje `retry` z opóźnieniem 1h.
6. Jeśli limit < 95:
- wysyła przez Resend,
- zapisuje wynik (`sent` albo `failed_*`).
7. Worker decyduje:
- `ack()` dla sukcesu i błędów trwałych,
- `retry()` dla błędów tymczasowych.
8. Worker czeka 1s przed kolejną próbą (throttle).

## Zasady niezawodności

1. Idempotencja:
- unikalny `message_id`.
- jeśli wiadomość już `sent`, kolejne dostarczenie jest traktowane jako duplikat i `ack()`.

2. Retry:
- tylko błędy tymczasowe (429/5xx/network/timeout, lokalnie także limit dobowy).

3. Trwałe błędy:
- payload invalid, `from`/`to` invalid itp. -> zapis błędu + `ack()`.

4. Audyt:
- każda próba ma wpis w DB (nawet gdy retry).

## Uwagi o retencji Queue

- Długi backlog może skutkować wygaśnięciem wiadomości zależnie od planu i retencji.
- Dlatego:
  - utrzymujemy bufor limitu (`95/100`),
  - retry przy limicie robimy co 1h,
  - monitorujemy backlog i błędy.
