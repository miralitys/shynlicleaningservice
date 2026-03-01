# Самостоятельный запуск сайта (без Tilda-хостинга)

## Что уже сделано
- Все страницы из экспорта подключены к ЧПУ-URL через `routes.json`.
- Поднят локальный сервер `server.js` без зависимостей.
- В HTML на лету удаляется Tilda-бейдж `Made on Tilda`.

## Локальный запуск
```bash
cd /Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site
npm start
```

Открой:
- `http://localhost:3000/`
- `http://localhost:3000/quote`
- `http://localhost:3000/services/regular-cleaning`

## Продакшн запуск на сервере
```bash
cd /path/to/selfhosted_site
node server.js
```

По умолчанию порт `3000`. Можно поменять:
```bash
PORT=8080 node server.js
```

## Мониторинг производительности
- Диагностика в рантайме: `GET /__perf` (JSON с `p50/p95/p99`, `5xx rate`, `event loop delay`).
- В логи пишутся:
  - `type: "perf_summary"` каждые `60s` (по умолчанию).
  - `type: "perf_alert"` при превышении порогов.

Настройка порогов через ENV:
```bash
ALERT_P95_MS=500 \
ALERT_P99_MS=1000 \
ALERT_5XX_RATE=0.01 \
ALERT_EVENT_LOOP_P95_MS=100 \
node server.js
```

Интервал/окно метрик:
```bash
PERF_SUMMARY_INTERVAL_MS=60000 \
PERF_WINDOW_MS=300000 \
node server.js
```

## Важно по заявкам
- На странице `/quote` есть прямая интеграция с LeadConnector (GHL) через API ключ в клиентском JS.
- Рекомендуется вынести API-ключ на backend и затем выпустить новый ключ.
