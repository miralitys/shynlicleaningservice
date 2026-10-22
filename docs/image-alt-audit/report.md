# Alt-тексты изображений: проверка и результат

Дата: 21 октября 2026, America/Chicago. Исходная версия выложена в 63e658f4; уточнение For и цифр ниже подготовлено локально, без нового деплоя.

## Уточнение For и цифр

- `move-clean-original-26.svg` содержит только слово For. Оно повторяет смысл соседнего HTML-заголовка Is Move Cleaning Right for You?, поэтому изображение декоративное: `alt="" aria-hidden="true"`. То же правило применено к идентичному For на рекламных копиях.
- SVG цифр на /pricing и /pricing-v2 содержат только 5, 1, 4, без дополнительных слов. Эти цифры не повторяются в соседнем HTML-тексте. По условию сохранён весь текст изображений: `alt="5"`, `alt="1"`, `alt="4"`, без aria-hidden.
- Новая проверка реальных страниц закрепляет оба случая. Целевой набор после уточнения: 64 проверки пройдены, 0 ошибок. Полный набор 766 проверок ниже относится к исходной версии до этого уточнения.

## Результат обхода

| Проверка | Результат |
| --- | --- |
| URL из sitemap | 300 |
| Всего тегов img в sitemap | 818 |
| Непустой alt | 722 |
| Пустой alt, только декоративные изображения | 96 |
| Изображений без атрибута alt | 0 |
| Пустых alt без aria-hidden=true | 0 |
| Дополнительная проверка, включая рекламные страницы | 318 URL / 972 изображения |
| Страниц блога без изменений | 233 / 466 изображений |
| Просмотрено уникальных файлов вне блога | 97 |

Все 96 пустых alt принадлежат проверенным декоративным изображениям и имеют `aria-hidden="true"`. Пустой alt здесь правильный: скринридеру не нужно повторять названия звёздочек, телефонных и календарных иконок рядом с уже написанным текстом.

Исходный HTML имел 619 непустых alt и 199 пустых. Из последних 157 записаны как `alt=""`, 42 как `alt=''`. Парсер не обнаружил отсутствующих атрибутов: число 42 из исходного аудита совпадает с количеством атрибутов в одинарных кавычках. В отчёте они не считаются отсутствующими.

## Что изменено

- Для смысловых иллюстраций и фотографий добавлены короткие описания на английском.
- Существующие хорошие alt сохранены, включая фотографии команды и иллюстрации услуг на главной.
- Для текстовых значков alt повторяет текст: Local team, Safe products, High quality; для изображённых цифр — соответствующую цифру.
- Логотипы вне блога названы Shynli Cleaning Service. Маленький повторный знак рядом с уже написанным брендом на юридических страницах оставлен декоративным.
- На страницах городов домик около формы получает город из данных страницы, например: House with red porch chairs for a quote in Naperville. На Aurora не подставляется Naperville.
- Телефонные, почтовые, календарные, командные и прочие вспомогательные иконки не получают выдуманных SEO-описаний.
- Иллюстрации комнат названы иллюстрациями, а не фотографиями якобы выполненной уборки.
- Для ссылки с одной картинкой предусмотрен alt действия, например Get a free quote.
- Блог целиком исключён из преобразования.

## Полная инвентаризация

- [assets.csv](assets.csv): один список 97 уникальных файлов, все страницы использования, роль, описание просмотренного изображения и итоговые варианты alt.
- [inventory.json](inventory.json): те же данные в структурированном виде, включая исходные alt и причины декоративности.
- [images.csv](images.csv): все 972 вхождения img на 318 проверенных страницах, до/после и признак нахождения страницы в sitemap.

Файлы действительно просмотрены: SVG и растровые изображения отрисованы в контактных листах, а не классифицированы по имени.

Контактные листы:
- [Файлы 0–19](../../output/playwright/image-alt-audit/assets-00.png)
- [Файлы 20–39](../../output/playwright/image-alt-audit/assets-20.png)
- [Файлы 40–59](../../output/playwright/image-alt-audit/assets-40.png)
- [Файлы 60–79](../../output/playwright/image-alt-audit/assets-60.png)
- [Файлы 80–96](../../output/playwright/image-alt-audit/assets-80.png)

Контактные листы — локальные проверочные артефакты. Исходные файлы изображений не изменялись.

## Почему оставлены пустые alt

| Назначение изображения | Количество в sitemap |
| --- | --- |
| Calendar icon beside scheduling text | 4 |
| House-shaped brand ornament beside section text | 1 |
| People icon beside team text | 3 |
| Four-point star ornament | 6 |
| Phone icon next to contact text | 3 |
| House-shaped brand ornament inside the city hero statement | 51 |
| Phone icon next to the written phone number | 2 |
| Envelope icon next to the written email address | 2 |
| Four-point star beside an FAQ category title | 1 |
| Calendar icon beside an FAQ category title | 1 |
| Payment card icon beside an FAQ category title | 1 |
| People icon beside an FAQ category title | 1 |
| Burgundy four-point star ornament | 4 |
| House-shaped brand ornament beside pricing text | 1 |
| Calendar icon beside a pricing explanation | 3 |
| Vacuum cleaner icon beside a service explanation | 1 |
| Dotted outline used as a background shape | 1 |
| People icon beside a service explanation | 1 |
| Check mark beside an existing text label | 2 |
| Eye icon beside text about attention to detail | 1 |
| Magnifying glass beside text about inspection expectations | 1 |
| Phone icon beside written contact details | 1 |
| Small blurred brand mark beside the written company name | 3 |
| Decorative For lettering beside the existing Is Move Cleaning Right for You heading | 1 |

## Проверки границ изменений

На **всех 318 страницах**, а не только четырёх образцах, выполнено побайтное сравнение HTML после исключения `alt`, `aria-hidden` и `role` исключительно у тегов img: различий нет. В реализации role не менялся, изменены только alt и, для декора, aria-hidden.

Отдельно проверены:
- исходные блоки JSON-LD: все 678 совпадают побайтно;
- весь HTML 233 страниц блога: совпадает побайтно;
- robots.txt и sitemap.xml: совпадают побайтно;
- CSS, тексты, ссылки, src/srcset, размеры и загрузка картинок, формы, скрипты, калькулятор и остальные атрибуты: не менялись;
- в реальном локальном браузере после выполнения JavaScript проверены /, /pricing, /about-us, /services/deep-cleaning, /services/move-in-move-out-cleaning, /naperville: нигде нет отсутствующих alt или пустых alt без aria-hidden=true.

Повтор одного и того же изображения в существующем шаблоне не удалялся: например, исходный и адаптивный блоки могут использовать один файл комнаты. Названия разных комнат различаются. Одинаковое название бренда у шапки и подвала намеренно сохраняется.

## Тесты

- `node --test test/site-image-alts.test.js test/server-smoke.test.js`: **63 пройдено, 0 ошибок**.
- `node --test`: **766 пройдено, 0 ошибок, 0 пропусков**.
- `git diff --check`: без ошибок.

## Изменённые файлы

- `lib/site/image-alt-rules.json`: проверенные описания и назначение 97 файлов.
- `lib/site/image-alts.js`: адресные изменения атрибутов по позициям HTML-парсера, без пересборки HTML.
- `lib/site/sanitize.js`: применение правил после формирования JSON-LD.
- `test/site-image-alts.test.js`: проверки декора, логотипов, функциональных ссылок, городов, блога и обход всех URL sitemap.
- `docs/image-alt-audit/`: инвентаризация и этот отчёт.

Новых зависимостей нет: используется уже установленный parse5. Изменения в базе не выполнялись. Посторонний локальный файл test/admin-route-client-order-prefill.test.js и прежние отчёты деплоя не менялись.

Предпросмотр: http://127.0.0.1:50024/pricing

## Итоговые alt по страницам

Ниже перечислены все недекоративные img на шести страницах из ТЗ. Полные списки, включая декор, есть в images.csv.

## /

| Файл | Роль | Итоговый alt |
| --- | --- | --- |
| `/images/shynli-logo-primary.png` | logo | Shynli Cleaning Service |
| `/images/home-copy-team-960.webp` | content | Shynli Cleaning team |
| `/images/home-copy-service-regular-640.webp` | content | Regular house cleaning illustration |
| `/images/home-copy-service-deep-640.webp` | content | Deep cleaning illustration |
| `/images/home-copy-service-move-640.webp` | content | Move cleaning illustration |
| `/images/home-copy-service-airbnb-640.webp` | content | Airbnb cleaning illustration |
| `/images/home-copy-service-commercial-640.webp` | content | Commercial cleaning illustration |
| `/images/home-copy-service-post-construction-640.webp` | content | Post-construction cleaning illustration |
| `/images/home-copy-cta-house.w640.webp` | content | Clean home illustration |
| `/images/shynli-footer-logo-light.png` | logo | Shynli Cleaning Service |

## /pricing

| Файл | Роль | Итоговый alt |
| --- | --- | --- |
| `/images/shynli-logo-primary.png` | logo | Shynli Cleaning Service |
| `/images/tild3364-3839-4665-b832-356539643234__5.svg` | badge | 5 |
| `/images/tild3437-6364-4734-b431-396533323234__1.svg` | badge | 1 |
| `/images/tild3261-6630-4232-a337-303332313661__4.svg` | badge | 4 |
| `/images/shynli-footer-logo-light.png` | logo | Shynli Cleaning Service |

## /about-us

| Файл | Роль | Итоговый alt |
| --- | --- | --- |
| `/images/shynli-logo-primary.png` | logo | Shynli Cleaning Service |
| `/images/about-clean-logo.png` | logo | Shynli Cleaning Service |
| `/images/about-copy-asset-010.png` | badge | Local team |
| `/images/about-copy-asset-013.png` | badge | Safe products |
| `/images/about-copy-asset-037.png` | badge | High quality |
| `/images/about-copy-asset-015.svg` | content | Street map of communities in the western Chicago suburbs |
| `/images/shynli-footer-logo-light.png` | logo | Shynli Cleaning Service |

## /services/deep-cleaning

| Файл | Роль | Итоговый alt |
| --- | --- | --- |
| `/images/shynli-logo-primary.png` | logo | Shynli Cleaning Service |
| `/images/tild3237-3730-4638-a162-393866363766__group_195_1.png` | content | Shynli cleaners wiping a bathroom mirror and kitchen counters |
| `/images/tild3437-3538-4663-a566-353339336265__20251223_1600____rem.png` | content | Living room illustration with a sofa and wall-mounted television |
| `/images/tild6431-6233-4663-b431-643364613862__20251223_1600____rem.png` | content | Kitchen illustration with an island, cabinets, and breakfast stools |
| `/images/tild3432-6435-4564-b161-666132613636__20251223_1600____rem.png` | content | Bathroom illustration with a freestanding tub and double vanity |
| `/images/tild3039-6233-4634-a637-666331653162__20251223_1600____rem.png` | content | Bedroom illustration with a double bed and bedside tables |
| `/images/tild3666-6336-4430-a366-653932316138__shynli_cleaning_2_6.png` | content | Cleaners maintaining rooms inside an illustrated two-story home |
| `/images/tild6564-6130-4433-b762-666632643839__shynli_cleaning_2_4.png` | content | Cleaners preparing an empty home beside a moving truck |
| `/images/tild6534-6236-4866-a139-303331666239__shynli_cleaning_2_2.png` | content | Illustrated guest house with cleaners preparing bedrooms and living areas |
| `/images/tild3033-3264-4563-b138-303833303565__shynli_cleaning_2_1.png` | content | Cleaners tidying an illustrated office with desks and meeting rooms |
| `/images/tild3062-3735-4531-b066-343636303162__7bebd70c-9bfd-48ca-a.png` | content | Small house with red porch chairs and potted plants |
| `/images/shynli-footer-logo-light.png` | logo | Shynli Cleaning Service |

## /services/move-in-move-out-cleaning

| Файл | Роль | Итоговый alt |
| --- | --- | --- |
| `/images/shynli-logo-primary.png` | logo | Shynli Cleaning Service |
| `/images/move-clean-original-07.png` | badge | Local team |
| `/images/move-clean-original-17.png` | badge | Safe products |
| `/images/move-clean-original-09.png` | badge | High quality |
| `/images/shynli-move-area-bedroom.png` | content | Bedroom illustration with a double bed and bedside tables |
| `/images/shynli-move-area-bathroom.png` | content | Bathroom illustration with a freestanding tub and double vanity |
| `/images/shynli-move-area-kitchen.png` | content | Kitchen illustration with an island, cabinets, and breakfast stools |
| `/images/shynli-move-area-living-room.png` | content | Living room illustration with a sofa and wall-mounted television |
| `/images/shynli-move-area-living-room.png` | content | Living room illustration with a sofa and wall-mounted television |
| `/images/shynli-move-area-kitchen.png` | content | Kitchen illustration with an island, cabinets, and breakfast stools |
| `/images/shynli-move-area-bathroom.png` | content | Bathroom illustration with a freestanding tub and double vanity |
| `/images/shynli-move-area-bedroom.png` | content | Bedroom illustration with a double bed and bedside tables |
| `/images/shynli-footer-logo-light.png` | logo | Shynli Cleaning Service |

## /naperville

| Файл | Роль | Итоговый alt |
| --- | --- | --- |
| `/images/shynli-logo-primary.png` | logo | Shynli Cleaning Service |
| `/images/shynli-quote-house.png` | content | House with red porch chairs for a quote in Naperville |
| `/images/shynli-footer-logo-light.png` | logo | Shynli Cleaning Service |
