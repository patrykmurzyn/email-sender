# Konfiguracja Wrangler (`wrangler.jsonc`)

## Cel konfiguracji

- Podpiąć istniejącą kolejkę `emails` jako consumer.
- Ograniczyć równoległość do 1.
- Włączyć retry przez mechanikę Queues.

## Przykład `wrangler.jsonc`

```jsonc
{
  "name": "email-consumer",
  "main": "src/index.ts",
  "compatibility_date": "2026-03-05",

  "queues": {
    "consumers": [
      {
        "queue": "emails",
        "max_batch_size": 1,
        "max_batch_timeout": 1,
        "max_retries": 20,
        "max_concurrency": 1
      }
    ]
  }
}
```

## Uwagi

1. `max_retries` można zwiększyć przy dłuższych awariach providera.
2. Jeśli backlog rośnie, monitorować opóźnienie i rozważyć zmianę planu/limitów.
3. Dla środowisk (`dev`, `prod`) warto użyć osobnych kolejek lub osobnych projektów Workera.
