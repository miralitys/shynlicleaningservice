# Самостоятельный запуск сайта (без Tilda-хостинга)

## Что уже сделано
- Все страницы из экспорта подключены к ЧПУ-URL через `routes.json`.
- Поднят локальный сервер `server.js` на Node.js.
- Сервер может работать только на встроенных модулях Node для основного роутинга, но платежный endpoint использует зависимость `stripe`, если она настроена.
- В HTML на лету удаляется Tilda-бейдж `Made on Tilda`.
- Quote CRM flow переведен на backend helper `lib/leadconnector.js`, а публичный клиент больше не содержит live GHL token.
- `/__perf` теперь закрыт по умолчанию и открывается только через явный opt-in token.
- Публичная раздача ограничена allowlist-папками (`css/`, `images/`, `js/`) и безопасными top-level asset files.

## Локальный запуск
```bash
cd /Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site
npm install
npm start
```

Открой:
- `http://localhost:3000/`
- `http://localhost:3000/quote`
- `http://localhost:3000/services/regular-cleaning`

## Продакшн запуск на сервере
```bash
cd /path/to/selfhosted_site
npm install
node server.js
```

По умолчанию порт `3000`. Можно поменять:
```bash
PORT=8080 node server.js
```

## Тесты
После onboarding у проекта есть минимальный smoke-набор для server/runtime contract:

```bash
cd /Users/ramisyaparov/Desktop/Project/shynlicleaningservice/selfhosted_site
npm test
```

Проверяются:
- отдача `/`
- runtime diagnostics на `/__perf`
- корректный `503` на Stripe endpoint без `STRIPE_SECRET_KEY`
- поведение неизвестного route
- hardening вокруг Stripe origin/body validation и private file denial
- backend contract для `/api/quote/submit`
- текущий remediation suite локально зеленый: `48/48`

## ENV и локальная настройка
- Смотри `.env.example` для базовых переменных.
- Для локальной разработки безопаснее использовать `HOST=127.0.0.1`.
- Для canonical origin и Stripe redirect defaults используй `PUBLIC_SITE_ORIGIN` или `SITE_BASE_URL`.
- Browser key для Google Places теперь задается через `GOOGLE_PLACES_API_KEY` и должен быть ограничен в Google Cloud по точным referrer/API restrictions.
- Для signed checkout flow можно явно задать `QUOTE_SIGNING_SECRET`; если он не указан, сервер использует существующий server-side secret (`STRIPE_SECRET_KEY` или `GHL_API_KEY`) как fallback.

## Мониторинг производительности
- Диагностика в рантайме: `GET /__perf` только если одновременно заданы `ENABLE_PERF_ENDPOINT=1` и `PERF_ENDPOINT_TOKEN`, а запрос идет с `x-perf-token`.
- Сервер глобально добавляет baseline security headers: `Content-Security-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`.
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

Включение `/__perf`:
```bash
ENABLE_PERF_ENDPOINT=1 \
PERF_ENDPOINT_TOKEN=replace-with-random-secret \
node server.js
```

Базовые abuse guardrails на публичных POST endpoints:
```bash
POST_RATE_LIMIT_WINDOW_MS=60000 \
POST_RATE_LIMIT_MAX_REQUESTS=10 \
node server.js
```

Если origin стоит за доверенным proxy/CDN и нужен rate limit по реальному клиентскому IP, включай это явно и указывай allowlist proxy IP:
```bash
TRUST_PROXY_HEADERS=1 \
TRUSTED_PROXY_IPS=127.0.0.1,::1 \
node server.js
```

## Важно по заявкам
- На странице `/quote` финальная отправка уходит в `POST /api/quote/submit`.
- Сервер вызывает `createLeadConnectorClient({ env: process.env, fetch: global.fetch })`, сам пишет в CRM и возвращает signed `quoteToken` для оплаты.
- CRM side effects теперь используют уже canonical repriced quote snapshot, а не raw browser totals.
- CRM page attribution зафиксирован на публичный `/quote`, а не на backend endpoint `/api/quote/submit`.
- После деплоя нужно ротировать старый browser-exposed GHL token, если он уже успел использоваться вне dev-среды.
- Старый совместимый alias `/api/quote/request` пока сохранен, но новый клиент использует `/api/quote/submit`.
- `/api/stripe/checkout-session` больше не доверяет клиентскому `amount`: checkout создается только по server-signed quote token.

## Контракт для `server.js`
Helper экспортирует `createLeadConnectorClient({ env, fetch, config })`.

Ожидаемый вызов:
```js
const { createLeadConnectorClient } = require("./lib/leadconnector");

const ghl = createLeadConnectorClient({
  env: process.env,
  fetch: global.fetch,
});

const result = await ghl.submitQuoteSubmission({
  contactData: {
    fullName: "Jane Doe",
    phone: "3125550100",
    email: "jane@example.com",
  },
  calculatorData: {
    serviceType: "regular",
    rooms: 3,
    totalPrice: 120,
  },
  source: "Website Quote",
  pageUrl: "https://shynlicleaningservice.com/quote",
  requestId,
  userAgent: req.headers["user-agent"] || "",
});
```

Форма ответа:
- `ok: true` + `status: 200/201` при успехе.
- `ok: false` + `status: 400` при невалидном payload.
- `ok: false` + `status: 503` если `GHL_API_KEY` или `GHL_LOCATION_ID` не заданы.
- `warnings` может содержать `note_failed`, `opportunity_failed`, `custom_fields_update_failed`, если CRM приняла заявку частично.
