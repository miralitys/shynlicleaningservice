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

## Важно по заявкам
- На странице `/quote` есть прямая интеграция с LeadConnector (GHL) через API ключ в клиентском JS.
- Рекомендуется вынести API-ключ на backend и затем выпустить новый ключ.

