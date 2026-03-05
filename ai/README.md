# Email Sender Worker - AI Handoff Docs

Ten katalog zawiera komplet informacji potrzebnych do implementacji systemu wysyłki emaili opartego o:
- Cloudflare Queues (`emails`)
- Cloudflare Worker (consumer)
- Resend (provider wysyłki)
- Turso/libSQL (logi prób wysyłki, limity, idempotencja)

## Spis dokumentów

1. `01-architecture.md` - architektura i workflow end-to-end
2. `02-queue-payload-schema.md` - kontrakt wiadomości wrzucanej do kolejki
3. `03-worker-behavior.md` - dokładna logika Workera i zasady ack/retry
4. `04-database-schema.sql` - migracja SQL (tabele, indeksy)
5. `05-wrangler-config.md` - konfiguracja `wrangler.jsonc`
6. `06-env-secrets.md` - środowisko, sekrety, bezpieczeństwo
7. `07-error-mapping.md` - mapowanie błędów Resend -> akcja
8. `08-implementation-checklist.md` - kolejność wdrożenia i testów

## Kluczowe decyzje (ustalone)

- Jedna kolejka: `emails` (bez dodatkowych kolejek aplikacyjnych).
- Consumer push-based w Cloudflare Worker.
- Rate limit aplikacyjny: ~1 wiadomość/sekundę.
- Limit dobowy: plan testowy 100/dobę, praktyczny stop przy 95 jako bufor.
- Limit liczony w rolling 24h na podstawie rekordów `sent` w DB.
- Wszystkie próby (udane i nieudane) zapisywane w DB.
- Retry dla błędów tymczasowych + przy przekroczonym limicie dobowym.

## Ważne bezpieczeństwo

Token Turso został wklejony w rozmowie i należy traktować go jako ujawniony.
Przed implementacją:
1. Zrotuj token Turso.
2. Ustaw nowy token jako secret Workera.
