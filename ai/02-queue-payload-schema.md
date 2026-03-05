# Kontrakt Payloadu Kolejki (`emails`)

## Założenia

- Preferowany content: `html`.
- Dopuszczalny fallback: `text`.
- Co najmniej jedno z: `html` lub `text` musi istnieć.

## JSON Schema (specyfikacja logiczna)

```json
{
  "type": "object",
  "required": ["messageId", "from", "to", "subject"],
  "properties": {
    "messageId": {
      "type": "string",
      "description": "UUID/unikalny identyfikator wiadomości dla idempotencji"
    },
    "from": {
      "type": "string",
      "description": "Adres nadawcy, np. 'Sklep <noreply@twojadomena.pl>'"
    },
    "to": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "string" }
    },
    "cc": {
      "type": "array",
      "items": { "type": "string" }
    },
    "bcc": {
      "type": "array",
      "items": { "type": "string" }
    },
    "replyTo": {
      "type": "string"
    },
    "subject": {
      "type": "string",
      "maxLength": 998
    },
    "html": {
      "type": "string"
    },
    "text": {
      "type": "string"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "value"],
        "properties": {
          "name": { "type": "string" },
          "value": { "type": "string" }
        }
      }
    },
    "metadata": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "anyOf": [
    { "required": ["html"] },
    { "required": ["text"] }
  ],
  "additionalProperties": false
}
```

## Przykład payloadu

```json
{
  "messageId": "8fce0e66-bd1c-46d2-aa9a-fced3e243f68",
  "from": "Acme <noreply@twojadomena.pl>",
  "to": ["jan@example.com"],
  "subject": "Potwierdzenie zamówienia #123",
  "html": "<h1>Dziękujemy</h1><p>Twoje zamówienie jest przyjęte.</p>",
  "metadata": {
    "tenantId": "acme",
    "template": "order_confirmation",
    "orderId": "123"
  }
}
```

## Walidacja biznesowa

1. `messageId` musi być unikalny globalnie.
2. `to` nie może być puste.
3. Co najmniej jedno z `html`/`text`.
4. `from` musi należeć do zweryfikowanej domeny w Resend.
5. Limit rozmiaru payloadu musi mieścić się w limitach Queues.
