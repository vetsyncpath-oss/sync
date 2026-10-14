# S0b: implemented proposal and artifact contract

Дата: 2026-10-14, Europe/Moscow. Сборка: `overhaul-s0-proposals-2026-10-14`. Документ описывает runtime этого участка, а не полную готовность [target contracts](README.md).

> Исторический контракт S0b (checkpoint 2). Текущий store/fence расширен [S0c amendment](08-s0c-lifecycle.md) до schema 3; остальной proposal/artifact protocol сохраняется.

## Состояние и upgrade

Drive namespace и имя `drive-state-<namespace>-<sequence>.json` сохраняются. Envelope имеет SHA-256 verified payload; payload schema — **2**. Поля baseline/pending/reviews сохранены, добавлены proposals и artifacts. `reviews[path]` — совместимая последняя pointer, не источник истины для полной истории.

V1 load выполняет deterministic import в памяти, без remote reserve/create и без settings edits. Pending сохраняет original intent/copy/upload IDs, local expected version, immutable bytes/copyBytes, resumable URL/offset/fileId/size и directory reservations. Legacy review получает deterministic ID; неизвестный origin не выводится из имени. Old copies остаются `portable:false`, их metadata не меняется автоматически.

До effects, включая replay уже reserved legacy intent, сохраняется v2 checkpoint. Сначала создаётся и проверяется один immutable `drive-state-<namespace>-v1-backup.json` с исходными retained v1 envelopes. После публикации остаются latest + previous checkpoints; backup хранится отдельно и не попадает в обычную compaction. Повтор upgrade не создаёт новые proposal IDs/backups. Старый v1 validator отвергает newest v2 schema; это Drive writer fence, не общий settings/registry fence будущего S1.

Corrupt/future checkpoint, invalid locator/payload types, corrupt backup и backup без active checkpoint не становятся empty-history state. Backup-only domain остаётся GC root, но effects blocked. Если после backup и до v2 fence старый writer опубликовал новую v1 generation, повторный import blocked: original/current envelopes и refs сохранены для verified reconciliation. Backup не перезаписывается неполной историей.

`driveRecoveryReferences` учитывает все namespaces/generations, proposal payloads и pending refs из backup. GC также разрешает old review hashes в существующие recovery paths, даже если старый формат не сохранил payload pointer. Такой объект защищается от очистки; существование/размер не выдаются за проверку его содержимого. Missing legacy bytes не создаются и не объявляются recoverable. Retention preview и фактическая cleanup используют эти же roots. Live-pin barrier, importer receipts для shared ledger и retired namespace cleanup остаются S4 gates.

## Proposals и повтор выполнения

Proposal ID отделён от ID попытки локальной mutation. Dedup key содержит namespace, canonical origin ID/version/SHA-256, proposed payload SHA-256 и kind: conflict, gated-upload, delete-edit-local или delete-edit-remote. На том же canonical base повтор первой версии после второй возвращает прежние copy ID/path/payload. Другая base version или payload даёт новое предложение.

Prepare фиксирует payload reference, immutable lineage и pending. Reserve фиксирует nonempty copy ID до publication; lost completion probes тот же ID. Actual parent/name берутся из fresh origin ID, а не из spelling mapping: exact-file mapping с другой case/NFC формой сохраняет правильный sibling. Unsafe ancestor segment не может притвориться несколькими обычными сегментами joined path. Если API не даёт SHA-256, проверка recovered copy дополнительно скачивает и хеширует фактические bytes; size/MD5/public marker не заменяют strong digest. После verified remote + local copy proposal становится `published`; canonical replacement идёт после этого с CAS/preimage. New local edit supersedes попытку, но прежний proposal/payload остаётся. Legacy proposal нельзя молча преобразовать с потерей IDs/refs.

`published` не означает canonical convergence. Gated proposals остаются attention; только подтверждённые local primary и canonical remote ID с proposal digest закрывают matching proposal как `converged`. Остальная история сохраняется. Last-review pointer больше не стирает другие предложения. Если proposal history доказывает прежний ID, а baseline отсутствует, pipeline блокирует guessed create; полный tombstone для остальных файлов ещё не реализован.

Default admission limit — 10,000 proposals на namespace. Matching reuse разрешён и при лимите; новые proposals blocked с сохранением original bytes, независимые файлы продолжаются. Legacy history сверх лимита читается/сохраняется, не обрезается. Recovery payloads пока retained и после convergence; release/retention actions требуют следующего этапа. Действует существующий recovery budget 512 MiB. Это ограничение записи, а не автоматическое удаление пользовательских копий.

## Portable metadata

Создаются семь public Drive `properties`; account, local path, OAuth data и resumable URL туда не помещаются:

| Key | Value |
|---|---|
| `vetsync_artifact` | Protocol `1` |
| `vetsync_proposal` | UUID proposal |
| `vetsync_origin` | Canonical origin file ID |
| `vetsync_payload` | SHA-256 immutable proposal bytes |
| `vetsync_base_version` | Opaque decimal origin version |
| `vetsync_base_hash` | SHA-256 canonical base |
| `vetsync_kind` | Proposal kind |

Public properties доступны другим OAuth clients с доступом к файлу; private appProperties для этого не используются. По [Google custom properties contract](https://developers.google.com/workspace/drive/api/guides/properties): максимум 100 custom properties суммарно, 30 public на файл, 30 private на приложение, и 124 UTF-8 bytes key+value для каждой. Наш create содержит семь public keys и проверяет byte limits до remote effect. Parsed metadata ограничены по количеству/type/size; marker — untrusted claim, не authority.

## Передача между vaults

Artifacts исключены из canonical/pull manifest. Raw ID browse сохраняет их, помечает proposal claim, invalid marker или legacy copy; inspector показывает origin/proposal IDs, отдельное canonical assignment disabled. Новый receiver работает только в явно bidirectional области.

Admission требует:

1. Валидные protocol/UUID/kind/digests/version, binary object и отличающийся origin ID.
2. Origin inspect по ID с fresh selected-root/ancestor проверкой, даже когда origin явно trashed и отсутствует в listing.
3. Один actual parent у origin/artifact и exact generated sibling name от origin, proposal UUID и label. Origin сам не artifact.
4. Included origin binding: exact/named selector, source ownership, remote/local scope/exclusions и hard path protections. Artifact отдельно проверяется на unsafe/control paths и explicit exclusions. Marker не разрешает другой источник или own plugin directory.
5. Collision projection всех artifact targets до writes; разные IDs на один target blocked как группа. Несколько local destinations одного origin blocked до S1 ownership contract.
6. Fresh artifact metadata, SHA-256 фактических downloaded bytes, повторные root/version/lineage checks и fresh origin check после transfer, непосредственно перед exclusive create.

Create проходит через общий DurableMutations/host guard. Если local bytes уже совпадают, receipt adopts без transfer. Warm artifact run не пишет checkpoint, но проверяет metadata/parents и local hashes; zero metadata writes не означает zero API requests. Existing-ID content update gate остаётся включён.

## Ошибки, удаление и UI

Received artifact receipt хранит file ID, proposal/origin IDs, local/remote path, immutable hash и observed remote version. Local edit/missing, remote edit/trash/404, marker/lineage change сохраняют issue и не приводят к upload, replacement или trash. Explicit scan может восстановить missing artifact после тех же guards. Artifact не становится primary и не порождает recursive conflict copies.

Unverified новый claim с недоступным/out-of-root origin показывается pending в run results/raw tree; его нельзя привязать к guessed local path. Canonical unknown inbox реализован в S0c; unverified artifact claim inbox и полный набор resolution actions остаются последующим участком. Transfer errors используют bounded retry queue с origin routing hint; hint сам не authorizes effect. Manual targeted retry повторно проверяет lineage. Файловая ошибка не останавливает независимый canonical download; fatal checkpoint/shared store/auth/root failure останавливает зависимые effects.

Prepared trash дополнительно проверяет текущую deletion policy: переход на `keep` блокирует replay без стирания pending/copies. Outgoing copy также проверяет current scope/exclusions; если обязательная копия исключена, primary не откатывается и publication blocked. Remote trash проверяет local editor guard и missing evidence ещё раз: surviving unsaved editor не является доказанным local deletion. Ошибка чтения saved editor state — typed file issue. Это не полный immutable operation-graph policy compiler S1/S3.

Результаты показывают unique pending paths и proposal count; до 50 copy paths на строку, полная история остаётся в store. Закрытие review, выбор версии, публикация edited peer artifact, legacy explicit import и пользовательское удаление artifacts пока не имеют полного inbox UI. Payload/history не очищаются под видом metadata maintenance.

## Доказательства и границы

`tests/drive-peer-host.test.ts` вызывает настоящий `Plugin.executeSync`, RoutedSource, GDriveOAuthSource, PathPolicy и named mount. Проверены два vaults, copy-before-trash с trashed origin, exclusions, protected plugin, forged marker/name/digest, duplicate artifact IDs, root move during download, lost/edited/missing copies и origin-routed targeted retry. API/host storage — fake, не Google/Obsidian live account.

`tests/drive-state-v2.test.ts` покрывает read-only import, backup/write failure, crash после backup, stable replay/import, future/corrupt stores и backup-only GC roots. Coordinator tests проверяют content/base dedup, convergence/history, legacy replay fence, published-copy 404, admission budget и current keep-deletions guard. Tree/results tests проверяют UI distinction и отображение нескольких копий.

A07–A09 получили fixture evidence; A65/A69–A71 покрыты частично. A80–A87 остаются release gates. Pair namespace reconcile, full canonical tombstones, global ownership/remote reservations, per-job runtime, pin-aware GC, atomic foreign-client races и installable package этим участком не объявлены готовыми.
