## Attempt API smoke checks

> Запускать вручную, без выполнения в этом задании.

### 1. Запись события

```bash
curl -X POST "http://localhost:8000/api/attempts/attempt-123/events" \
  -H "Content-Type: application/json" \
  -d '{
    "testId": "test-123",
    "clientId": "client-123",
    "event": {
      "eventType": "answer",
      "ts": 1710000000,
      "questionId": 1,
      "selectedOption": 2
    }
  }'
```

### 2. Финализация попытки

```bash
curl -X POST "http://localhost:8000/api/attempts/attempt-123/finalize" \
  -H "Content-Type: application/json" \
  -d '{
    "testId": "test-123",
    "clientId": "client-123",
    "aggregates": {
      "score": 4,
      "maxScore": 5,
      "durationMs": 120000
    }
  }'
```

### 3. Список попыток

```bash
curl "http://localhost:8000/api/stats/attempts?clientId=client-123"
```

### 4. Детальная статистика

```bash
curl "http://localhost:8000/api/stats/attempts/attempt-123?clientId=client-123"
```
