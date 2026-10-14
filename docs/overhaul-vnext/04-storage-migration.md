# Состояние, recovery, journal, GC и миграция

Нормативная часть [Overhaul vNext](README.md). UI journal, retry queue, applied baseline, inbox и mutation ledger имеют разные назначения; ни один не заменяет другой.

## 1. Durable модель

Сначала общий OperationStore сохраняется с additive job/pair/generation ownership fields и partition views. DriveState runner также включён в JobStatePort; refactor только legacy Coordinator недостаточен. Отдельные физические stores вводятся после reader/importer и recovery gates.

```ts
interface JobCheckpoint {
  schema: number; jobId: JobId; pairId: PairId; generation: DataGeneration;
  sequence: number; policyRevision: PolicyRevision;
  items: readonly ItemState[]; pending: readonly PendingEffect[];
  inbox: readonly InboxEntry[]; queue: readonly RetryEntry[];
  appliedReceiptSequence: number;
}
interface PendingEffect {
  intentId: string; groupId: string; jobId: JobId; pairId: PairId;
  generation: DataGeneration; logicalFileId: string; operationSchema: number;
  phase: EffectPhase; expected: Preconditions; desired: Postconditions;
  payloadRefs: readonly RecoveryRef[]; leases: readonly DurableLease[];
  remoteId?: string; upload?: ProtectedResumableState;
  evidence: readonly EffectEvidence[];
}
```

LogicalFileId для Drive базируется на tracked ID и binding lineage, а не path. До remote create — стабильный local item ID с future remote ID reservation. Path change сохраняется как lineage event. Metadata dictionaries используют Map, arrays или null-prototype/own-key access на каждой boundary; `constructor`, `toString`, `__proto__` не получают inherited metadata.

### Целевой backend layout

После S4 новый backend размещается в protected `pluginDir/sync-state-vnext/`; работа со старыми root filenames остаётся только у importer/legacy reader. Предлагаемая первая schema backend — 1, mutation protocol — 4 (совместимый importer OperationStore v3), transitional Drive checkpoint — **3** после [S0c amendment](08-s0c-lifecycle.md), с reader/import для DriveState v1/v2. S0b вводил schema 2; v3 требуется до lifecycle effects, чтобы старый reader не проигнорировал tombstones. Это отдельные versions, не одинаковый общий migration flag.

```text
sync-state-vnext/
  registry-<sequence>.json            # active + retained generations, schema/receipts
  authority-<sequence>.json           # durable target reservations
  jobs/<sha256(jobId)>/<generation>/
    checkpoint-<sequence>.json        # immutable verified snapshot
    events-<segment>.json             # verified event chain / bounded segments
    queue-<sequence>.json             # если separate projection, linked receipt boundary
  migrations/<migrationId>/           # backup refs + import/cutover receipts
  recovery/                          # content-addressed blobs + pin/ref registry
```

Registry stores записывают actual job/pair IDs внутри verified envelopes; path segment hash не identity proof. Generation/sequence segments validated, без raw connection name/ID interpolation. UI journal остаётся отдельным bounded store; исключить его из recovery roots нельзя, если implementation добавила actual recovery refs туда — поэтому такой coupling запрещён.

Каждый envelope содержит schema, identity, sequence, parent/covered event boundary, payload digest и committed receipt linkage. Loader проверяет filename/envelope identity и chain. Physical per-job files не означают per-job-only authority: общий reservation registry и GC roots остаются общими. Publish/control ports не дают fsync guarantees автоматически; supported host durability фиксируется в capabilities и crash tests.

State schemas независимы: settings, profile input, operation protocol, Drive checkpoint и journal projection. Unsupported future schema не сбрасывается в empty state. Corrupt latest generation quarantine/report; fallback к предыдущему возможен только с проверкой chain/receipt/effect evidence. «Предыдущий файл читается» не доказывает, что последние внешние effects не произошли.

## 2. Prepare/effect/commit

State machine: `planned → prepared → effect-started → observed-applied|observed-not-applied|unknown → receipt-committed → settled`. `blocked`, `needs-decision`, `cancelled-before-effect` — explicit branches; неизвестность не terminal.

1. Acquire deterministic scoped leases; stage immutable payload and needed preimages.
2. Pin blobs и подтвердить durable references. Prepare intent с recorded identities, versions, operation schema и allowed postconditions; verified persistence обязательна.
3. Выполнить ровно разрешённый effect; при ambiguous response сохранить unknown. UI timeout не удаляет pending.
4. Probe/verify postcondition по local digest/remote ID, parent, metadata и content evidence. Не подтверждать новый effect только наличием файла с таким именем.
5. Persist receipt; update applied baseline/lifecycle/inbox/queue одной связанной transaction boundary или replayable committed event с sequence. Ack baseline после receipt; загрузка восстанавливает projection из receipts.
6. Release settled reservations и затем remove obsolete references; live pins освобождаются после durable ownership transfer. Journal строится из accounted result, не запускает effect повторно.

Между FS и Drive нет общего rollback. Operation group содержит ordered dependencies и compensate/reconcile instructions. Recovery не выбирает конфликтный winner самостоятельно и не публикует содержимое changed file под старым consent.

### Crash boundaries

| Crash/failure point | Что обязано остаться / действие loader |
|---|---|
| Payload записан, intent ещё не ack | Не было разрешённого effect; orphan candidate только после registry/pin proof |
| Intent ack, effect не начинался | Prepared intent/payload/leases; probe и capability/ownership проверка до продолжения |
| Запрос отправлен, response потерян | Unknown, те же IDs/payload; probe прежде replay |
| Первая копия group готова, вторая/primary ещё нет | Verified copy evidence и group deps; не создавать новый copy ID и не терять original |
| Local CAS прошёл, receipt ack потерян | Сверить local digest с expected/desired; подтвердить либо оставить changed/unknown, не повторять overwrite |
| Remote upload завершился, receipt отсутствует | Inspect reserved ID+parent+digest; не allocate новый ID |
| Trash прошёл, baseline/tombstone ещё не ack | Probe actual trashed/local state, reconstruct lifecycle receipt; не bootstrap-create |
| Receipt ack, projection/baseline delta не ack | Replay receipt sequence в projection; effect не повторяется |
| Compaction snapshot temp/rename прервана | Выбрать verified published snapshot+covered deltas; temp не active по имени/mtime |
| GC mark готов, появился новый ref/pin | Candidate removal запрещён без актуальной barrier проверки; publication защищена |
| Новые settings записаны, registry ещё старый | Transaction mismatch fenced; завершить/rollback по migration receipts |
| Registry switched, post-verify не закончился | Новые timers ещё не active; проверить pending/ref ownership, затем admission |
| Cleanup failed после successful effect | Effect остаётся accounted; maintenance retry, не transfer retry |

Fault injection проходит до/после каждого write/rename/ack, включая «операция завершилась, port бросил error» и late promise completion. Для effect, отличного и от before, и от desired, recovery не выбирает произвольную сторону; создаёт review с актуальными bytes/evidence.

## 3. Baseline, no-op и tombstones

Разделяются canonical applied baseline, последний observed remote state, handled version, proposals и tombstones. Pull incoming/keep-local не выдаёт sidecar hash за applied primary. Bidirectional proposal не подтверждает canonical remote convergence.

No-op path не вызывает checkpoint save. Изменение только remote metadata version допускает компактный delta, но не N rewrites полного baseline. Реальные effects требуют per-effect receipt acknowledgement; batching разрешён для projection после этих receipts, не за счёт утраты recoverability.

Checkpoint engine: append verified item deltas + bounded compaction. Proposed compaction threshold: 1,000 events или 4 MiB delta log, что наступит раньше; adaptive tuning после benchmark. Новая compact snapshot проверяется до retire covered events, сохраняются latest + previous verified checkpoints. Необработанный pending/refs не исчезает из older retained generation без reachability proof.

Tombstone содержит original logical ID, remote ID, last canonical digests, deletion sides/evidence, receipt и time. Простой remove baseline запрещён: иначе deleted tracked файл станет новым upload при следующем bootstrap. Retention default 90 дней с compact lineage summaries после срока; истечение срока не даёт права автоматически создавать/удалять unknown counterpart. Retired/uncertain/pending tombstones retained до resolution. Release gate включает объяснимое восстановление после offline > retention.

## 4. Inbox и explicit resolution

Inbox kinds: conflict, gated-upload-review, delete-edit, unknown-remote, collision, relocation, capability-block, recovery-unknown. Entries с immutable ID, job/pair/item, observed versions, proposal links и allowed actions. Несколько proposals на один path не перезаписывают друг друга.

Unknown 404 entry не исчезает после manual local deletion, следующего scan или TTL. Доступные действия различаются:

| Действие | Preconditions / последствия |
|---|---|
| Refresh access/probe | Read-only; обновить evidence, не выводить deletion из отсутствия |
| Restore/rebind known object | Fresh verified ID/root/parent; explicit new binding receipt, preserve old lineage |
| Publish as new | Explicit bootstrap resolution, verified writable parent, new reserved ID; original unknown не объявляется trashed |
| Keep local and detach tracking | Explicit retirement/quarantine original binding; old unresolved effects/leases сначала accounted |
| Accept actual trash | Только verified trashed object или поддержанный operator evidence contract; не текст «я удалил» вместо API evidence |
| Acknowledge review | Закрывает attention без утверждения convergence; copies и divergent canonical state остаются записанными |
| Discard recovery payload | Separate destructive retention action, forbidden для payload активного/unknown effect |

Decision receipt привязан к версиям и allowed capability. Unsupported «применить локальную поверх existing ID» disabled. Mark resolved не может закрыть неизвестный published effect: либо доказанный settle, либо explicit maintained quarantine/reservation и новый ownership boundary.

## 5. GC и накопление metadata

Общий RecoveryStore поддерживает live pin protocol. GC и payload publication используют общий barrier: blob write/dedup получает pin **до** возможности удаления, durable intent/state принимает reference, затем pin передаётся. Перечень refs, собранный вне barrier, недостаточен.

Reachability roots: active checkpoints/deltas, retained previous checkpoints, all pending local/Drive intents, proposals с обязательными payloads, migration backups/receipts, rollback-supported generations, retired unresolved jobs и live stage/upload pins. Один unknown/corrupt retained store блокирует deletion его потенциальных refs; не обязательно останавливает unrelated reads.

GC: acquire registry/pin snapshot barrier → verify roots and target generation → mark → verify no new reference/pin for candidate → remove known unreferenced blobs → persist cleanup report. Если список refs/registry изменился, candidate перепроверяется. Unverified filenames, future schemas, corrupt metadata не удаляются как мусор по regex/возрасту.

| Файлы | Нормальная retention / условие очистки |
|---|---|
| `sync-operations-v3-checkpoint-*.json` | Covered checkpoints после verified current/previous+event coverage; active recovery records не теряются |
| `manifest-*.json.previous` | Latest и один verified previous per **active/retained** namespace; orphan namespace после ownership/migration proof |
| `drive-state-*-*.json` | Latest+previous на current schema; retired/pending namespaces входят в registry/reachability |
| `.tmp` публикации | Remove только если intent/publication evidence исключает active writer и durable dependency |
| Recovery blobs | По reachability+pins, не просто oldest-first |
| Journal | Bounded display history; его clear не влияет на effects/baselines/recovery |
| User conflict artifacts | Не metadata GC; остаются до отдельного пользовательского действия |

Default journal capacity остаётся 200 записей; storage budget общий, с fair per-job admission. Metadata counter per job не увеличивает бесконтрольно shared limit. Cleanup failure сообщает отдельный maintenance issue и retry с backoff; он не заставляет повторять завершённый upload. При невозможности безопасно ограничить рост storage admission блокирует новые affected writes, не удаляет protected history.

Проверка accumulation включает тысячи warm no-op runs, namespace churn, failed cleanup, interrupted rename, retired Drive intents и `.previous` manifests. Storage UI показывает used/pinned/retired/reclaimable bytes и reason, а не обещание «очистить всё».

## 6. Journal и диагностика

Существующее `sources: string[]` сохраняется как human-readable names. Additive поля: schema, jobId, connectionId, pairId, generation, runId, batchId, policyRevision, outcomeVNext и typed result IDs. Legacy `ok/cancelled/error` compatibility projection не используется новым UI для сокрытия partial/attention. Old journal читается без jobId и помечается legacy.

Завершение run записывает display entry после durable accounting. Ошибка journal отмечается в job result и recovery diagnostics, но не отменяет known receipt и не даёт false full success. Crash до append допускает reconstructable incomplete journal row по run receipt; duplicate append dedup по runId.

Очистка journal удаляет display history с явным описанием, не recovery data. Export diagnostics редактирует tokens, secret refs при необходимости, OAuth code/state, signed URLs, resumable upload URLs и request auth headers. Runtime paths/object IDs включаются только в явно выбранную диагностику; обычные notices компактны. Local content/preimages не включаются в diagnostic export автоматически.

Resumable URL чувствителен и не попадает в logs/UI. Если для resume требуется persist, используется защищённый credential-capable store/ref либо отдельный защищённый host port; current plaintext pending требует security review до расширения release. Отсутствие безопасного durable URL port допускает session restart на том же reserved ID с потерей resume speed, а не file identity.

## 7. Settings activation и storage cutover

Первая фаза не меняет filenames и существующие reader schemas: additive owner metadata/partition views, serial apply. Storage cutover — отдельная версионированная операция. Простой `migrated=true` и rename файла не являются transaction.

Migration phases:

1. `discover`: stop admission, fence/join writers; enumerate legacy namespaces/settings/checkpoints/Drive state/queues/recovery refs. Missing/future/corrupt entries visible, не silently skipped.
2. `backup-verified`: сохранить original settings и retained state snapshots; hashes/size/schema записать в migration receipt. Backup существует до cutover и не содержит dump refresh tokens.
3. `partition`: доказать owner из recorded routing/namespace/pair metadata. Неоднозначное уходит в retained legacy recovery domain с reserved targets; пользователю не выдумывается новый owner.
4. `import-prepared`: создать candidate registry/stores; переносить applied bases, queue, Drive baseline/pending/reviews, reserved upload IDs, resume offsets, directory IDs, copy IDs и all refs. Chain/event sequence переписывается importer с parent receipts, не filename-only.
5. `validate`: roundtrip input policy и symbolic witness equivalence; verify receipts/references/coverage and crash replay. Ни новых uploads, deletions, prompts, шире scope или иной automatic conflict winner.
6. `cutover-prepared`: acknowledged compatible settings envelope + reader-version gate + migration receipt; старый writer обязан видеть unsupported version, а не новую пустую историю.
7. `activate`: publish verified active generation registry. Settings и registry не считаются атомарными двумя writes: loader сверяет transaction ID/receipts и до complete match остаётся fenced. Старое verified состояние остаётся до этого момента.
8. `post-verify`: reload new readers, reconstruct projections, probe pending under recorded semantics. Только после этого start timers и разрешённые effects.
9. `retire`: old stores retained в registry; pin-aware GC после rollback window и accounted pending. Receipt marker не удаляется вместе с display journal.

## 8. Crash, rollback и old-build fence

Crash before cutover: resume migration либо active old verified configuration; prepared artifacts не становятся active. Crash между settings/registry publication: fenced loader завершает или откатывает cutover по receipts. Crash после external effect во время import/activation: recover original intent under original generation, не заново bootstrap-sync.

Сначала выпустить compatibility reader/writer fence, затем новую storage схему. Просто запустить историческую сборку поверх new stores небезопасно, поскольку она не знает remote pending. Установочный rollback выполняется supported exporter/reconcile; если старый binary не способен проверить marker, UI/documentation не обещает автоматическую защиту от его ручного запуска.

Rollback настроек не откатывает внешние effects. Recovery history сохраняется и требует supported reconciliation. Import idempotent по stable IDs/receipt hashes; повтор migration не создаёт ещё один job, copy или upload ID. Migration acceptance проверяет forced failure на каждой publication/ack границе, включая queued late responses и settings-save rejection.
