# 12. Единый plan, identity, persistence, GC и UI

R12.1–R12.9 уточняют [01](../overhaul-vnext/01-policy-ownership.md), [04](../overhaul-vnext/04-storage-migration.md), [05](../overhaul-vnext/05-ui.md). Runtime defaults и результаты — [10](10-run-results-and-error-model.md).

## R12.1. Один pipeline и immutable plan

Все entrypoints (manual/auto/startup/retry/force/scan/preview/inbox/recovery) проходят общий coordinator protocol. Различаются selection/trigger/capability, но не policy interpretation или правила безопасности. Legacy combined adapter допускается только как provider bridge; отдельный путь, минующий plan/authority, удаляется после parity tests.

`CompiledSettings → JobDefinitions → ObservationSnapshot → EffectivePolicy → TargetGraph → SyncPlan → TaskExecutor → Receipts → JobResult`. Preview заканчивается на plan, ничего не резервирует надолго и не начинает effects. Execution повторно проверяет preconditions и не использует preview как право на запись спустя часы.

Plan содержит `{planId,jobId,pairId,generation,policyRevision,observationId,items,dependencies,coverage,estimatedResources,blockers}`. Item содержит logicalFileId, source object ID+version, local target key+version, effective profile/provenance, operation, pre/postconditions, dependency group, required capabilities. Frozen plan не мутируется во время asks; ответ создаёт новую versioned resolution/plan delta с доказанными условиями. Изменение settings требует replan, не подмену замыкания.

`scan` read-only: не обновляет applied baseline, не очищает queue/unknown, не выполняет recovery mutation. `retry` выбирает eligible intents и перепроверяет версии/бюджет. `force` игнорирует только optimizable cached observations; не отменяет exclusions, VAM, writer fence, conflicts, deletion evidence или recovery. Manual resolve действует через тот же executor.

## R12.2. Compiler, paths и collision isolation

Сохраняются профили preserve/create/update/changes/remote и drive-bidirectional; sparse assignments и legacy mapping преобразуются единственным compiler. Precedence из 01: exact file > deepest folder > vault; names selector — exact basename по subtree, не glob; binding source/remoteAnchor/remotePath атомарен; equal-specificity conflicting sources invalid. Default source 0 или 1; uncovered paths unassigned, не передаются другому job при ошибке владельца.

Порядок обработки:
1. Decode provider-specific locator на boundary, raw ID/name/parents остаются lossless.
2. Проверка root/graph coverage/unsupported types; raw tree не теряет unsafe/unsupported nodes.
3. Participation/exclusions, включая objectId override и direction.
4. Binding projection в local/remote target graph; validated path representation.
5. Host hard guards + symbolic owner/reservations.
6. Case/NFC/file-directory/mapping collision **после** policy projection, но с учётом физических targets всех owners, включая offline/disabled retained claims.
7. Profile semantics и effect plan.

Duplicate sibling objects различаются ID. Object-specific exclusion убирает только один ID, а не всех его тёзок. Folder ID anchor фиксирует subtree; его relocation вызывает reconcile, не fallback к другому same-name folder. Collision group содержит involved IDs, paths, owner/provenance и способ решения. Независимые groups продолжают; неполная authority не разрешает угадывать независимость.

### Path contract

Разделить `RawProviderName`, `ProviderLocator`, `ValidatedRelativePath`, `PhysicalTargetKey`, `DisplayPath`. Core не делает decodeURIComponent над реальным именем файла; DAV URL adapter декодирует URI ровно один раз. ZIP entry name/Drive name — не URL. Точное `..`/`.` как segment запрещено; `Wait...md`, `v1..2.md`, буквальный `%2e%2e.md` не traversal. Slash в одном Drive basename запрещает его projection; не создаёт directory.

Absolute/UNC/drive-letter roots, NUL/control/backslash aliases и traversal отклоняются до normalization. Повторные разделители либо invalid на core boundary, либо преобразованы legacy importer с receipt; нельзя одному guard передать `a//b`, другому `a/b`. `blockReason`, write, restore и GC используют один PhysicalTargetKey, не разный набор lower/normalize.

Default portability policy консервативная: NFC+casefold collision detection, Windows reserved basenames, запрещённые символы `< > : " | ? *`, trailing dot/space дают видимый unsupported-target на всех platforms. Это **объявленная переносимая политика**, не утверждение, что macOS/Linux технически не поддерживают CON. Native-filesystem mode — будущая explicit capability с migration/alias tests; молча расширять переносимость при upgrade нельзя. Исходное spelling сохраняется; collision не разрешается произвольным переименованием.

Host сообщает фактические `vault.configDir`, pluginDir, storage/recovery/trash directories и filesystem case behavior. Config-only работает относительно configDir, не `.obsidian`. Собственный plugin/state/recovery, `.git`, фактическая trash и host-reserved locations защищены независимо от включений; restore/export тоже не пишут туда через пользовательский путь. Перенос configDir требует обновления protected roots до активации new policy.

Список запрещённых расширений отделяется от структурной безопасности: defaults сохраняют существующие ограничения при миграции, но advanced policy может явно разрешить пользовательские script/data files в ordinary owned scope. Это не разрешение исполнения и не обход host/plugin guards. UI показывает exact rule/reason, а не исчезающий файл. Presets не расширяют участие автоматически.

Legacy `.conflict-*` detection не должен исключать любой файл `notes.conflict-resolution.md`. Verified artifact определяется marker+lineage+origin validation; реальные historical copies — exact historical naming grammar плюс provenance, показываются отдельно. Неизвестное похожее имя не становится artifact автоматически и не получает exemption от hard guards. Existing known legacy copies не включаются массово после upgrade; explicit import/reconcile.

## R12.3. JobManager, AccountContext и reservations

Manager создаётся inert, валидирует settings/schema/registry, устанавливает hard guards и recovery claims, получает VAM state, после host-ready активирует schedules. Job — единица schedule/result/queue/policy, account — единица tokens/cooldown/quota/transport. Один медленный Drive observation не удерживает global run admission для Git.

Global coordination ограничена shared registry publication, resource budgets и conflicting-target authority. Долгий transfer не держит global mutex. Для каждого effect до отправки атомарно записываются reservations `{owner job/pair/generation,intentId,local targets,remote IDs,ancestor scopes,epoch}` и durable intent. Check-then-await-begin без общей атомарной секции запрещён. Parent delete конфликтует с descendant effects; unrelated siblings могут выполняться параллельно.

Lease не исчезает по TTL, пока есть unknown effect. Live heartbeat означает owner process liveness, не доказательство not-applied; смерть owner переводит в recovery claim. Multi-process writers допускаются только при проверенном host/process exclusive lock или CAS-based registry. Если порт этого не обеспечивает, поддерживается один writer instance на vault, второй read-only/blocked; файловый `.lock` с overwrite или случайным temp suffix не считается atomic ownership.

Settings activation: validate draft → compile candidate → compare physical ownership → quiesce affected writers → persist settings+registry receipt → activate new epoch. При failure старая revision остаётся active; draft не теряется. Unaffected jobs могут продолжать только при неизменных shared claims. Удаление connection/assignment не освобождает pending targets: registry хранит retired owner до reconcile. `auto:off`, disabled connection и detached ownership — разные состояния.

Local recovery действия используют тот же reservation protocol. Повторный recover по одному blocked item не мешает независимому record; corrupt shared ledger блокирует writers глобально. No auth/VAM required для просмотра already-local diagnostics, но mutations выполняются только при своих prerequisites.

## R12.4. Pair identity и verified migration

Stable IDs:
- jobId сохраняется с connection; name/token/schedule не identity;
- vaultId записан persistently, перенос каталога не новый vault;
- pairId = verified endpoint principal/root + vault identity + относящиеся к этой паре immutable binding anchors;
- policyRevision = digest поведения/participation/constraints; generation = durable lineage cutover, не каждый run;
- Drive logicalFileId основан на remote ID и binding lineage; до create — stable local item ID + reserved remote ID.

Реальная смена root/principal/anchor mapping создаёт candidate pair/reconcile, а не empty bootstrap. Unchanged bindings могут импортироваться по verified receipt. Git branch ''/default сначала разрешается; alias на тот же resolved ref не новый pair. Изменение actual default branch — candidate reconcile, не слепое переписывание cache key.

### H-4: legacy SHA

`migrateLegacyShas` в baseline не вызывается; его старый body переносит global lastSyncShas в текущий cache без полного pair proof. **Просто вернуть вызов в prepareSession нельзя:** текущий cache может быть routed/OAuth/другой Git root.

Importer читает immutable backup settings/legacy manifest, устанавливает Git endpoint/ref/path projection/hashAlg provenance, проверяет формат SHA и exact own keys. Если attribution неоднозначен — quarantined legacy history + read-only reconciliation; не adopt в активный pair и не cleanup original. Size=0 неизвестного legacy entry не означает пустой файл. Применение old digest требует соответствующего git-blob hash algorithm, а не raw SHA1. Local dirty content не объявляется baselineApplied по непроверенному global map.

### Storage cutover protocol

1. Quiesce affected writes, собрать registry всех active/retired generations и old pending intents.
2. Сделать проверяемые backups settings/manifest/operation/Drive v1/v2/v3 state; сохранить hashes и source versions.
3. Создать new generation, перенести baseline/queue/IDs/reserved IDs/upload URLs+offsets/proposals/receipts/tombstones/recovery refs без effects.
4. Проверить counts, hashes, ownership, ref existence и импортированные preconditions; orphan/future/corrupt state не игнорировать.
5. Dry-run diff old/new equivalent resolved behavior; unsafe differences требуют explicit reconcile, не auto activation.
6. Опубликовать verified import receipt, затем atomic registry/settings writer fence и active pointer. Crash до pointer оставляет старое active; после pointer — новое с reconstructable receipt.
7. Old generation retained до reachability/rollback contract, не удаляется сразу после успешного запуска.

Writer schema и effect protocol versions разделены. Supported downgrade обязан читать fence и отказаться от writes. Нельзя гарантировать, что произвольная старая сборка, игнорирующая marker, сама остановится: downgrade procedure отключает несовместимый plugin/writer и допускает только проверенный rollback artifact. Restoring старый backup после новых remote effects не откатывает Drive; нужен forward reconciliation, не blind copy-over.

## R12.5. Inbox, proposals и разрешения

Entry: stable id, job/pair/generation, object/intent IDs, local/remote versions, reason, evidence revision, payload refs, available actions. Открытие окна не исполняет действия. Закрытие progress/inbox/conflict-inspector только скрывает окно или оставляет решение deferred; оно не отменяет весь run. Закрытие отдельного обязательного диалога подтверждения запуска означает отказ от этого запуска по R10.1. Action payload содержит exact expected revision; stale response возвращает replan-required с обновлённым preview. Все действия журналируются идемпотентно; одинаковый click ID не создаёт новую publication.

| Action | Prerequisites / эффект |
|---|---|
| Probe/retry | Read-only fresh ID/root/permission/local state; unknown закрывается только достаточным evidence |
| Acknowledge | Закрывает необходимость просмотра конкретного proposal revision; не принимает bytes автоматически и не удаляет copy |
| Decline | Отмечает proposal revision отклонённой; canonical baseline не меняется; повтор той же версии не создаёт copy; новые bytes создают новую version |
| Accept remote | Preview replacement L, durable local preimage, fresh remote ID/digest; L получает verified R; сохраняет recovery/copy |
| Publish-new | Явное согласие на новый ID/возможные новые ссылки; unique reserved target, duplicate collision guard; не masquerade existing-ID update |
| Rebind | Проверенный replacement object ID в выбранном root + content comparison/ownership transfer; прежняя lineage сохраняется; не выбор первого same-name |
| Detach | Прекращает управление после settlement/quarantine unresolved intents; не удаляет remote/local data; retained history препятствует silent reacquisition |
| Restore-known | Same-ID untrash/download, exact tombstone/inbox revision, permissions, unchanged target/consent; lost response сохраняет intent |
| Export survivor | Локальный sibling/export с host guard и unique target; не закрывает unknown remote evidence автоматически |
| Edited peer artifact publication | Новый verified proposal version, не overwrite чужой копии; origin/receipt и payload digest сохраняются |

Proposal identity включает pair/generation/origin ID+version+hash/kind/payload hash; publication ID отделён от mutation attempt ID. `first→second→first` на одном base не создаёт третью identical publication. Peer receipt проверяет public marker как untrusted input, parent/root/origin/version/digest, не имя файла. Native/weak digest/relocated/permission failures не принимаются silently. Unmarked legacy copies импортируются явно. Нет автоматического TTL deletion пользовательских copies.

## R12.6. Persistence, compaction и GC

Layout наследует `pluginDir/sync-state-vnext/`: registry/authority, jobs/<hashedId>/<generation>/{checkpoint,event segments,queue projection}, migrations, recovery blobs/pins. Actual IDs лежат внутри verified envelopes; hash filename не identity proof. Remote session URLs/secrets не экспортируются через обычную диагностику; protection scope включает все поколения/temps/backups.

Effect state machine: planned → prepared (preimage/payload/lease durable) → effect-started → verified-applied или verified-not-applied или unknown → committed → settled. Baseline только после verified-applied/verified adoption; lost response не создаёт ложный negative receipt. Atomic batch journal receipt связывает state delta с mutation result. Queue и inbox — восстановимые projections, не единственное место lineage.

Compaction: verified append events, threshold 1000/4 MiB; новый full snapshot + checksum/readback до переключения head; latest и previous verified anchors сохраняются, покрытые events retire после доказанного recovery closure. Warm no-op не публикует checkpoint. Disk-full/cleanup-failure ограничивает **новые** affected writes, не удаляет последний valid history anchor и не повторяет upload.

### GC barriers

GC сначала фиксирует registry generation и полный root set, затем reader/executor/migration live pins и durable reservations. Roots: active/retired jobs, pending/unknown intents, proposals/peer receipts, tombstones/compact lineage, migration/rollback backups, last+previous checkpoints, live stage blobs. Пользовательский журнал не владеет recovery refs; clear journal не снимает pins.

Mark → verify candidates/age/ownership → acquire GC publication barrier → re-read generation и live pins → sweep only still-unreachable → record cleanup receipt. Изменение root set перезапускает/исключает candidates. Time cutoff сам по себе не защищает новый pin на старый blob. Chunk/temp release после abort учитывает late physical writers.

| Файлы | Правило |
|---|---|
| Active checkpoint/event segments | Latest+previous verified anchors, pending refs и reconstructable event chain всегда сохраняются |
| Retired manifest namespace и .previous/.bak | Удаляются только после registry retirement/reconciliation и отсутствия queue/pending/migration/rollback refs; active .previous не «мусор» по расширению |
| sync-operations-v3-checkpoint-* | Legacy importer/retention registry; sequence в имени не число файлов. Удаление только после verified replacement history и roots |
| Corrupt quarantine | Не silent delete. Видимое retained bytes/reason; explicit export/discard разрешён только при отсутствии required recovery role, с отдельным consent |
| .tmp | Unique writer/intent-owned names; live writer/physical request pin запрещает удаление. Stale owner подтверждён recovery, не только возрастом |
| Recovery blobs | Content-addressed, verify перед restore; remove только unreachable после barrier; byte-budget не оправдывает потерю preimage |
| Tombstones | 90 дней detailed, затем compact permanent lineage до explicit detach/reconcile; срок не даёт права resurrection |
| User conflict/proposal copies | Не GC payloads по имени/TTL; explicit lifecycle action, originals сохраняются до подтверждённой альтернативы |

Maintenance UI показывает counts/bytes: reclaimable, pinned, quarantined, retired and protected; причины удержания раскрываются до intent/receipt. «Очистить безопасный мусор» не меняет sync outcome и не удаляет все *.previous по glob. Failure cleanup вызывает maintenance retry с budget, не новый transfer cycle. Нет обещания общего конечного размера при бесконечном числе unresolved user copies; bounded automatic metadata growth и видимое давление на storage — отдельный контракт.

## R12.7. Gate existing-ID update и дополнительные capabilities

Gate остаётся CLOSED до доказанного протокола remote race safety: свежий inspect сам по себе не CAS. Нужны документированная поддержка условной записи/эквивалентный protocol с проверяемой семантикой, foreign-client race tests, same ID/link/permissions preservation, lost-response reconciliation, bounded revisions и rollback. Если сервис не даёт достаточного atomic primitive, capability остаётся закрыта; не объявлять gate выполненным только на serial fake API.

Rename/empty-folder sync, Shared Drives, native export/shortcuts и mobile OAuth имеют независимые capability records с platform/provider evidence. Закрытый gate не мешает выпуску честно ограниченного профиля, но UI запрещает соответствующие actions. Native export нельзя объявлять bidirectional roundtrip без отдельной mapping/format/conflict спецификации. Unsupported objects остаются в tree и coverage, но не становятся deletion evidence.

## R12.8. Tree, preview, status и public API

Один JobSnapshot/Event stream питает workspace/popover/statusbar/journal. Schedule, activity, blocker, result и convergence — отдельные поля. Для startup-only после завершения показывать «Только при запуске; цикл завершён», а не «Автосинхронизация выключена». Mandatory VAM block имеет CTA/документацию и не меняет schedule.

Tree row key — provider+pair+objectId+projection edge; local-only row — stable local item ID. Duplicate folders раскрываются независимо. Filter/search/page/re-render не теряют selected row, focused control, details expanded и scroll anchor. Partial/stale snapshot имеет возраст, coverage markers, retry; ошибка нового browse сохраняет старую историю picker. Loading не заменяется empty-tree.

Inspector показывает effective profile, participation, owner, binding anchor, overridden axes и provenance; blocked/unsupported элементы имеют reason и доступное действие. Exact ID exclusion и anchor assignment редактируются без преобразования в ambiguous path. UI preview показывает canonical changes, copies, trash, recovery, transfer limits и какие решения обязательны.

Bidir-limited capability видима до включения и в каждом relevant preview: «Правки существующих Drive-файлов публикуются как предложения; основной локальный файл сохраняется до решения». Никаких claims «полная двусторонняя» при закрытом overwrite gate. Нельзя скрыть локальную правку в excluded copy без явного предупреждения/действия.

Keyboard tree/button semantics, aria labels/live status и focus return обязательны. Virtualized rows не теряют accessible name/level/expanded; pagination остаётся доступной альтернативой. Скролл и 10000-row rendering измеряются. Locale keys централизованы; provider diagnostic payload не содержит готовый язык для машинных решений.

`window.vaultSync` сохраняет совместимый aggregate projection плюс versioned jobs/results API; legacy consumer не получает token/session URL/body. Новые outcomes не silently cast в old success; adapter отображает unknown/non-success консервативно и объявляет version. Listeners dispose и stale epoch не обновляют новый state.

## R12.9. No release by documentation alone

Implementations не обязаны иметь именно перечисленные имена классов. Наличие/отсутствие символа `JobManager` не критерий корректности; тестируются contracts. Но все entrypoints обязаны иметь трассируемый путь через одну policy/result/authority модель. Старые планы и comments помечаются superseded, build/test metrics хранят commit/date/command; изменение документа не выдаётся за исправление runtime.
