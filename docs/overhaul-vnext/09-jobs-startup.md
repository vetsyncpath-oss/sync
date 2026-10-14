# S1a/S2a: независимые задания, общая authority и startup cycle

Дата: 2026-10-14, Europe/Moscow. Реализованный переходный контракт сборки `overhaul-jobs-startup-2026-10-14`. Дополняет [S0c lifecycle](08-s0c-lifecycle.md); полный [runtime target](02-runtime.md) остаётся отдельным контрактом.

## Область реализации

Обычный запуск получает по одному execution context на сохранённое подключение. Inventory наблюдается независимо, до двух источников одновременно; готовый job может перейти к apply до завершения медленного независимого observer. Записи последовательно проходят через общий `OperationStore`/`DurableMutations`. Cache, очередь ошибок и recovery backend остаются общими: их ссылки не подменяются между заданиями. Это S1a/S2a, а не завершение всех S1/S2/S4 gates.

`RoutedSource.executionView` удерживает immutable manifest выбранного job и собственные locators. Все правила ownership остаются полными: невыбранный, не настроенный или упавший источник не отдаёт свои пути default source. Настроенное подключение, provider которого не удалось создать, получает failed observer с прежним ID/descriptor. Несуществующий assigned ID остаётся ошибкой конфигурации.

Legacy preview и явные Drive control actions сохраняют строгий combined adapter. Полное targeted inbox/decision dispatch требует следующего участка; обычные manual/auto/retry/scan/force используют independent batch. Вопросы manual-run предъявляются после завершения независимых файлов всех выбранных jobs; auto-run не открывает вопросы.

## Admission и владение

`JobPolicy` компилируется из полных текущих settings и readonly discovery всех retained Drive namespaces. Ownership определяется final local path. Historical baselines, inbox, tombstones, pending effects и proposals удерживают прежние цели до явного reconciliation; namespace fingerprint не изменяется, чтобы upgrade не делал blind bootstrap.

Символические witnesses охватывают vault/folder/file boundaries, exact names и неизвестные descendants. Проверяется наследование bidirectional в неподдерживаемый provider и неинъективный inverse mapping: два local mounts одного job на один remote target блокируют writer до inventory. Проверка ограничена 100,000 классов; превышение останавливает activation. Для полного единого symbolic compiler остаётся S1 gate.

Общая защита до mkdir/staging учитывает:

- обязательные каталоги из всех assignments/mappings, даже без файлов в inventory;
- case/NFC aliases, file-as-parent и target-as-directory, при чтении только необходимых локальных родителей;
- весь plugin package при разных owners `main.js`/`manifest.json`/`styles.css`, включая будущие пакеты;
- retained Drive identities и незавершённые local effects, включая ancestor/descendant overlap;
- cached case-only rename: новый alias блокируется, старый accepted path не превращается в orphan deletion.

Directory-only reservation запрещает создание файла на пути каталога, сохраняя доступ к разрешённым детям. Payload bytes не читаются для directory proof. Недоступный required parent удерживает соответствующую группу, не все независимые пути. Reservations имеют индекс по normalized path/prefix; lookup зависит от глубины пути, а не числа historical claims.

Для нескольких writable Drive jobs проверяются глобальные object IDs и свежие parent chains, включая account/shared-drive root terminus. Одинаковые/вложенные roots блокируют writers. Нечитаемый или неразрешённый чужой root не считается доказанно независимым. Проверка выполняется вне serial apply и bounded reader slot; Git не ждёт этого remote proof. Проверка консервативна: overlapping roots блокируются даже при потенциально непересекающихся relative bindings. Полное post-policy remote authority и ID anchors ещё не включены.

## Ошибки, recovery и отмена

Provider inventory/auth/transport failure принадлежит job. Ошибка Drive writer fence/checkpoint помечается job domain; independent Git может закончить. Ошибки общей mutation history, authority discovery/settings integrity останавливают новые writes. В проблемах сохраняются `jobId` и `connectionId`.

Перед созданием родителей выполняются scoped readonly recovery probes принадлежащих job эффектов. Подтверждённый effect учитывается без повторной передачи и снимает только совпадающую по hash запись очереди; пользовательские изменённые bytes остаются с blocker. Чужие unresolved records не закрываются этим job. Все оставшиеся shared records удерживают paths/from и родителей ещё до DirLock. Сломанный shared journal запрещает новые effects.

Observer и remote admission получают общий deadline 10 минут. Abort race прекращает логическое ожидание незавершившегося provider; поздний ответ не запускает apply. Logical completion освобождает reader slot и root-observation dependency. Cancellation/settings revision проверяются перед queued apply; active pull context связан с host cancellation. Это не обещание физической отмены неизвестного host I/O: уже начатые записи продолжают использовать durable probe/unknown semantics и удержание целей.

Внутри старого pull runner остаются generic IO/job-fatal ветви; этот участок не объявляет все ошибки file-scoped. Provider dispose exception пока журналируется warning без изменения результата — отдельный maintenance gate. Account-wide auth/quota context ещё не выделен.

## Расписание и завершение

Host включает eligible schedules после layout readiness. Каждое назначенное подключение получает собственный Scheduler, даже при `inherit`. `connection.auto ?? inherit` разрешается через global interval; `inherit` не попадает в числовой interval lookup.

Snapshot отдельно показывает configured/resolved schedule, activity, startup cycle, outcome, periodic/retry/finishing deadlines. После завершения `startup-only` interval остаётся включённым, `nextPeriodicAt` равен `null`. Перечитывание тех же settings и pause/resume не запускает потреблённый startup заново. Явное off → enabled создаёт новую activation.

Startup: default delay 30 секунд. После successful initial check или подтверждённой передачи/удаления назначается finishing через 5 секунд; partial/conflict outcome не требует aggregate `ok`. Максимум два finishing прохода. Finishing пропускает queued canonical и peer-copy failures, не расходуя их попытки; они принадлежат отдельному retry timer. Changed work после исчерпания finishing budget показывает `continuation-required`.

Startup retry budget: initial плюс до четырёх job retries, в течение 30 минут с первого transient failure. Поздний server Retry-After или пробуждение после окна оставляет visible manual continuation. Retry timer и finishing timer независимы; cancel удаляет продолжения, pause сохраняет due deadlines. Periodic ticks coalesce; выполнение одного job не создаёт неограниченную очередь.

Существующие transport retries ещё не используют единый attempt budget Scheduler. Указанный предел относится к job attempts, а не к общему числу HTTP requests: запрет умножения попыток из полного target остаётся gate. Смена schedule во время активного continuation также требует полного generation/activation protocol S2.

## Проекции и журнал

Live source cards в popover/settings и source workspace получают один `JobProjection`: saved configured schedule, resolved SchedulerSnapshot и последний JobRunResult. Selected updates сохраняют результаты остальных текущих подключений. Публичный `window.vaultSync` имеет optional `jobs.version = 1`; возвращаемые projections клонируются. Открытые per-source details сохраняются при refresh.

Session journal сохраняет результаты jobs с отдельными outcomes/counters/issues. Journal modal и last-session popover показывают исторические результаты без подстановки сегодняшнего расписания или действий против прежней policy. Durable representation ограничена 100 job rows и 20 issues на row; `jobResultsTotal` явно показывает усечение. Старые entries без jobs читаются как прежде. Ошибка чтения/записи журнала не стирает предыдущую diagnostic history.

Tree/raw browse по ID и sparse scope работают по S0a/S0c. Полная canonical scope tree, collision groups после policy, per-job preview/inbox и targeted review ещё не объявляются готовыми.

## Проверка и остающиеся gates

`npm run verify`: **534/534**, TypeScript/styles/production bundle. Дополнительные 44 cases к S0c покрывают independent observer/apply, host wiring, failure scope, root proof, recovery reservations до mkdir, case/NFC, queued finishing, timers, UI и журнал. [30 architectural probes](../audits/overhaul-jobs-probes.json) сохранены отдельно; S0a/S0b/S0c snapshots не изменялись.

Не включены: физические per-job stores/queue identities, persistent JobManager/AccountContext, settings writer fence, pair-specific namespace reconciliation и migration, durable leases registry, pin-aware GC/retired manifest cleanup. Накопление старых checkpoint/`.previous` файлов этим этапом не считается устранённым. Не выполнены live Google/Obsidian acceptance и измерения скорости. Existing-ID overwrite остаётся запрещённым; tracked trash, guarded recovery и proposals сохраняются.
