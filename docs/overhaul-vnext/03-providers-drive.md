# Провайдеры, Drive tree и двусторонняя модель

Нормативная часть [Overhaul vNext](README.md). Провайдер сообщает наблюдения и capabilities; решение о файлах принимает общий planner с policy и baseline.

## 1. Provider contracts

```ts
interface ProviderConnection {
  connectionId: ConnectionId;
  openRun(ctx: ProviderRunInput): Promise<ProviderRun>;
  disposeConnection(): Promise<void>;
}
interface ProviderRun {
  snapshot(signal: AbortSignal): Promise<RunSnapshot>;
  inspect(locator: RemoteLocator, signal: AbortSignal): Promise<RemoteObservation>;
  download(locator: RemoteLocator, expected: RemoteObservation,
    signal: AbortSignal): Promise<VerifiedPayload>;
  capabilities(locator?: RemoteLocator): ProviderCapabilities;
  disposeRun(): Promise<void>;
}
interface WritableProviderRun extends ProviderRun {
  reserveCreate(parent: RemoteLocator, name: string): Promise<ReservedRemoteId>;
  publishNew(intent: PreparedRemoteIntent): Promise<EffectObservation>;
  trash(intent: PreparedRemoteIntent): Promise<EffectObservation>;
  restore?(intent: PreparedRemoteIntent): Promise<EffectObservation>;
  probe(intent: PreparedRemoteIntent): Promise<EffectObservation>;
}
```

Writer методы не возвращают только boolean. Postcondition содержит ID/version/digest/trashed/parent evidence либо `unknown` с reason. Download locator привязан к provider object и run revision, не только `path`. Provider capabilities разделяют inspect/read/list, create, trash, restore, conditional replacement, streaming и immutable inventory deletion evidence. OAuth scope сам по себе не доказывает object permission.

Optional restore метод доступен только при verified restore capability. Методы rename/move/existing-ID content replacement добавляются отдельными capability amendments; наличие writable interface не делает их разрешёнными. Все writer порты требуют prepared intent из общей authority, обычный browse порт не имеет mutation методов.

Legacy SyncSource adapters сохраняются на transition. Git immutable commit/tree может давать соответствующую mirror evidence; ZIP, WebDAV и другие источники сохраняют реально доказанную capability, не получают immutable по умолчанию. Проверка inventory, retries и parsing не пропадает при переносе orchestration.

ZIP connection может переиспользовать HTTP setup, но archive и manifest обновляются на run и удаляются в finally. Drive HTTP/auth reusable, inventory cache keyed run/snapshot с явным refresh. Git locators удерживают snapshot commit, не меняются при движении branch во время downloads. UI browse requests имеют собственную bounded session и request token.

## 2. Raw remote graph

```ts
interface RemoteNode {
  nodeKey: string; // provider namespace + objectId + parent edge, opaque
  objectId: string; parentId?: string; kind: 'file' | 'folder' | 'unsupported';
  name: string; displayPath?: string; version?: string;
  checksum?: ContentDigest; size?: number; mimeType?: string;
  observations: readonly RemoteDiagnostic[];
}
interface RunSnapshot {
  snapshotId: string; root: RemoteLocator; nodes: readonly RemoteNode[];
  observedAt: number; completeness: 'complete' | 'partial' | 'unstable';
  deletionEvidence: 'immutable' | 'object-specific' | 'none';
}
```

Browse API не требует уникальных paths. Drive names внутри папки не уникальны; folders с одинаковым именем — тоже отдельные nodes. Tree сохраняет обе ветви, short ID badge и полный ID в inspector. Parent edge используется для node selection: path — display label, а не identity. Unsafe/unsupported/excluded nodes видимы с причиной; они не становятся executable entries автоматически.

Inventory ingest различает:

| Diagnostic | Значение и действие |
|---|---|
| `repeated-object` | Тот же ID на двух страницах с одинаковой metadata: один node, диагностическое событие; не path collision |
| `inconsistent-object` | Тот же ID, разные versions/parents/metadata: unstable snapshot, targeted refresh; dependent effects запрещены |
| `duplicate-sibling-name` | Разные IDs, один parent/name: обе строки, mapping требуется для затронутых included targets |
| `target-alias` | Разные IDs после projection совпадают case/NFC: блок target group |
| `file-directory-overlap` | File/dir либо ancestor conflict в local destination: блок зависимой target group |
| `unsafe-target` | Нельзя представить remote имя в допустимом vault path: browse разрешён, execution требует explicit map |
| `mapping-collision` | Разные remote routes дают одну local цель: diagnostic содержит обе rule witnesses |
| `incomplete-listing` | Missing page/cursor cycle/limit/access error: partial browse, не deletion evidence |

Повторный ID можно дедуплицировать только после проверки совпадения metadata, не по имени/пути. Разные IDs никогда не дедуплицируются молча. Политика/unsupported фильтры применяются до проверки **executable** target collisions, сохраняя raw diagnostics. Unsupported Docs с именем бинарного файла не блокирует его загрузку, если Docs не participates. Hard-protected own plugin path показывается protected, а не generic collision.

Projection содержит `bindingId`, remote ID/parent, local target, effective policy, lineage и blockers. Проверка local target выполняется после mappings/include/exclude и учитывает reserved local paths всех jobs. «Один файл в `.obsidian/plugins/…`» тестируется как самостоятельный допустимый browse case; own plugin protected, other plugin code зависит от allowPlugins/package guard.

## 3. Выбор Drive root и OAuth

Connection хранит verified account subject, SecretStorage reference, OAuth client reference и выбранный **folder ID**, а не path. Picker открывает доступные actual folder objects; root `My Drive` разрешается в настоящий ID перед pair identity. Folder rename не переинициализирует pair; изменения parent/доступа видны через inspect.

Перед активацией bidirectional проверяется требуемый grant. Ранее выданный `drive.readonly` не становится writable из-за settings edit: потребуется явная reauthorization с full `https://www.googleapis.com/auth/drive`. `openid` нужен для verified sub; `email` только для display при использовании. Account email не является binding key.

Сохраняются desktop PKCE S256/state, loopback `127.0.0.1`, проверки callback host/path/method и single-use code. Общий login deadline — текущие 5 минут; exchange/refresh — 60 секунд с logical timeout и abort. Modal показывает stages, copy/open auth URL, cancel и истёкший срок. Page `accounts.google.ru/SetSID` относится к внешнему browser flow; плагин обязан закончить ожидание и дать повтор, а не обещать исправление Google redirect.

AccountContext shared по client/grant: refresh singleflight и один 401 replay. Logout connection и revoke shared account — отдельные действия; первое не удаляет token, который нужен другому job. Credential ref cleanup учитывает active drafts/jobs/retired effects. Секрет не удаляется при обычной смене remote folder. Поддержка delete/revoke проверяется реальным SecretStorage/API port, не выводится из записи пустой строки.

## 4. Объектные наблюдения и матрица

Remote states: present (ID/version/digest/parent), explicitly-trashed, new-name-absent при complete parent observation, unavailable, relocated, unsupported. Listing отсутствие tracked ID и 404 не доказывают trash. Tracked local missing устанавливается host stat и editor checks; ошибки чтения/сканирования не означают deletion.

Baseline хранит accepted canonical local+remote digests/ID/version и отдельную lifecycle history. Metadata version сравнивается как opaque decimal string, не JavaScript number. MD5/size для API verification и SHA-256 transfer digest не смешиваются; слабый token не признаётся локальным content hash.

| Baseline / local / remote | Решение нового bidirectional профиля |
|---|---|
| Нет baseline, обе стороны одинаковы по подтверждённому digest | Adopt без transfer; baseline пишется один раз |
| Нет baseline, remote есть, local missing | Create local после verified download |
| Нет baseline, local есть, remote name отсутствует в проверенном parent | Publish new reserved ID; no overwrite |
| Нет baseline, обе есть и отличаются | Bootstrap conflict, не last-modified-wins |
| Baseline есть, обе canonical версии неизменны | No-op: без per-file baseline saves |
| Local неизменён, remote изменён | Ordinary download с local CAS/preimage, не conflict |
| Local изменён, remote неизменён | Intended upload; existing-ID gate создаёт review proposal, а не заменяет исходный ID |
| Обе изменены и now equal | Adopt подтверждённых canonical versions; copy не нужна |
| Обе изменены и различны | Keep-both/ask с сохранением обеих версий и explicit divergence |
| Local missing, remote unchanged, tracked | Trash remote через recorded ID, fresh evidence, durable intent |
| Local unchanged, tracked remote explicitly trashed | Trash local через host trash после freshness/CAS checks |
| Local deleted, remote edited | Delete/edit: сохранить edited content в видимую copy, затем исполнять разрешённое решение по original |
| Local edited, remote explicitly trashed | Delete/edit: сохранить local edit в durable snapshot и видимые artifacts; не терять его при trash |
| Local missing, remote explicitly trashed | Settle tracked tombstone; повторное создание не выводится из удаления baseline |
| Remote inaccessible/404/неполный inventory | Unknown inbox + safe probes, без local trash и guessed upload |
| Local scan failed / dirty editor | Unknown/local-change blocker; никаких delete/replace effects |
| Tracked ID существует вне selected root или renamed | Relocation review; не удаление и не automatic duplicate upload |

`deletion: keep` отменяет propagation, но не стирает evidence. Восстановление canonical missing стороны допускается только при verified object/parent и explicit policy; оно не пересоздаёт unavailable tracked объект вслепую. Pull profiles внутри этого же Drive job используют pull semantics, без remote upload/trash.

## 5. Effect sequences

New upload: confirm writable binding/parent → reserve generated ID → persist stable payload+intent+parent/name reservations → resumable start → persist URL/offset ack → chunks → probe completion → verify ID/parent/name/content digest → receipt → baseline. Lost response не создаёт другой file ID. 409 требует inspect того же reserved ID и проверку payload, не автоматически success.

Resume Range/offset трактуются по API contract, chunks не пропускаются по локальной догадке. Expired session создаёт новый resumable session **с тем же reserved object ID**, предварительно проверяя, не завершилась ли предыдущая. Payload immutable; новый local edit становится новым proposal/plan, не заменяет bytes внутри pending intent. Текущие 8 MiB chunks и per-file limits сохраняются до benchmark/streaming gate.

Remote trash: inspect recorded ID/parent/version/digest → verify unchanged/local deletion evidence → prepare intent → PATCH `trashed=true` → inspect postcondition → receipt/tombstone. Это не atomic CAS с чужой записью между inspect и PATCH; residual race подтверждается live tests и показывается в capability contract. Hard delete запрещён. Тот же ID из trash может быть восстановлен только по explicit restore intent; untrash не даёт права затереть его содержимое.

Local replacement: verified remote payload → capture preimage → durable prepare → assert owner+dirty editor+expected digest → supported host compare-and-write → verify bytes → receipt → baseline. Existing binary replacement без подходящего host primitive blocked; нельзя fallback на `writeBinary` после failed CAS. Exclusive create и существование hidden files проверяются host adapter.

Copy-before-trash/replacement — operation group. Baseline и completion group не подтверждаются, пока обязательные копии и final effect не verified. Crash после одного copy не создаёт новый copy ID при retry. Изменение источника после staging делает plan stale; prepared old snapshot остаётся recovery reference.

## 6. Proposals и conflict artifacts

Review proposal адресуется ID; один path может иметь несколько proposals. Dedup key: pair + logical file + canonical base ID/version/digests + proposed payload digest + intent kind. Повтор идентичного предложения возвращает существующий proposal; новый base или bytes создают новое. Cycle `first → second → first` на том же base не публикует третью одинаковую копию.

Gated upload сохраняет proposed local bytes локально и в новом remote artifact ID. Canonical remote ID остаётся прежним. Возврат local primary к remote canonical допустим только после verified copies и local CAS; при dirty/stale/unsupported host primary остаётся divergent с review reason. Нельзя обещать «две стороны синхронизированы» только потому, что proposal uploaded.

Artifact содержит namespaced portable lineage: protocol version, proposal/intent ID, origin object ID и payload digest. Для обмена между vaults разных OAuth clients нельзя полагаться только на private `appProperties`: нужен проверенный portable marker в поддерживаемой metadata, например namespaced `properties`, с соблюдением API limits. Marker считается untrusted input, валидируется и не даёт прав вне scope.

Peer artifact получает поведение origin binding, включая named selector, **только** при валидной lineage и входящем root/owner. Это обходит ошибку, где суффикс `.conflict-*` автоматически прячет копии на втором vault. Hard protections и explicit excluded origin/subtree сохраняют приоритет. Artifact не становится canonical primary и не порождает конфликтные копии самого себя; обычный edited artifact — отдельный versioned proposal review.

Legacy `.conflict-*` без lineage не массово включаются после upgrade: UI показывает их в отдельном legacy-copy разделе, даёт explicit import/assignment. Recovery preimage/hidden backups никогда не становятся remote artifacts. Закрытие review и удаление artifacts разделены; нет автоматического TTL удаления пользовательских копий.

## 7. API полнота, ограничения и продолжение

Drive listing сохраняет pagination, depth/node/response bounds и signal checks. Недостижение полноты сообщает diagnostics и loaded subset; не подменяет пустым successful manifest. Google-native Docs/export и shortcuts требуют отдельных contracts, показываются unsupported; shortcuts нельзя обходить с escape selected root.

Project/account budgets учитывают современную quota configuration проекта; значения старых запросов/100 секунд не hardcoded как универсальные. List/download/upload имеют разные costs; принимать server hints и возвращать cooldown в JobSnapshot. Metadata-only warm run не делает N полных checkpoints, а actual transfer throughput сравнивается отдельно.

Changes feed — следующий этап: cursor commit после durable processing, reset/expired cursor вызывает non-destructive full reconcile; root membership и permissions перепроверяются. Rename/move detection использует ID lineage и ownership transfer, не path-only delete+upload. Empty folders требуют явного directory lifecycle и не появляются автоматически как delete effects. Full streaming требует chunked local snapshots/recovery и host capabilities, а не только увеличения file-size лимита.

Источники API: [Files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [trash/delete](https://developers.google.com/workspace/drive/api/guides/delete), [custom properties](https://developers.google.com/workspace/drive/api/guides/properties), [usage limits](https://developers.google.com/workspace/drive/api/guides/limits). Проверка по официальной документации не заменяет real two-vault/foreign-client tests.
