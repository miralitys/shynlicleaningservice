# Naperville: Второй Проход По Тексту

22 октября 2026, Chicago. Второй проход подготовлен к разрешённому пользователем деплою. Превью: http://127.0.0.1:58250/naperville. Итог живой проверки после публикации записывается отдельным deployment-отчётом.

## Объём

| Подсчёт | До | После |
| --- | ---: | ---: |
| Текст основного body, включая раскрываемые ответы FAQ и отзывы | 1115 | 1382 |
| Тот же текст с закрытыми ответами FAQ | 1035 | 1302 |

Основной подсчёт использует одинаковый метод до и после: текст внутри main, без header/footer, меню, скриптов, стилей, SVG и aria-hidden декора. Ответы раскрываемых FAQ входят в первую строку. Горизонтально прокручиваемые отзывы считаются полностью. Фактический исходный объём составил 1115 слов, а не приблизительные 1150; новый вариант превышает обе величины даже при закрытых FAQ.

## Повторы

Посчитаны не только буквальные совпадения, но и варианты формулировок, например most frequently booked, booking order и third most booked. Это вхождения смысловых формулировок, не заявления о статистике поисковых систем.

| Факт | Весь body до → после | Вне FAQ до → после |
| --- | ---: | ---: |
| Популярность / порядок бронирования услуг | 6 → 2 | 5 → 1 |
| DuPage and Will counties | 5 → 1 | 5 → 1 |
| Cleaning supplies and equipment | 4 → 2 | 3 → 1 |
| Вопрос о парковке | 4 → 2 | 3 → 1 |
| Перечисление типов жилья | 7 → 3 | 5 → 1 |
| Типичный дом, три спальни и 2.5 санузла | 3 → 1 | 3 → 1 |

FAQ оставлен буквально прежним. Поэтому про типы жилья остаются вопрос и его ответ, а про популярность, инвентарь и парковку остаётся по одному ответу. Вне FAQ каждый факт встречается ровно один раз. Конкретные параметры жилья находятся в Homes We Clean, география в строке возле начала страницы, инвентарь и парковка в практическом блоке.

## Карточки Услуг

### Deep Cleaning

A reset for homes that have not been professionally cleaned in months, or before starting recurring service. The work includes detailed dusting, hand-wiped baseboards and door frames, kitchen degreasing, and close attention to bathroom tile and grout.

### Regular House Cleaning

Ongoing help for busy households that want the kitchen, bathrooms, and floors maintained between visits. Each appointment covers light dusting, vacuuming and mopping, appliance exteriors, the inside of the microwave, bathroom fixtures, and trash removal.

### Move-In / Move-Out Cleaning

For renters, buyers, and property managers preparing a home for its next occupant or a final walkthrough. Work includes floors, closets, interior doors, and kitchen appliance interiors, with inside cabinets and drawers cleaned when empty.

Все три ссылки Learn more сохранены с прежними адресами.

## What Matters For Cleaning In Naperville

Три прежние иконки и их оформление сохранены. Подписи: Prepare the rooms; Arrange entry in advance; Confirm the visit length.

We bring all cleaning supplies and equipment. Before the first cleaning, we ask where our cleaners can park. Clear counters and floor space, put valuables away, and secure pets if they are anxious around vacuums or open doors. You do not need to stay home if you provide access instructions. Allow roughly 2 to 4 hours for regular cleaning or 4 to 6 for a deep clean. These are guide ranges, not a fixed appointment length. We confirm estimated timing before the visit based on your home's size, condition, and booked services.

Это ориентиры со страницы услуг, не новая гарантия длительности. Предложение о Lake Michigan / DuPage Water Commission удалено.

## Источники Фактов

- [Deep Cleaning](https://shynlicleaningservice.com/services/deep-cleaning): кому подходит, состав работ, ориентиры regular 2–4 / deep 4–6 часов в сравнении услуг.
- [Regular Cleaning](https://shynlicleaningservice.com/services/regular-cleaning): состав регулярной уборки и отдельные выбранные дополнения.
- [Move-In / Move-Out](https://shynlicleaningservice.com/services/move-in-move-out-cleaning): типичные заказчики, пустые шкафы, состав работ, уборка до заселения и после вывоза вещей.
- [FAQ](https://shynlicleaningservice.com/faq): инструкции доступа, отсутствие необходимости оставаться дома, подтверждение времени, факторы цены, постоянный клинер при возможности.
- [Подготовка к визиту](https://shynlicleaningservice.com/blog/whats-included/what-to-do-before-a-cleaning-service-arrives): открытые поверхности, вещи на полу, питомцы, ценности, свежие простыни по запросу, приоритетные комнаты и отсутствие необходимости предварительно отмывать дом.
- Параметры местного жилья, ZIP, парковка и инвентарь сохранены из ранее утверждённого текста Naperville. Новых цен, районов, гарантий, включений или ограничений размера дома не добавлено.

Страницы-источники прочитаны, но не изменены.

## Отзывы И Мелкие Правки

- Счётчик 58 Google reviews сохранён.
- `5/5` сохранён по последнему прямому указанию пользователя, подтвердившего оценку 22 октября.
- Карточка MaryLouise O. без письменного текста не выводится. Исходный файл отзывов не изменялся.
- Сначала Amy K., Erika B., Eric J., затем остальные. Все 23 оставшихся текста сохранены посимвольно. Фраза look no further осталась только в подлинной цитате Eric J., которую пользователь запретил редактировать.
- Отдельная подпись ZIP code убрана; поле поиска не удалено и сохраняет доступное имя через aria-label. Поиск 60540 проверен в браузере и возвращает Naperville.
- Удалён один скрытый дублирующий H2 Choose your city из старого локального диалога. Сам диалог, ссылки и навигация сохранены; aria-label заменяет ссылку на удалённый заголовок. Основной общий заголовок диалога остался.

## Проверка Изоляции

- Title, meta description, H1, canonical, robots, header/footer, FAQ, quote form, nearby links, все CSS и все script-блоки Naperville совпали с живой исходной страницей буквально. JSON-LD разбирается; FAQPage не менялся.
- Пустой diff у Plainfield, Aurora и Bolingbrook. Также без изменений главная, pricing, quote, FAQ, три страницы услуг и использованная статья блога: всего 11 контрольных страниц вне Naperville.
- robots.txt и URL sitemap сохранены. Для новой редакции Naperville дата публикации установлена на 22 октября; даты остальных страниц не меняются. Предыдущий локальный снимок verification.json предшествует установке даты релиза.
- Сходство пятисловных шинглов с заменой городских названий: Plainfield 4.45%, Aurora 4.46%, Bolingbrook 4.46%.
- 116 профильных проверок публичных страниц прошли. Финальный набор из пяти проверок Naperville также прошёл после возвращения рейтинга.
- Полный параллельный прогон был остановлен после тайм-аутов startup_ready в несвязанных тестах серверных маршрутов. Четыре таких теста (калькулятор, дашборд, policy email и SMS) прошли отдельным последовательным запуском. Полный зелёный прогон всех тестов этой итерацией не заявляется.
- Браузер удалось восстановить после смены идентификаторов подключений. На десктопе и узком экране проверены карточки, иконки и размещение текста. В измерениях нет пересечений карточек и нет текста за пределами карточек. На мобильном экране ширина документа совпадает с viewport; отступ кнопок 24px, на десктопе 28px. CSS не менялся.

## Файлы И Воспроизведение

- `lib/site/naperville-pilot.js`: текст только Naperville и две локальные правки лишних подписей.
- `lib/site/naperville-release.json`: дата новой редакции, 22 октября 2026.
- `test/naperville-pilot.test.js`: новая длина, повторы, неизменность цитат, доступность ZIP, один H2 и сохранение рейтинга.
- `scripts/audit-naperville-second-pass.js`: одинаковый подсчёт до/после и проверка защищённых блоков.
- `docs/naperville-second-pass/verification.json`: машинный отчёт.
- Снимок исходного сайта: `/tmp/shynli-naperville-second-pass-before`.
- Логи: `/tmp/shynli-naperville-second-pass-public-tests.log`, `/tmp/shynli-naperville-second-pass-final-tests.log`, `/tmp/shynli-naperville-second-pass-timeout-recheck.log`.

```sh
node scripts/audit-naperville-second-pass.js after http://127.0.0.1:58250 /tmp/shynli-naperville-second-pass-before
```

Клиенты, заказы, калькулятор и база не меняются. Чужие локальные изменения не затронуты и в релиз не включаются.
