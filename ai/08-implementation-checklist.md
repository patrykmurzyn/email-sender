# Checklist Implementacji

## Etap 0: przygotowanie

1. Zrotuj token Turso.
2. Potwierdź status domeny Resend = `verified`.
3. Potwierdź istnienie kolejki `emails`.

## Etap 1: bootstrap projektu Worker

1. Utwórz projekt Cloudflare Worker (TypeScript).
2. Dodaj SDK:
- `resend`
- `@libsql/client`
- biblioteka walidacji (np. `zod`)
3. Skonfiguruj `wrangler.jsonc` wg `05-wrangler-config.md`.

## Etap 2: baza danych

1. Wykonaj migrację z `04-database-schema.sql` na Turso.
2. Zweryfikuj indeksy i widok `v_sent_last_24h`.

## Etap 3: sekrety i konfiguracja

1. Ustaw sekrety Workera (`RESEND_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
2. Ustaw zmienne limitów (opcjonalnie `vars`).

## Etap 4: logika Workera

1. Implementuj walidację payloadu.
2. Implementuj idempotencję po `message_id`.
3. Implementuj licznik rolling 24h (`sent`).
4. Implementuj wysyłkę przez Resend.
5. Implementuj mapowanie błędów i decyzję `ack/retry`.
6. Implementuj zapis wszystkich prób do `email_events`.
7. Implementuj throttle 1/s.

## Etap 5: testy lokalne

1. Uruchom `npx wrangler dev`.
2. Wyślij testowe wiadomości na kolejkę.
3. Sprawdź:
- zapis `sent` i `failed` w DB,
- retry dla błędów wymuszonych,
- zatrzymanie wysyłki przy limicie 95/24h.

## Etap 6: deploy i obserwowalność

1. `npx wrangler deploy`.
2. `npx wrangler tail`.
3. Monitoruj:
- liczbę `retryable_error`,
- tempo wzrostu backlogu,
- sent_count_24h i remaining quota.

## Etap 7: skalowanie (przyszłość)

1. Po przejściu na wyższy plan Resend:
- podnieś limity dzienne,
- ewentualnie zwiększ concurrency/batch.
2. Jeśli wolumen urośnie, rozważ:
- osobny mechanizm raportowania,
- partycjonowanie/log retention,
- dodatkową kolejkę DLQ (opcjonalnie).
