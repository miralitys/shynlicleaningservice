# Финальная разметка: часы, профили и стартовые цены

Дата: 21 октября 2026. Продолжение первоначальной задачи по JSON-LD.

## Изменения

- На главной сохранён ID `https://shynlicleaningservice.com/#localbusiness`.
- Тип по прямому указанию пользователя: `["HouseCleaningService", "LocalBusiness"]`.
- Часы: ежедневно, понедельник–воскресенье, 09:00–18:00.
- Добавлены ровно пять предоставленных профилей: Google Naperville, BBB, Thumbtack, Yelp и Nextdoor.
- На `/aurora` в Service добавлен отдельный профиль Google с cid=5408416184318024401. Его нет в sameAs главной. Provider остаётся ссылкой на общий ID бизнеса.
- У стартовых цен вместо точного `price` используется числовой `PriceSpecification.minPrice`, с USD в Offer и PriceSpecification.
- Названия тарифов сохранены, каждый тариф — отдельный Offer. Regular: Weekly 135, Bi-Weekly 145, Monthly 155. Страницы явно предупреждают, что окончательная цена зависит от дома, поэтому эти суммы считаются базовыми, а не гарантированной итоговой стоимостью.
- Явные From $195 на Deep и From $241 на рекламной Move In/Out также представлены минимальными ценами, включая ads-lp.
- Точные цены допов и точные цены в тестовых сценариях сохранены через `price`, без смены значений и типов данных.
- Не добавлялись адрес улицы, ZIP, отзывы, рейтинги, налоги или выдуманные цены.

## Итоговый JSON-LD

Файлы содержат все JSON-LD-блоки соответствующей страницы, без сокращений:

- [Главная](final-home.json) — полный бизнес, WebSite и FAQ.
- [Aurora](final-aurora.json) — BreadcrumbList, Service с отдельным sameAs и FAQ.
- [Regular Cleaning](final-regular.json) — включая три тарифных Offer с minPrice.

## Ограничение типа

HouseCleaningService отсутствует в [официальном словаре Schema.org](https://schema.org/version/latest/schemaorg-current-https.jsonld). Этот ярлык включён по явному требованию пользователя вместе с действительным LocalBusiness. Google распознал LocalBusiness и не сообщил об ошибках; это не означает, что HouseCleaningService стал стандартным типом Schema.org.

## Проверки до деплоя

- Полный набор: **757 тестов пройдено, 0 ошибок, 0 пропусков**.
- Целевой набор разметки и smoke-тестов: **63 теста пройдено**.
- Проверено 318 публичных маршрутов из карты сайта и списка маршрутов, включая статьи: HTTP 200, все 678 JSON-LD-блоков разбираются.
- На всех 318 страницах HTML вне JSON-LD побайтно совпадает с исходным.
- robots.txt и sitemap.xml в изолированном сервере побайтно совпадают с исходными.
- Названия и значения восьми точных допов на pricing-v2 не изменились.
- `git diff --check` без ошибок.

## Google Rich Results Test до деплоя

Проверялся полный код локально отрендеренных страниц в режиме «код», поскольку новые значения ещё не были опубликованы на момент проверки.

| Страница | Результат | Ссылка |
| --- | --- | --- |
| / | 2 валидные сущности, ошибок нет; 2 необязательных предупреждения адреса | [Результат](https://search.google.com/test/rich-results/result?id=zSuk-NNt03WQ4R8eyxT4KQ) |
| /services/regular-cleaning | 1 валидная запись BreadcrumbList, без ошибок и предупреждений | [Результат](https://search.google.com/test/rich-results/result?id=7cItN8A_XcDEj1MpYg9eTw) |
| /naperville | 1 валидная запись BreadcrumbList, без ошибок и предупреждений | [Результат](https://search.google.com/test/rich-results/result?id=U9BYndtDMj85jWyv3SG0Og) |
| /aurora | 1 валидная запись BreadcrumbList, без ошибок и предупреждений | [Результат](https://search.google.com/test/rich-results/result?id=zqcn07d0H2gzVlrBeVLdgQ) |

Предупреждения на главной: отсутствуют необязательные streetAddress и postalCode. Эти поля намеренно не добавлялись.
Google Rich Results Test показывает только поддерживаемые расширенные результаты. Валидная JSON-LD-разметка Service сама по себе не гарантирует отдельный расширенный результат услуги, индексацию или изменение позиций.

## Где изменился JSON-LD

- `/`
- `/aurora`
- `/cleaners-near-me`
- `/services/deep-cleaning/ads`
- `/services/deep-cleaning/ads-lp`
- `/services/deep-cleaning/ads-v2`
- `/services/move-in-move-out-cleaning/ads-lp`
- `/services/regular-cleaning`
- `/services/regular-cleaning/ads`
- `/services/regular-cleaning/ads-lp`
- `/services/regular-cleaning/ads-v2`

## Файлы и границы

Код приложения изменён только в `lib/site/structured-data.js`. Дополнены `test/site-structured-data.test.js` и файлы этого отчёта.

Видимый контент, CSS, формы, URL страниц, canonical, robots/noindex и генератор sitemap не менялись. При новой сборке существующая логика sitemap может обновить технические даты lastmod; состав URL и правила остаются прежними.
Нет SQL-миграций и изменений клиентов, заказов, цен калькулятора, расписаний или уведомлений.

Посторонний локальный файл `test/admin-route-client-order-prefill.test.js` и предыдущий локальный отчёт deployment-71a5f6e8.md не относятся к этой задаче и не включаются в её коммит.

## Повторная проверка и откат

`node --test test/site-structured-data.test.js test/server-smoke.test.js`, затем `node --test`.

Для отката вернуть предыдущую версию `lib/site/structured-data.js` и соответствующие тесты; база не затрагивается.
