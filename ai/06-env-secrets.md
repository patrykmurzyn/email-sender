# Środowisko, Sekrety, Bezpieczeństwo

## Wymagane sekrety Workera

1. `RESEND_API_KEY`
2. `TURSO_DATABASE_URL`
3. `TURSO_AUTH_TOKEN`

Ustawianie:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
```

## Wymagane zmienne nie-sekretne (opcjonalnie jako vars)

1. `DAILY_SOFT_LIMIT=95`
2. `DAILY_HARD_LIMIT=100`
3. `RATE_LIMIT_DELAY_MS=1000`
4. `RATE_LIMIT_RETRY_SECONDS=3600`

## Bezpieczeństwo

1. Token Turso podany wcześniej uznać za skompromitowany.
2. Zrotować token i używać wyłącznie nowego.
3. Nigdy nie commitować kluczy do repo.
4. Logi nie powinny zawierać pełnych sekretów ani pełnego HTML z danymi wrażliwymi.

## Domena Resend

Przed wysyłką produkcyjną:
1. Domena musi być `verified`.
2. SPF/DKIM/DMARC muszą być poprawne.
3. Adres `from` musi należeć do zweryfikowanej domeny.
