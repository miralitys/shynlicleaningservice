# Отчёт: структурированные данные Shynli

Дата проверки: 21 октября 2026. Только локальные изменения, без деплоя и изменений базы.

## Что сделано

- Единый полный LocalBusiness на главной: Shynli Cleaning Service, телефон +1-630-812-7077, существующий ID https://shynlicleaningservice.com/#localbusiness, рабочие image/logo, priceRange $$, описание, Naperville / IL / US без улицы.
- Каталог бизнеса содержит 6 существующих основных услуг. areaServed содержит все 51 город с реальными страницами, включая 9 новых городов.
- На страницах услуг Service ссылается на тот же ID бизнеса; дубли полных карточек бизнеса удалены из JSON-LD.
- На 51 странице города — отдельный Service с названием House Cleaning in <City>, IL, соответствующим городом, описанием и каталогом услуг, действительно связанных ссылками со страницей.
- FAQPage формируется из фактических вопросов и ответов итогового HTML, с декодированием HTML-сущностей и исключением декоративных значков. Один FAQPage на страницу, только при наличии FAQ.
- BreadcrumbList и другие содержательные типы сохранены.
- Удалены неподтверждённые диапазоны цен из старой разметки. Услуги получают цены только из видимого текста: Regular — weekly $135, bi-weekly $145, monthly $155; на основной Deep Cleaning стартовая цена не указана и поэтому Offer с придуманной базовой ценой отсутствует.
- Рекламные варианты остаются закрытыми от индексации по существующей политике. Их JSON-LD также нормализован без изменения noindex.

## Обоснованное отличие от ТЗ

Тип HouseCleaningService, как и прежний HouseCleaningBusiness, отсутствует в официальном словаре Schema.org. Использованы действительные типы LocalBusiness и Service; несуществующий тип не добавлен.
Проверка по [официальному словарю](https://schema.org/version/latest/schemaorg-current-https.jsonld), [LocalBusiness](https://schema.org/LocalBusiness), [Service](https://schema.org/Service).

## Проверки

Полный запуск `node --test`: **753 пройдено, 0 ошибок**, 0 пропусков.
Отдельный набор по структурированным данным и smoke-тестам: 59 пройдено.
`git diff --check`: без ошибок.

Сопоставлены ответы 100 публичных маршрутов до и после изменений:
- в 77 изменился JSON-LD;
- HTML после исключения JSON-LD совпадает побайтно на всех 100;
- robots.txt и sitemap.xml совпадают;
- неизвестных типов и свойств Schema.org в итоговой разметке не обнаружено;
- полный бизнес найден только на главной;
- image и logo отвечают HTTP 200.

Это проверка публичного рендеринга в изолированном сервере без подключений к Supabase/GHL. Рабочие заказы, суммы, команды и клиентские записи не изменялись.

## Внешняя валидация

Проверялся код локально отрендеренных страниц (режим «код»), не текущий продакшен. У Google одна валидная запись ниже — BreadcrumbList; общая валидность Service и FAQPage проверена отдельно Schema.org.

| Страница | Schema.org Validator | Google Rich Results Test |
| --- | --- | --- |
| Главная | 0 ошибок, 0 предупреждений | 2 валидные сущности, 0 ошибок; 2 необязательных предупреждения у Organization |
| Deep Cleaning | 0 ошибок, 0 предупреждений; BreadcrumbList + Service | 1 валидная запись, без ошибок и предупреждений |
| Naperville | 0 ошибок, 0 предупреждений; BreadcrumbList + Service + FAQPage | 1 валидная запись, без ошибок и предупреждений |
| Shorewood | 0 ошибок, 0 предупреждений; BreadcrumbList + Service + FAQPage | 1 валидная запись, без ошибок и предупреждений |
| FAQ | 0 ошибок, 0 предупреждений; BreadcrumbList + FAQPage | 1 валидная запись, без ошибок и предупреждений |

Результаты Google:
- [Главная](https://search.google.com/test/rich-results/result?id=X3XpMy5ICs5EarHj_8vDSw)
- [Deep Cleaning](https://search.google.com/test/rich-results/result?id=hOaaTS1mfE8iu-4ftzg4hQ)
- [Naperville](https://search.google.com/test/rich-results/result?id=nap3eU9cy8PPSZ0RQA0Dng)
- [Shorewood](https://search.google.com/test/rich-results/result?id=O0v5jVW8tSHojSJ2zxleGw)
- [FAQ](https://search.google.com/test/rich-results/result?id=45HsiTS84fHw9inj-qvk8Q)

[Schema.org Validator](https://validator.schema.org/) проверен для тех же пяти полных HTML-документов. Его результаты в режиме кода не имеют постоянной индивидуальной ссылки.

Предупреждения Google на главной: у адреса нет streetAddress и postalCode. Эти поля не добавлены намеренно: домашнюю улицу не публикуем, ZIP не придумываем. Это не ошибки разметки.

Валидный JSON-LD не гарантирует индексацию и расширенный сниппет. Google прекратил FAQ rich results в мае 2026; FAQPage оставлен как корректная разметка содержания, а не обещание FAQ-сниппета. См. [официальные обновления Google Search](https://developers.google.com/search/updates).

## Что нужно подтвердить

- Часы работы по дням и часовой пояс — до подтверждения openingHours / openingHoursSpecification не публикуются.
- Точные официальные URL Google Business Profile, Facebook, Nextdoor, Thumbtack и других профилей — до подтверждения sameAs отсутствует.
- Название бизнеса использовано ровно из ТЗ: Shynli Cleaning Service; совпадение с актуальной карточкой Google Business Profile отдельно не подтверждалось.
- Улица не нужна для этой реализации и намеренно исключена.

## Файлы

- `lib/site/structured-data.js` — единый построитель и нормализация, извлечение FAQ через parse5.
- `lib/site/seo.js` — подключение построителя.
- `lib/site/sanitize.js` — обработка JSON-LD после формирования финального HTML.
- `package.json`, `package-lock.json` — parse5 7.3.0 и его зависимость entities.
- `test/site-structured-data.test.js` — новые проверки.
- `test/server-smoke.test.js` — обновлены ожидания типов и ссылок на бизнес.
- `docs/seo-schema/` — этот отчёт и примеры.

Существующее стороннее изменение `test/admin-route-client-order-prefill.test.js` не относится к задаче и не редактировалось в рамках этой работы.

При установке зависимости npm сообщил о двух уже существовавших уязвимостях (csv-parse и nodemailer); parse5 и entities не добавили уязвимостей. Исправление сторонних зависимостей в эту задачу не включено.

## Примеры JSON-LD

Полные массивы JSON-LD из итогового серверного HTML, включая хлебные крошки и FAQ, если они есть:
- [Главная — home.json](home.json)
- [Услуга — service.json](service.json)
- [Город Shorewood — city.json](city.json)
- [FAQ — faq.json](faq.json)

## Маршруты с изменённым JSON-LD

Всего 77:

- `/`
- `/ads`
- `/ads-v2`
- `/addison`
- `/aurora`
- `/bartlett`
- `/batavia`
- `/bigrock`
- `/bolingbrook`
- `/bristol`
- `/burrridge`
- `/carolstream`
- `/channahon`
- `/clarendonhills`
- `/cleaners-near-me`
- `/cleaners-near-me/ads-lp`
- `/contacts`
- `/cresthill`
- `/darien`
- `/downersgrove`
- `/elmhurst`
- `/faq`
- `/geneva`
- `/glenellyn`
- `/hinsdale`
- `/home-calculator`
- `/homerglen`
- `/itasca`
- `/joliet`
- `/lemont`
- `/lisle`
- `/lockport`
- `/lombard`
- `/minooka`
- `/montgomery`
- `/naperville`
- `/northaurora`
- `/oakbrook`
- `/oswego`
- `/plainfield`
- `/plano`
- `/pricing-v2`
- `/romeoville`
- `/sandwich`
- `/service-areas`
- `/service-areas-v2`
- `/services/airbnb-cleaning`
- `/services/commercial-cleaning`
- `/services/deep-cleaning`
- `/services/deep-cleaning/ads`
- `/services/deep-cleaning/ads-lp`
- `/services/deep-cleaning/ads-v2`
- `/services/move-in-move-out-cleaning`
- `/services/move-in-move-out-cleaning/ads`
- `/services/move-in-move-out-cleaning/ads-lp`
- `/services/move-in-move-out-cleaning/ads-v2`
- `/services/post-construction-cleaning`
- `/services/regular-cleaning`
- `/services/regular-cleaning/ads`
- `/services/regular-cleaning/ads-lp`
- `/services/regular-cleaning/ads-v2`
- `/stcharles`
- `/shorewood`
- `/streamwood`
- `/sugargrove`
- `/villapark`
- `/warrenville`
- `/wayne`
- `/westchicago`
- `/westmont`
- `/wheaton`
- `/willowbrook`
- `/willowsprings`
- `/winfield`
- `/wooddale`
- `/woodridge`
- `/yorkville`

## Локальная проверка и откат

Предпросмотр: http://127.0.0.1:60811/
Повторная проверка: `node --test test/site-structured-data.test.js test/server-smoke.test.js`, затем `node --test`.

Для отката достаточно убрать подключение finalizeStructuredData, вернуть прежний buildHomeSchemas и убрать новые файлы и зависимость parse5 с соответствующими изменениями lockfile. Миграций нет, откат базы не нужен. Не затрагивать сторонние изменения в рабочем дереве.

Ничего не закоммичено, не отправлено в main и не выложено на сайт.
