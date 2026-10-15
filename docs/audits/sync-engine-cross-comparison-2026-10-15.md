# Повторное сравнение с Sync Engine: что заимствовать и почему наш Drive медленнее

Дата: 2026-10-15. Наш runtime: `a5a4d16bb55976aaa6a88727396c9ca54cc9d680` (следующие commits добавили только аудит). Донор: `hesprs/sync-engine`, `a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9`. HEAD upstream повторно проверен через git ls-remote и новый shallow clone: совпадает с ранее исследованным commit. Manifest upstream: Sync Engine 3.3.1, minAppVersion 1.13.0; package.json Google Drive-модуля: 0.0.1. Версия установленного у пользователя модуля не установлена; package.json не заменяет идентификацию установленного бинарника.

## Вывод

Из Sync Engine стоит заимствовать больше, чем URL/query helpers. Наиболее ценные части — разделение observation/plan/tasks, завершение независимых задач при локальной ошибке, bounded concurrency, snapshot/ID/context cache, streaming, небольшие записи состояния и инструменты измерения.

Основные причины нашей медленности находятся в активном pipeline: последовательный обход папок; повторные сетевые проверки всей цепочки родителей для каждого файла, включая неизменённые; чтение и хеширование локальных файлов при каждом проходе; последовательное выполнение Drive items; полный checkpoint на изменения состояния. Перенос одного auth.ts или upload.ts это не исправит.

Рекомендация — сохранить наш policy/ownership/recovery контракт и заменить неэффективные внутренние участки на адаптированные механизмы донора. Перенос всего GdriveFs/Sync/SDK как второго независимого engine увеличит расхождение между двумя pipeline, уже выявленное предыдущим аудитом.

Пользовательское наблюдение о скорости и стабильности Sync Engine не оспаривается. У донора действительно лучше организован обычный путь исполнения. Но отсутствие видимого конфликта иногда достигается выбором одного из дубликатов, а часть быстрых решений принимает более слабые доказательства равенства/свежести. Эти различия нельзя молча перенести на произвольную выбранную Drive-папку с внешними редакторами.

## 1. Что проверено экспериментально

Исполнены реальные `GdriveFs.list`, наш `GoogleDriveClient.inventory`, `observeDrive`/`GoogleDriveRoot.owned`, а также upstream bidirectional decider. Подставлены только API/DB и runtime constants, не алгоритмы. Ответы API стабильные, полные, с корректной пагинацией по 1000; все файлы доступны обеим реализациям; local/remote mutations не выполнялись. Сетевые задержки и Obsidian не моделировались.

| Набор | Sync Engine: запросы list | Наш inventory | Наш inventory + identity observation каждого неизменённого файла |
|---|---:|---:|---:|
| 100 файлов, 10 соседних папок | 1 | 12 | 312 |
| 100 файлов на глубине 10 папок | 1 | 12 | 1212 |
| 1000 файлов, 100 соседних папок | 2 | 102 | 3102 |

**Это число запросов указанных стадий, не скорость полного sync и не обещание ускорения в 1551 раз.** В table не включены local scan/hash, transfers, root setup/restore, journal и прочие host stages. У upstream запрошен уже известный `/`; lookup выбранного baseDirectory может добавить запросы. У нашего клиента inventory включает один inspect корня. Upstream-wide listing в реальном аккаунте может содержать дополнительные видимые объекты других папок; тестовая область содержала только перечисленный набор.

Объяснение: наш inventory делает root inspect + один list на каждый каталог, включая root. Затем `observeDrive → inspectDriveIdentity → root.owned` повторно делает inspect файла, родительской папки и root. На глубине 10 это 12 inspect на файл. Проверки выполняются даже для unchanged baseline. Warm baseline zero writes, исправленные ранее, не означают zero network или zero local reads.

Дополнительные probe results:

- Upstream list на двух файлах `same.md` с разными ID/modifiedTime возвращает только один `same.md`; path→ID cache содержит более новый ID. Второй объект не становится отдельным конфликтом.
- Upstream bidirectional decider без record, с равными размерами и различными local/remote UID, создаёт `addRecord`, а не transfer/conflict. Равенство bytes в этой ветке не проверяется. Probe не утверждает, что UID разных сторон вообще обязаны быть сравнимы: важно, что equality устанавливается только по размеру.

Доказательства: [JSON](sync-engine-comparison-evidence-2026-10-15.json), [воспроизводимый runner](reproduce-sync-engine-comparison-2026-10-15.mjs). Запуск runner описан в его начале; требуются оба checkout и установленный esbuild в нашем checkout. Это targeted probes, не полный upstream test suite.

## 2. Различия, влияющие на скорость

| Участок | Sync Engine | Наш текущий код | Что делать |
|---|---|---|---|
| Inventory | Один account-visible paginated list `trashed=false`; дерево строится по parents в памяти | Sequential BFS с files.list для каждой папки | ID index/graph и параллельный bounded subtree discovery; общая выборка только при подходящем scope/corpus |
| Warm observation | Использует stat/UID и контекст предыдущих операций | Fresh inspect файла и всех предков на каждый path | Разделить snapshot observation и проверку перед effect; общих предков проверять один раз на observation epoch |
| Local changes | UID локального файла = mtime~size | `observeLocal` читает и SHA-256-хеширует весь файл | Verified hash cache + dirty index; перед effects сохранить проверку актуальных bytes. mtime/size использовать как hint, а не доказательство равенства |
| Tasks | Tasks запускаются независимо через Promise.all; request/memory wrappers ограничивают ресурсы | Последовательный цикл Drive; общий JobBatch applyChain содержит transfers | Bounded task executor и dependency graph; независимо готовить transfers, serial/locked commit только для пересекающихся targets |
| Errors | Каждый task ловит ошибку; другие tasks заканчиваются; общий result failed/cancelled/completed | Generic io может стать session fatal; null отмены превращается в success/retry | Typed TaskResult/JobResult; item-local vs source/global/unknown-effect classification |
| Transfers | Small multipart upload; large resumable; range read streams; memory budget | Для upload создаётся resumable session; полные ArrayBuffer; limit 64 MiB | Small-file fast path с durable ID/idempotency; streaming через наш staging/recovery contract |
| State | IndexedDB KV record set/batch; memory context caches | JSON full-state clone/serialize/checkpoint при изменении | Per-pair incremental records + durable events; периодические snapshots и pin-aware GC |
| Realtime | Fast mode может переиспользовать cached remote stats без нового list | Повторные полные observation/validation | Verified index + incremental refresh; внешние изменения не игнорировать |
| Rename | UID-based delete/create pairing → move tasks | Full rename identity workflow не завершён | Перенести идею optimizer, опираться на Drive ID и доказанный ownership, не только checksum |

**Upstream в этом commit не использует Drive Changes API.** Быстрый warm realtime путь — cache, не Changes feed. Также multipart upload одного файла не является batch upload нескольких файлов. Нельзя приписывать донору отсутствующие технологии.

## 3. Что конкретно можно взять

В колонке «форма» различаются исходный MIT-код, адаптация и архитектурная идея. Это план заимствования; новые runtime-модули в рамках сравнения не переносились.

| Компонент донора | Форма | Выгода и обязательная адаптация |
|---|---|---|
| `packages/gdrive/src/gdrive/api.ts` | Уже частично заимствован; дополнить отдельными helper/test cases | buildUrl/escapeQuery есть у нас. parse errors адаптировать к SyncFault с сохранением Google reason, HTTP status, Retry-After и cause; toStat не переносить без validation |
| `packages/gdrive/src/gdrive/fs.ts` — ID cache / parent graph | Адаптировать архитектуру | `Map<fileId, metadata>`, `Map<parentId, children>`, `Map<targetKey, Set<fileId>>`; namespace account+root+pair. Последний индекс обязан сохранять все collision IDs |
| `packages/plugin/src/modules/Sync.ts` — task executor/outcomes | Создать совместимый executor на основе подхода | Каждый task завершается typed result; independent tasks продолжаются. Не копировать unbounded Promise.all; зависимости, cancellation, queue admission, shared-store failure и unknown effect учитываются явно |
| `packages/plugin/src/fs/middlewares/rate-limiter.ts` | MIT-код как база небольшого limiter | FIFO queue + maxConcurrency/minInterval полезны. Добавить cancellation/deadline ожидающих, account cooldown, fairness между jobs и корректное освобождение permits. Не копировать default concurrency=50 без измерений |
| `packages/plugin/src/fs/middlewares/retry.ts` | Выборочно classifiers + jitter | Полезны OS/network error codes и traversal cause. Нужны Retry-After, Google 403 reasons, interruptible sleep, budget и запрет blind replay неидемпотентной записи. Не заменять наш retry простой петлёй донора |
| `packages/shared/src/read-stream.ts` | Адаптировать MIT utility | Ограниченное число in-flight ranges и сохранение порядка chunks. Дополнить Content-Range/status/total validation, закреплением object revision, cancellation/discard, hash verification и staged local commit |
| `packages/gdrive/src/gdrive/upload.ts` — multipart | Адаптировать для small new objects/proposals | Один media+metadata request вместо start-session + PUT. Reserved ID/persistent intent до запроса; потерянный ответ → inspect reserved ID и digest, а не новый POST с новым ID |
| Там же — streaming resumable | Использовать framing/buffering идею, сохранить наш recovery | 8 MiB chunks есть уже у нас. Донорский upload не заменяет durable URL/offset/intent: после ambiguous failure нужна status probe и подтверждённый Range; reader release/cancel и размер потока проверять |
| `packages/plugin/src/fs/wrappers/memory-control.ts` | Идея + части алгоритма очереди | Byte-budget и backfilling, а не число файлов. Наши permits должны принадлежать конкретному transfer и освобождаться в finally; учитывать recovery/hash buffers, а не только условные 16 MiB |
| `packages/plugin/src/fs/wrappers/context.ts` | Адаптировать контекстный cache | Обновлять cache только после подтверждённого effect. Сохранять observationRevision/dirty state; старый cached snapshot не даёт права удалять/перезаписывать |
| `packages/plugin/src/modules/Storage.ts` | Заимствовать pair-scoped KV подход | Stable pair identity, indexed records и batch updates. IndexedDB сама по себе не заменяет portable durable ledger/recovery; schema migration, export/backup и Obsidian lifecycle проверять отдельно |
| `packages/plugin/src/sync/utils/detect-moves.ts` | Адаптировать optimizer | Избавляет от download+upload при rename. Основной якорь Drive ID; одинаковый hash не уникальная identity; учитывать root boundary, canonical link/ID и local dirty state |
| `packages/plugin/src/modules/Scheduler.ts` | Идеи coalescing и явного завершения request | Схлопывать несколько triggers в один job cycle, всем callers возвращать result. Сохранять наши per-job schedules/startup finishing; глобальный scheduler донора не решает нашу per-source задачу |
| `packages/plugin/src/modules/EventBus.ts`, `Observability.ts` | Аналог typed events | Из одного результата строить UI/journal/progress; schedule отдельно от run/blocker; не заменять durable journal ephemeral event bus |
| `scripts/benchmark/*` | Адаптировать MIT test tooling | Deterministic datasets, create/edit/delete/move, roundtrip. Добавить byte hashes, IDs, proposals/tombstones, failure injection и crash checks. Upstream validator местами проверяет только size. Bootstrap очищает target: использовать только новый disposable vault |

## 4. Работа с произвольной папкой: что изменить относительно Sync Engine

Sync Engine документирует app-managed base directory и scope `drive.file`: вручную созданные или созданные другим приложением объекты вне предоставленной приложению видимости не входят в его нормальную область синхронизации. Google `drive.file` в целом также может предоставлять доступ к выбранным/открытым через приложение объектам; это не означает, что текущий донорский baseDirectory UI умеет подключать произвольное внешнее дерево.

У нас full `drive` + `openid`, выбранный root ID, чужие файлы, возможные другие OAuth clients и shared-drive metadata. Поэтому:

1. **Нельзя просто заменить BFS на `q=trashed=false` всего аккаунта.** Это может сканировать огромный Drive ради маленькой папки, расходовать память и quota. Донорский выигрыш от ограниченной видимости исчезает при широком scope.
2. **Начальный обход:** bounded параллельные folder queries; при поддерживаемых размерах query группировать несколько parent IDs через OR. Сохранять pagination bounds, incompleteSearch, ID/parent validation и отсутствие destructive effects при неполноте. Пакет parent queries не является атомарным snapshot.
3. **Индекс:** canonical IDs и parent edges — отдельно от projected local paths. Policy/exclusions применяются до execution collision; raw tree показывает все IDs. Collision блокирует только доказанно связанную группу.
4. **Warm run:** переиспользовать validated observation index; общие ancestor proofs не пересобирать для каждого no-op файла. Перед конкретным upload/trash/overwrite заново проверять object/root/ownership/version. Не выдавать cache за concurrency lock.
5. **Incremental:** Changes API — новая наша реализация, не копирование у донора. Feed может быть account/corpus-wide; потребуется фильтрация membership, обработка moved folders, permission loss, удалённых объектов, устаревшего token и полный rescan. Cursor/index/pending work публикуются согласованно; observation cursor не подменяет acknowledged baseline.
6. **Локальный индекс:** dirty events + verified content hash cache; invalidation при потерянных событиях/новой epoch; ограниченный scrub. На чтении/записи effects свежая проверка обязательна. mtime/size alone не гарантируют обнаружение изменений с сохранёнными timestamps.

Наиболее быстрый безопасный первый шаг — устранить N-кратные повторные ancestor inspect и последовательность независимых transfers. Для этого не требуется сначала реализовать весь Changes API или заменить хранилище на IndexedDB.

## 5. Что не переносить без изменения семантики

### Выбор одного duplicate по времени

`dedupeChildren` оставляет самый свежий файл (для папок первый). Это делает list спокойнее, но скрывает другие IDs. Наше решение: отдельные tree rows, post-policy collision groups, явный binding к ID/решение пользователя; остальные файлы продолжают работу.

### Bootstrap «одинаковый размер = синхронизировано»

Upstream decider создаёт record без чтения bytes. Для импорта произвольных папок это может принять разные файлы за совпадающие. Сохранять content verification при adoption. Далее cache позволяет не делать дорогую проверку каждый раз.

### 404 как отсутствие и автоматическое восстановление root

Upstream `readWithSize` подавляет 404/ENOENT; Download/Upload могут вернуть без record update, а task executor увидит завершившийся task. Default remote lister при not-found root создаёт root и очищает record pair. Для нашей модели 404/permission loss/moved identity должны давать unknown/probe/решение, а не молча новый bootstrap или success.

### Прямой PATCH существующего файла

Upstream uploadTarget использует cached ID для PATCH. Это поддерживает привычную двустороннюю синхронизацию, но в показанном пути нет нашего полного fresh revision/ownership/ambiguous-effect contract. Пользователь уже выбрал ограничение спорных записей конфликтными копиями; этот gate сохраняется. MIT-заимствование upload transport не является основанием открыть overwrite.

### Keep-both с выбором победителя по mtime

Upstream resolver переносит проигравший файл и публикует обе версии, winner выбирается по mtime. В одной ветке исходный remote ID уходит под conflict name, canonical создаётся заново. Это может нарушить требование сохранить canonical ID/ссылки и не заменяет наши proposal IDs, receipts и idempotent replay. Взять можно decomposition tasks, но не этот конфликтный протокол целиком.

### Cache-only realtime

Upstream fast mode по умолчанию включён и для realtime trigger может вообще пропускать remote walk. Это объясняет быстрый отклик на локальную правку, но не доказывает актуальность remote перед конфликтующей записью. Наш быстрый путь должен иметь explicit freshness boundary и targeted revalidation.

### Blind retries / default parallelism

Upstream retry не учитывает все наши Google quota/Retry-After/commit uncertainty правила; maxRequestConcurrency по умолчанию 50. Сначала bounded executor и account limits, потом настройка по замерам. Увеличение maxConcurrency при полном ArrayBuffer на файл резко повышает memory pressure.

### IndexedDB вместо recovery

Небольшие KV mutations полезны. Однако успешный record.set после remote/local effect не делает их общей транзакцией. Не терять intent/preimage/receipts ради меньшего количества JSON-файлов.

## 6. OAuth: что ещё брать

У нас уже есть single-flight refresh, access token cache, один retry после 401, SecretStorage для refresh token, PKCE/loopback desktop flow, cancellation/timeouts и generation guards. Это не главное отставание по скорости синхронизации.

Sync Engine использует device authorization для desktop/mobile и client configuration своего проекта. Нельзя переносить его OAuth credentials/refresh tokens или считать поддержку device flow с его scope доказательством пригодности для нашего full-drive flow. Для нашего Cloud client и требуемых scopes device flow нужно отдельно проверить по правилам Google; desktop loopback остаётся подходящим вариантом без внешнего сервера.

Полезны UX состояния connect/expired/reconnect и единая bearer middleware boundary. Но простая замена auth.ts может потерять наши guards на поздний refresh после disconnect.

Отдельное уточнение к предыдущему аудиту: upstream вызывает `secretStorage.deleteSecret`, а установленный у нас Obsidian typings содержит только get/set/list. Upstream требует Obsidian >=1.13.0. Это основание проверить host capability/min version и добавить feature-detected deletion с fallback, а не утверждать, что API удаления не существует ни в одной версии или безусловно вызывать отсутствующий метод. Здесь реальный host API не проверялся.

Недоступность страницы Google SetSID сама по себе переносом кода не исправляется. Нужно корректное завершение нашего ожидания и понятный повтор/отмена, а доступность browser endpoints проверяется отдельно.

## 7. Поправка к плану overhaul

### SE-1: правильные task outcomes и изоляция ошибок

Взять подход `Sync.ts`: независимые задачи завершаются, partial result сохраняется, cancelled никогда не становится success/null. Исправить текущие M4/m19 и profile remote/incoming до включения широкого параллелизма. Collision — отдельная blocked group, не source-wide fail.

Приёмка: из 100 независимых файлов при ошибке одного завершаются 99; при shared-store/unknown commit error запрещены зависимые effects; отменённые queued tasks не стартуют; журнал и карточки выводятся из тех же результатов.

### SE-2: быстрый observation/index

Разделить `DriveObservationContext` и свежий `DriveEffectGuard`. Snapshot ID/parent graph; run-scoped memoization общих metadata; bounded listing; local dirty/hash cache. Никакого last-wins duplicate selection.

Приёмка: на стабильной тестовой модели больше нет inspect всей ancestor chain для каждого no-op файла; counters отдельно показывают list/inspect/media/state IO. Уникальный родитель не проверяется N раз на стадии наблюдения. Между snapshot и effect перемещение/изменение permissions/ID ловится fresh guard. Точные бюджеты запросов закрепить после выбора стратегии scoped listing.

### SE-3: transfer executor и small-file fast path

Взять limiter/memory/range/multipart механизмы с cancellation и durable idempotency. Начать с небольшой настраиваемой concurrency (например, 4–8 как исходной гипотезы), общий account budget, независимые transfers вне shared session lock. 50 — параметр upstream, не наша целевая константа.

Приёмка: parent tasks предшествуют child effects; targets не пересекаются; Retry-After останавливает нужный account, не весь plugin; bounded memory проверяется на desktop/mobile; lost response не создаёт duplicate IDs; staged writes не оставляют частичный canonical файл.

### SE-4: incremental state и warm sync

Per-pair records, delta journal/snapshots, reachable-reference GC; затем Changes API и инкрементальный local index. UI из общего plan/results: каждый blocked item имеет причину и guarded action. Это совместить с уже запланированными pair migration/settings fence, а не создавать третий storage namespace без миграции.

### SE-5: общий benchmark с Sync Engine

Использовать одинаковые наборы и условия: 100/1000/10000 small files; shallow/deep trees; large binaries; cold upload/download; unchanged run; single edit; rename; delete; конфликт; 429/503; interrupted transfer/restart. Две серии: app-managed область, сопоставимая с донором, и arbitrary selected folder с внешним клиентом.

Фиксировать scopes, версии обоих plugins/modules/Obsidian, одинаковый account/corpus/root topology, latency, размер/число файлов, степень параллелизма и режим triggers. Отдельно normal full sync и cache-only realtime донора. Метрики: elapsed/phase p50-p95, requests по методу, transferred bytes, local bytes read/hashed, peak memory, checkpoint bytes/writes, per-file outcomes, byte hashes и ID preservation после restart.

Не выполнять upstream benchmark bootstrap на пользовательском vault: он очищает тестовую область. Использовать только новые disposable vaults/Drive folders. В рамках этого анализа такой benchmark не запускался.

## 8. MIT и границы заимствования

Проверен LICENSE upstream: MIT, Copyright (c) 2026 Hēsperus and All Contributors. Разрешены копирование, модификация и распространение с сохранением copyright и permission notice в копиях/существенных частях.

Наши `THIRD_PARTY_NOTICES.md`, `licenses/sync-engine-MIT.txt` и banner main.js уже фиксируют небольшое заимствование api helpers. При переносе новых частей:

- перечислить исходные файлы/commit и местные адаптации;
- расширить notices и сохранить полный MIT в source/binary distribution;
- отдельно проверить лицензии зависимостей, если реально импортируется SDK/Uni-KV/другой пакет;
- не переносить чужой OAuth client configuration, продуктовые credentials, branding или privacy claims;
- переносить небольшие проверяемые модули и relevant tests, не весь SynthKernel/Solid/SDK ради одного Drive adapter.

## 9. Закреплённые ссылки на код

Upstream:
- [GdriveFs: ID map, list, duplicate policy](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/packages/gdrive/src/gdrive/fs.ts)
- [Task execution и root recovery](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/packages/plugin/src/modules/Sync.ts)
- [Bootstrap: cache fast mode и wrappers](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/packages/plugin/src/modules/Bootstrap.ts)
- [Bidirectional decider](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/packages/plugin/src/sync/decision/bidirectional.ts)
- [Upload](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/packages/gdrive/src/gdrive/upload.ts)
- [Streaming](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/packages/shared/src/read-stream.ts)
- [Storage](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/packages/plugin/src/modules/Storage.ts)
- [Область работы Drive и OAuth](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/docs/src/pages/en/deep-dive/modules/gdrive.md)
- [MIT](https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/LICENSE)

Наша версия:
- [Inventory и transfers](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/sources/gdrive-client.ts)
- [Repeated ancestor inspections](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/sources/gdrive-root.ts)
- [Observation](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/drive-observation.ts)
- [Local hashing](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/local-version.ts)
- [Coordinator](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/drive-coordinator.ts)
- [Checkpoint publication](https://github.com/vetsyncpath-oss/sync/blob/a5a4d16bb55976aaa6a88727396c9ca54cc9d680/src/core/drive-state.ts)
