# Overhaul: фактическая готовность и кросс-проверка внешнего аудита

Дата: 2026-10-15. Проверяемая версия: `a5a4d16bb55976aaa6a88727396c9ca54cc9d680`, ветка `overhaul/s0-drive-id-browse`, PR #5. Это анализ существующей реализации, не заявление об исправлении перечисленных ниже дефектов. Production-код в ходе этой проверки не менялся.

Внешний документ: пользовательский `audit-report-vault-sync.md` (C1–C2, M1–M16, m1–m53). Предложения документа оценивались как предложения, а не как инструкции к автоматическому исполнению.

## 1. Главный вывод

Ощущение незавершённости обосновано. Реализован существенный защитный фундамент и переходное разделение по заданиям, но полный overhaul ещё не получен. Ни один из этапов S0–S6 нельзя закрыть целиком по его сквозным критериям. Называть систему «полностью overhauled» некорректно. Предыдущие краткие сообщения могли создавать более широкое впечатление готовности, чем позволяют факты.

Точный процент завершения не установлен: 87 сценариев A01–A87 имеют разный вес, часть покрыта только частично, а число тестов не измеряет долю реализованных требований. Ранее прошедшие 534 теста проверяют имеющиеся контракты; новые отрицательные воспроизведения показывают пробелы в самих контрактах и их соединении.

Внешний аудит полезен, но неоднороден. Некоторые его Major подтверждаются экспериментально; часть Minor затрагивает более серьёзную логику. Напротив, обе Critical относятся к неисполняемым в текущем bundle дубликатам и не доказывают активный критический дефект. Таблица «10 из 12 инвариантов соблюдены» слишком оптимистична.

## 2. Метод и пределы проверки

- Проверены код текущего HEAD, спецификации `docs/overhaul-vnext`, предыдущие архитектурные probes и внешний аудит.
- Выполнены 15 целевых инструментированных проверок на реальных классах с существующими fake Drive/FS/host fixtures. Это не 15 обнаруженных багов: среди проверок есть опровержение и уточнение внешнего вывода.
- Повторная production-сборка с теми же параметрами esbuild побайтно совпала с существующим `main.js`. Через metafile проверена достижимость спорных модулей.
- Проверен состав ранее выданного полного ZIP: 191 файл, есть package.json, esbuild-конфиг и 32 файла внутри tests; manifest.json отсутствует. Внешний аудит описывает другой исходный набор (`clone.zip`, 140 файлов, без конфигурации/тестов). Поэтому его предположение о неизвестной сборке нельзя переносить на полный ZIP.
- Проверки Google OAuth, двух реальных vault, конкурентного стороннего Drive-клиента, мобильного Obsidian и установки с нуля здесь не проводились. Сетевые сбои воспроизводились подставными транспортами. Полный suite 534 тестов в рамках этой аналитической проверки заново не запускался; это результат предыдущего этапа.
- Для составных Minor ниже отдельно отмечены подтверждённая часть и недоказанное следствие. Статическая возможность гонки не названа доказанным пользовательским сбоем, если текущий host её сериализует.

## 3. Что реализовано и что осталось

| Этап | Что реально есть | Что мешает считать этап завершённым |
|---|---|---|
| S0: безопасное наблюдение, Drive lineage | Raw browse по ID; отображение дубликатов/неподдерживаемых объектов; stable proposals; отдельные receipts; canonical unknown; tombstones; ограниченный same-ID restore; v3 writer fence | Execution collision до окончательного применения политики; нет полного ID-based binding/exclusions; нет полного proposal/artifact inbox и набора действий; обычная io-ошибка прерывает независимые файлы |
| S1: политика и владение | Переходные JobPolicy/claims, разделение наблюдений, защита занятых целей | Нет законченного единого compiler для run/preview/control; стабильной pair identity и reconciliation; settings writer fence; профиль remote конфликтует с incoming |
| S2: per-job runtime | JobBatch, job results/events, отдельные расписания, startup/retry/finishing состояния, карточки заданий | Общий session admission, cache, queue и ledger; applyChain охватывает весь transfer; нет persistent JobManager/AccountContext; отмена теряется; auth block не имеет законченного lifecycle |
| S3: tree/preview/решения | Raw tree и source picker, job cards, часть inbox и recovery UI | UI/control/preview используют разные пути; нет единого immutable plan и полного сквозного разрешения collision/unknown/proposals; rerender теряет состояние controls |
| S4: persistence/migration/GC | Проверяемые checkpoints/backups, bounded compaction, защитные остановки, scoped recovery, сохранение ссылок на recovery | Нет verified per-job migration, полного pin/lease-aware GC, retirement namespace, восстановления пользовательского журнала из durable events, полного rollback/upgrade acceptance |
| S5: скорость | Нет checkpoint write на неизменённых Drive baseline; ограниченная параллельность наблюдений; индексированные claims | Нет Changes API, полного staging/streaming и общего account quota budget; cold updates сохраняют полный checkpoint; transfer jobs последовательны; нет реальных 1k/10k benchmarks |
| S6: поставка и приёмка | Собираемый main.js, styles, исходники, MIT notice, fixture-тесты | Нет manifest.json и проверенной установки с нуля; нет реальных OAuth/двух vault/foreign-client/mobile/upgrade/rollback acceptance |

**Двусторонний Drive сейчас ограниченный.** Создание новых объектов, защищённые операции корзины, получение/публикация конфликтных артефактов и сохранение lineage не равны произвольному безопасному обновлению существующего файла. Existing-ID overwrite намеренно закрыт до проверки конкурентных записей. Это соответствует принятому пользователем ограничению «сохранять ID; спорные записи пока конфликтными копиями» и должно явно показываться в capability/UI. Считать это полной функциональной эквивалентностью Sync Engine нельзя.

## 4. Исходные жалобы: закрыты ли они

| Жалоба | Состояние |
|---|---|
| «Только при запуске», но UI показывает off | Расписание теперь отделено от активности цикла; startup/retry/finishing отображаются. Базовый дефект адресован. Но отмена, устаревший auth block и неполная continuation-модель всё ещё могут давать неверное или застрявшее состояние. Нужна сквозная desktop-проверка именно этого режима |
| Конфликт останавливает синхронизацию | Другой источник в общем batch может продолжить. Внутри Drive одна path collision всё ещё блокирует независимые файлы; generic io также обрывает Drive-loop. Не закрыто |
| После дозагрузки нет завершающего прохода | Есть bounded finishing (до двух проходов) и retries (до четырёх; startup retry window 30 минут). Но они зависят от корректного outcome/retryability. Отмена→null и остановка на io ломают этот контракт. Частично |
| Drive path collision уже при открытии дерева | Raw browse отделён от строгого execution manifest; дубликаты можно увидеть. Execution и часть legacy/control путей остаются строгими. Исходный конкретный инцидент по одному описанию пути не установлен; тесты похожих случаев не доказывают устранение именно его причины |
| Бесконечные OAuth «ожидание» | Добавлены ограничения ожидания/отмена в локальном flow; сетевую недоступность accounts.google.ru это не устраняет. Нужен реальный повтор в браузере и проверка, что plugin завершает ожидание с понятным retry/cancel |
| Копятся checkpoint и .previous | Compaction существует; утверждение «вообще нет очистки» неверно для текущего HEAD. Но pin-aware retention, retired namespaces, quarantines, proposals/recovery и переход старых данных не закрыты целиком. Проблему накопления нельзя считать устранённой |

## 5. Новые воспроизведения и их значение

Результаты относятся к указанному HEAD. Fixture — способ контролировать отказ; production-классы не заменены копиями алгоритма. Там, где подменён host seam, это оговорено.

| № | Проверка | Наблюдаемый результат | Вывод |
|---|---|---|---|
| 1 | Drive: два ID на a.md плюс independent.md; рядом Git | Git/b.md загружен; independent.md отсутствует; Drive failed/path-collision | Per-job изоляция помогает между источниками, но не внутри одного Drive |
| 2 | Реальные runSession/runAutoSession; prepare Drive удержан promise, execution stub | Git accepted=false, пока Drive занимает session; после освобождения accepted=true | Автоматические задания всё ещё имеют общий admission lock, даже на стадии наблюдения |
| 3 | runOwnedSession seam моделирует abort→null | accepted=false, cancelled=false, retryScheduled=true; controller уже очищен | Отмена до execution теряет семантику и превращается в повтор |
| 4 | auth-required, затем принудительно переданный успешный auto-result | autoJobBlocks сохраняет запись | Удаление блокировки не связано с успешным результатом. В обычном scheduler второй запуск вообще может быть не допущен; probe не утверждает обратного |
| 5 | FileJournal.append удержан на read; затем clear | Сразу после clear 0 записей, после завершения append снова [новая, старая] | Очистка журнала гоняется с append и воскрешает историю |
| 6 | Оба job наблюдены; apply Drive удержан | Git apply не начался | applyChain сериализует не только commit, но и сетевые передачи. Это ограничение изоляции и скорости, а не основание убрать защиту writes |
| 7 | syncIssue на generic Error/TypeError | Internal state changed→local-changed; TypeError→io; Network directory service unavailable→path-collision | Классификация по тексту ошибочно определяет тип, scope и retryability |
| 8 | Новый ManifestCache: get(constructor), set(__proto__) | inherited значение вместо отсутствия; __proto__ не становится собственным перечисляемым entry | M2 подтверждён; исправление Drive dictionaries не было распространено на pull cache |
| 9 | 429 Retry-After=600, maxRateLimitWait=1 час | UI callback объявляет 600000 мс; запрос сразу отклонён wait-budget; retryAfterMs сохранён | M1 частично: UI/контракт ожидания расходится, но deferred retry metadata не теряется |
| 10 | Git sourceId для branch empty/default/main | empty=main, default отличается | M3 подтверждён как identity mismatch; последствия зависят от namespace/migration пути |
| 11 | Drive a.md download бросает generic io; b.md исправен | failed=1, b.md не загружен, issue scope=session/retryable=false | M4 подтверждён: независимая работа не завершается |
| 12 | Pull manifest с постоянно uppercase hash, два запуска | Первый download=1, второй=0, failed=0 | M6: бесконечная повторная загрузка только из-за стабильного uppercase не воспроизвелась |
| 13 | BufferedHostTransport: физический request не завершён после логического timeout | Первый RequestTimeoutError; второй не достигает underlying transport даже через три timeout windows | M10 подтверждён на модели транспорта. Ожидание gate не покрыто самостоятельным deadline |
| 14 | Реальный host.executeSync(manual), confirmSync=false | Git файл не загружен, но job outcome=success; aggregate outcome=ok | m19 серьёзнее отсутствующей записи журнала: появился ложный success в новом batch пути |
| 15 | ConflictResolver: local=LOCAL, remote=REMOTE, write=remote, strategy=incoming | Основной файл остаётся LOCAL; remote уходит в conflict copy; updateCache=true | m29 подтверждён: профиль enforce-source нарушает собственную семантику |

**Сборка:** `VamStatusModal.ts`, корневые `vam-bridge.ts`/`vam-guard.ts`, `src/ui/vault-tree-modal.ts`, `src/ui/policy-editor.ts` отсутствуют в графе bundle. Активные `src/ui/vam-status-modal.ts`, `src/vam/vam-bridge.ts`, `src/vam/vam-guard.ts` присутствуют. Из 112 входов сборки спорные дубли не являются production-входами. Одного `include: ["*.ts"]` в tsconfig недостаточно, чтобы попасть в bundle с единственной entrypoint main.ts.

## 6. Кросс-сравнение C1–C2 и M1–M16

Обозначения: «воспроизведено» — выполнен целевой probe; «код» — подтверждён путь в коде; «условно» — нужен определённый lifecycle/сервер/конкурентность; «вывод не подтверждён» не означает, что весь модуль корректен.

| ID | Вердикт | Поправка / принятое направление |
|---|---|---|
| C1 | Критичность опровергнута для текущего bundle | Старый 10-click soft-mode код существует в root-дубликате, но не исполняется в поставленной сборке. Удалить дубли и проверить live soft-mode отдельно. Нельзя называть найденным активный production backdoor на основании dead file |
| C2 | Dead code подтверждён, Critical не обоснован | VaultTreeModal/PolicyEditor cluster не входит в bundle. Удаление уменьшит расхождение и риск будущего возврата, но это не текущая причина зависания |
| M1 | Частично, воспроизведено | 120-секундный request budget конфликтует с callback «ожидать 10 минут». Retry hint сохраняется. Нужны typed deferred result и account cooldown; повышать inline ожидание до часа при общем session lock опасно |
| M2 | Подтверждено, воспроизведено | ManifestCache plain-object и inherited lookups. Map/null-prototype + own-property validation на всех read/write/load/migration путях. Не запрещать легальные имена файлов constructor/__proto__ вместо исправления словаря |
| M3 | Подтверждено, воспроизведено | Разные sourceId empty/main и default. Нужны canonical branch resolution + verified reconciliation. Массовое повторное скачивание у всех пользователей из одного sourceId сравнения не следует |
| M4 | Подтверждено, воспроизведено | Generic io эскалируется до session и break. Типизировать ошибки и их effect certainty; продолжать независимые files при доказанной локальности. Не переводить все неизвестные ошибки в continue, если результат записи/commit не установлен |
| M5 | Код, условная гонка | ZipUrlSource.ensureSession без singleflight допускает двойное создание session при параллельных callers. Текущая сериализация уменьшает достижимость, но не делает контракт безопасным. Нужны singleflight + dispose loser + identity fencing |
| M6 | Контрактная непоследовательность, следствие опровергнуто probe | API-key hash не всегда приводится к lowercase, но verify сравнивает без регистра; постоянно uppercase не вызывает eternal download. Меняющийся регистр между ответами способен дать ложное изменение. Нормализовать на входе |
| M7 | Код | folderId интерполируется без escape в API-key query. Проверять идентификатор и экранировать query. Это отдельный legacy API-key путь, не доказательство той же ошибки OAuth-клиента |
| M8 | Код, ограничение возможностей | 10×200 ограничивает папку 2000 entries. Сейчас это отказ при превышении, а не разрешённый неполный manifest. Нужны явный capability/диагностика и полноценная bounded pagination |
| M9 | Код | Resume не проверяет Content-Range/валидатор ресурса. Нужны точный offset/total, If-Range при доступности, безопасный restart. Неправильная сборка архива может быть отвергнута поздней проверкой; потеря пользовательских данных здесь не доказана |
| M10 | Подтверждено, воспроизведено | Физически зависший host request удерживает gate после logical timeout. Нужны deadline ожидания admission и bounded quarantine/orphan accounting. Просто отпускать gate на timeout нельзя: это разрешит неограниченные физические requests |
| M11 | Частично; отсутствие TTL само по себе не баг | Inventory snapshot намеренно стабилен внутри run. forceDispose optional в source contract; RoutedSource не имеет fallback dispose. Проверять run lifecycle/refresh boundaries. TTL посреди применения способен сделать plan/locator несогласованным |
| M12 | Код, архитектурный долг | Общая schema требует apiKey, OAuth ветка обходится специальной validation. Нужна discriminated schema authMode. Это не означает, что весь OAuth сейчас невалиден/неработоспособен |
| M13 | Качественно подтверждено, тяжесть завышена | Разрозненная локализация и dead keys — долг поддержки; точное число 45 здесь не пересчитывалось. «Последняя сессия» и «Журнал» не обязаны быть одним объектом/названием |
| M14 | Подтверждён предел модели | Live VAM — кооперативная защита, не security boundary против другого привилегированного плагина. Не путать с достижимостью C1. Нужна честная модель доверия, а не обещание локальной непреодолимой авторизации |
| M15 | Код | WebDAV XML проверяется после слишком большой сетевой буферизации. Задать metadata maxBytes на transport до чтения/накопления. Мобильный host сам может буферизовать до выдачи ответа — отдельное ограничение |
| M16 | Частично | API-key 403 quota classification по заголовкам ненадёжна; разбирать Google error reasons. Но утверждение о неподдерживаемом Retry-After HTTP-date для 429 неверно: общий NetLayer эту форму обрабатывает |

## 7. Кросс-сравнение m1–m53

Составная строка внешнего аудита не считается целиком доказанной, когда один её подпункт требует отдельных данных.

| ID | Вердикт и необходимая поправка |
|---|---|
| m1 | Код: visited не наполняется. При цикле только каталогов entries-limit вообще не поможет; нужен visited по стабильной remote identity, depth/observation budget и cancel |
| m2 | Код: ошибка подпапки выдаётся за недействительную public link. Разделить root failure и item/subtree unavailable; неизвестность не превращать в удаление |
| m3 | Код/условно: file ZIP delegate удерживает download href. Нужен bounded refresh после истечения URL с проверкой той же source identity |
| m4 | Код: английские hardcoded messages; исправлять через единый diagnostic/i18n contract |
| m5 | Статический путь: testConnection смешивает quota/rights/network и показывает raw branch. Нужны typed diagnostics и resolved branch; live GitHub quota здесь не проверялась |
| m6 | Код: обёртка rateLimitExceeded в Error теряет поля. Сохранять cause/status/retry hint. Не смешивать этот путь с M1, где metadata probe сохранилась |
| m7 | Составной пункт, частично: непроверенная форма tree и legacy URL parsing требуют fixtures на malformed/304/sub-path. Dead helper сам по себе runtime-багом не является |
| m8 | Условно: confirm=t и широкая Nextcloud-эвристика хрупки. Фраза «практически неработоспособен» требует live больших Drive ZIP. Предпочтительнее явные URL/provider adapters |
| m9 | Условно: повторное использование session не сверяет URL. Нормальный host пересоздаёт providers при подготовке; нужны revision/identity guards, а не утверждение о неизбежном использовании старого URL |
| m10 | Частично, код: переписывание message ухудшает диагностику; injected transport имеет собственный timeout contract. Dead throw/helper — cleanup. Повторные DAV self refs требуют parser fixture |
| m11 | Сервер-зависимо: некоторые DAV могут менять регистр href. Нельзя глобально casefold все URL — бывают законно case-sensitive серверы. Нужен capability/конкретный fixture IIS |
| m12 | Латентно: keepRevisionForever=true стоит в existing-file update. Текущий coordinator.upload вызывает create=true, existing-ID overwrite закрыт. Активное бесконечное накопление revisions этим путём не доказано; исправить до открытия gate |
| m13 | Условно: 8 MiB/page — защитный лимит, возможен отказ тяжёлой страницы. Нужны адаптивный pageSize и отличимая ошибка metadata budget, а не снятие лимита |
| m14 | Частично/не доказано: inspect перед download — intentional freshness guard, удалять ради скорости нельзя. Семантику пустого nextPageToken сверять с API; тихая неполнота в реальном ответе не воспроизведена |
| m15 | Код/условно: repeated listChildren на предков дорог; межклиентский duplicate-folder race возможен. Консервативная collision лучше произвольного выбора; нужны ID mapping, fresh reservations и reconciliation |
| m16 | Составной пункт: collision до direction/policy — реальный пробел. Новый JobBatch уже наблюдает отдельные источники; утверждение «все манифесты всегда последовательно» к нему неприменимо. Строгая exposedPath-проверка сама по себе не доказывает NFD-баг. Legacy aggregate kind/diagnostics требуют унификации |
| m17 | Воспроизведено: clear/append race. Поставить clear в тот же последовательный writer, добавить durable clear semantics при необходимости |
| m18 | Код: stale comment 50 vs 200; repeated stringify — bounded лишняя работа. Не равнозначно утрате журнала |
| m19 | Воспроизведено, приоритет повысить: confirm=false не только теряет cancellation journal, но превращается в success JobBatch. Возвращать explicit cancelled outcome, не null |
| m20 | Код: unsafe target и exists failure останавливают scan. Часть fail-closed оправданна. Продолжать только доказанно независимые ownership-группы, не считать unreadable path отсутствующим |
| m21 | Не доказан самостоятельный баг: circuit state может намеренно переживать run. Нужен конкретный stale epoch/scope сценарий, прежде чем объявлять lifetime неверным |
| m22 | Код/долг retention: full-mirror сохраняет conflict/recovery bytes. Это защитное сохранение, но нет завершённой пользовательской retention-политики. deleted может означать удаление исходного canonical path, а не физическое исчезновение всех bytes |
| m23 | Частично: rejected без retryAt требует внешнего wake и может остаться pending в startup-only. Не каждый reject означает отсутствие wake; stale retryAt после окна отдельно не воспроизведён. Нужен явный terminal/deferred/blocked contract |
| m24 | Код: plain add может стереть issue/failureKind/originPath. Сохранять structured diagnostics и key по job/pair/object. Неиспользуемый takeDue — cleanup |
| m25 | Контрактный риск: DurableMutations не имеет внутреннего mutex. Текущие applyChain/host ownership сериализуют нормальные вызовы. Гонка не доказана в текущем host; защита обязательна до расширения параллелизма |
| m26 | Частично: module recover бросает на blocked, но новый main выполняет scoped recovery по записи и ловит file issues; blanket «всё recovery останавливается» устарело. restoreCopy у host под withOwnership, поэтому заявленная гонка с sync не доказана. Legacy/control paths ещё нужны |
| m27 | Код: corrupt quarantine не покрыт обычным GC; tmp не защищён от другого процесса. Нельзя автоматически удалять quarantine как мусор до установления recovery/pin roots и правил retention |
| m28 | Латентный dead-path риск: auto-cleanup ветка и timestamp parser требуют исправления перед включением. Не доказано, что текущий пользовательский запуск уже удаляет все copies |
| m29 | Воспроизведено, приоритет повысить: remote + incoming сохраняет local. Нужна таблица совместимости profile/write/conflict и единый resolver, а не случайный override глобальной стратегией |
| m30 | Performance долг: full-buffer hashing/копирование памяти. Нет подтверждённого hash correctness бага. Нужны size budget и streaming там, где transport это допускает |
| m31 | Не доказано заявленное resource-leak следствие: expectedSize проверяется после arrayBuffer, тело уже потреблено. Отсутствие discard не равно открытому socket. Magic-byte retry — отдельный контракт содержимого/источника |
| m32 | Подтверждён doc drift: 2 GiB в комментарии vs 64 MiB в константе |
| m33 | Вывод «нарушена чистота» не подтверждён: profiles array используется как выход миграции; callers/tests ожидают его заполнения. Можно улучшить API возвратом compound result, но нельзя просто убрать mutation |
| m34 | Код/потенциал: wake-all без FIFO не гарантирует fairness. Starvation требует нагрузки; перед параллельными transfer нужны fair weighted permits |
| m35 | Код: throw из apply может потерять частичные stats. Нужен накопленный JobResult с effects/outcome/issue отдельно; часть host ошибок уже ловится и сохраняет pull stats, но общий контракт не закрыт |
| m36 | Подтверждён doc/config drift: TTL=0 против комментариев 5 минут. Это не безопасно исправлять только включением TTL — сначала M5, session identity, cancellation/dispose |
| m37 | Код/ограничение API: setSecret('') вместо deleteSecret, clientSecret installed app в settings, fingerprint lifecycle. Это не доказанная утечка refresh token; нужен честный storage contract и best-effort disposal |
| m38 | Код, осознанный safety tradeoff: userinfo при refresh проверяет account identity и добавляет точку отказа. Не убирать проверку; различать identity mismatch и временную недоступность endpoint, корректно retry |
| m39 | Условные lifecycle дефекты VAM: pollMs=0/timeout и pending callbacks требуют отдельного покрытия. Не переносить вывод на default конфигурацию без проверки её параметров |
| m40 | Код: regex prefix не полноценная URL validation; нужен URL parser и schema revision. Unknown fields могут быть совместимостью, их нельзя запрещать без migration contract |
| m41 | Legacy риск: djb2 32-bit. Routed namespace уже SHA-256. При 65k collision probability ближе к 39%, а не 50%; обычный vault не содержит столько источников. Не приоритетнее M3 reconciliation |
| m42 | Частично: pMap без signal продолжает traversal, но callbacks проверяют cancellation перед effects. Не доказано продолжение записей после cancel. debounce exceptions проверять на конкретных callers |
| m43 | Структурный cleanup дефект: sync throw http.request может оставить timer с TDZ reference. Нужны try/finally-safe initialization и probe invalid request/headers; реальный долгий timer здесь не ожидался |
| m44 | Код: workspace replaceChildren теряет раскрытые sections/focus. Стабильные keyed rows и сохранение UI state; отдельно от correctness pipeline |
| m45 | Код: role/button без keyboard handler. Добавить native button либо Enter/Space и focus semantics |
| m46 | Условно/низкий приоритет: неизвестный interval отвергается resolver; пустой p — rendering hygiene. Не доказан нормальный production путь с undefined schedule label |
| m47 | Не доказан общий дефект: HTTPS-only для Google links допустим. Накопление ошибок требует DOM-воспроизведения; ограничить/заменять актуальную ошибку полезно, но не заявлять проверенную утечку |
| m48 | Требует конкретизации: разная close/save семантика subclasses не автоматически ошибка. Нужны сценарии пользовательского ввода и единый документированный контракт |
| m49 | Код: close glyph без aria-label; accessibility fix |
| m50 | Подтверждён doc drift: фактически downloads перед deletions. Исправлять комментарии, не переставлять фазы по устаревшему описанию |
| m51 | Латентно: dead PolicyEditor не входит в bundle. Fixed-field clone опасен при возврате UI, но не текущая потеря новых полей в активной форме |
| m52 | Код/UX: select откатывает значение при busy; disabled и пояснение понятнее. Не функциональная порча конфигурации сама по себе |
| m53 | Контракт UX не определён: пробелы могут быть буквальной частью glob/path. Слепой trim меняет допустимые patterns; нужны явная обработка случайных пробелов/предупреждение и literal mode |

Положительные I1/I2: математическая корректность hash и хороший PKCE/loopback фундамент не оспариваются. Внешний набор «200 случайных векторов» не выдаётся за повторно выполненный нами; успешная fake OAuth-проверка не заменяет desktop login/refresh/cancel acceptance.

## 8. Переоценка инвариантов

| Инвариант | Честная оценка текущей версии |
|---|---|
| INV-01 owner | Есть transitional ownership checks. Полный lease/settings/pair reconciliation contract не завершён; безусловный green преждевременен |
| INV-02 единая политика | Частично: legacy control/preview и новый run различаются; m29 — конкретное семантическое нарушение |
| INV-03 intent до effect | Сильный реализованный фундамент. Не закрывает автоматически interprocess/parallel lifecycle и все provider operations |
| INV-04 baseline = applied | Есть guards и хорошие fixture checks; это не доказательство всех upgrade/profile сочетаний |
| INV-05 unknown ≠ deletion/success | Drive canonical unknown защищён. Если трактовать инвариант глобально, ложный success m19 не позволяет ставить безусловный green |
| INV-06 независимые items | Нарушен: M4, collision до policy, часть scan errors |
| INV-07 schedule/run/decision | Модель разделена, host cancellation/block lifecycle её нарушает. Частично |
| INV-08 upgrade не расширяет effects | Нет полного pair migration/reconciliation acceptance; M3 усиливает риск. Не закрыт |
| INV-09 GC не удаляет reachable | Реализованы conservative roots/проверки, но полный pin/lease/retired namespace протокол отсутствует. Green для всей target spec не установлен |
| INV-10 stale epoch | Есть guards; все settings/continuation/control/provider lifecycles ещё не сведены. Частично |
| INV-11 dictionary keys | Нарушен M2, хотя Drive-state часть исправлена |
| INV-12 нет ложного success | Нарушен непосредственно probe m19; плюс неполная статистика m35 и cancellation→null |

## 9. Системные пробелы, которые внешний аудит недооценил

1. **Два поколения pipeline сосуществуют.** Обычный JobBatch и legacy retry/force/control/preview не используют один observation→policy→plan→execute→result контракт. Исправление в одном пути не распространяется автоматически на остальные.
2. **Per-job пока не означает независимый runtime.** Общий session admission и общий applyChain; shared queue/cache/ledger; нет persistent runners и общего AccountContext с quota cooldown.
3. **Identity всё ещё привязана к конфигурации шире, чем pair.** `driveNamespace` включает legacy folder mappings всего policy. Изменение постороннего mapping способно сменить Drive namespace. Без reconciliation это даёт новую историю/оставленные generations, даже если удалённая пара не менялась.
4. **Статус ошибки управляет поведением через ненадёжный текст.** Regex classifier может сделать внутренний TypeError обычным io или ошибку сервиса path-collision; затем scope/retry/block решения становятся неверными.
5. **Безопасно остановиться — ещё не законченный UX.** Сохранённые unknown/tombstone/proposal должны иметь понятные, guarded действия: retry/probe/acknowledge/decline/rebind/detach/publish-new. Часть действий пока отсутствует; пользователь остаётся в blocker без полноценного выхода.
6. **Metadata retention и пользовательский журнал — разные системы.** Checkpoint/manifest previous/recovery — не просто строки UI-журнала. Очистка одного не должна уничтожать recovery другого; нужна отдельная политика и отображение занятого места/причины удержания.
7. **Скорость требует архитектурной работы.** Zero warm writes — реальное улучшение, но cold updates/full checkpoints, repeated inspection, buffered bodies и сериализация transfer не дают оснований обещать скорость Sync Engine.

## 10. Порядок завершения работ

### Волна 1 — правильность результата и поведения (до расширения параллелизма)

- Explicit RunResult/JobResult: cancelled, rejected, deferred, blocked, partial, success; убрать семантический null. Сохранить результаты завершённых effects при любом позднем throw.
- Исправить m19, cancellation→retry, stale auth block и contracts wake/reauthorize/schedule generation.
- Исправить ManifestCache dictionary semantics и full load/flush/migration roundtrip special names.
- Ввести typed provider/storage/commit errors. Различать file-local failure, source outage, shared store failure и unknown effect result; продолжать только независимые безопасные items.
- Исправить precedence remote/incoming и закрепить profile × local/remote state × deletion/conflict таблицу.
- Сериализовать journal clear/append; не показывать success без завершённого результата.

Приёмка: после a.md file-local failure b.md загружается; отмена не запускает новые retries; declined confirmation не success; reauth снимает только относящийся к ней blocker; remote действительно устанавливает remote с сохранением local recovery.

### Волна 2 — единый execution/preview/control и полноценные решения

- Один immutable observation/compiled policy/plan для run, retry, force, scan, tree preview и inbox actions.
- ID anchors, object-specific exclusions и collision после policy/ownership projection; блокировать только доказанно конфликтующую группу.
- Завершить actions unknown/proposal/artifact; каждый action повторно проверяет ID/revision/ownership/local state, не выполняет решение по устаревшему UI.
- Устранить M5/M9/M10/M15 и quota classification; ввести deadline admission/physical-request accounting.

Приёмка: excluded duplicate не блокирует unrelated subtree; tree/preview/run согласны о targets/effects; lost response и stale decision не теряют данные; mobile logical timeout не оставляет следующий job в безграничном ожидании.

### Волна 3 — настоящая per-job persistence и безопасная очистка

- Стабильный pairId, verified migration/reconciliation, settings fence; смена постороннего source не меняет Drive lineage.
- Persistent JobManager и AccountContext; per-job queues/stores, общий account budget; подготовка/transfer независимых jobs вне общего session lock. Commit/reservations сохраняют защиту от пересекающихся targets.
- Pin/lease registry, active/retired/quarantine namespaces, verified GC и объяснимый retention. Не удалять *.previous/checkpoint-* по glob/возрасту без анализа достижимости.
- Согласованный durable journal и восстановление статистики после crash.

Приёмка: crash/restart/migration без bootstrap overwrite; cleanup сохраняет все reachable recovery/proposal refs и ограничивает освобождаемые generations; slow Drive не задерживает готовый Git на unrelated targets.

### Волна 4 — скорость, упаковка, реальные сценарии

- Changes API/checkpoints, staging/streaming, bounded memory и 1k/10k benchmarks.
- Manifest/install/update packaging; удалить dead VAM/tree cluster; локализация и accessibility.
- Desktop OAuth timeout/cancel/reauth, два vault, сторонний Drive клиент, delete/edit/rename, permission loss, mobile capability limits, upgrade/rollback.
- Existing-ID overwrite открывать только после отдельно доказанного race contract; до этого сохранить принятое ограничение конфликтными копиями.

**Не принимать как доказательство завершения:** количество файлов, закрытых мелких находок или зелёных тестов. Закрывать нужно пользовательские сквозные сценарии с проверенными effects, outcome, recovery, UI и повторным запуском.

## 11. Основные места в проверяемом коде

Все ссылки ниже закреплены на анализируемом commit, а не на подвижной ветке.

- [JobBatch: applyChain и обработка throw](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/job-runtime.ts#L43)
- [Host: observation, scoped recovery и обработка pull result](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/main.ts#L1868)
- [Host: автоматические задания и общий admission](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/main.ts#L2074)
- [Host: runAutoSession, blocks и follow-up](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/main.ts#L2132)
- [Drive: io escalation](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/drive-coordinator.ts#L138)
- [ManifestCache dictionary](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/manifest-cache.ts#L93)
- [ConflictResolver remote/incoming](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/conflict.ts#L284)
- [Journal append/clear](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/journal.ts#L231)
- [Drive namespace](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/drive-state.ts#L10)
- [OperationStore compaction](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/operation-store.ts#L343)
- [Host transport](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/adapters/host-transport.ts)
- [Фактический ранее опубликованный статус](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/docs/overhaul-vnext/implementation-status.md)
- [Полная спецификация](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/docs/overhaul-vnext/README.md)
