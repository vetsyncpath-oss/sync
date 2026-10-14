# S0c: canonical unknown inbox и история удалений

Дата: 2026-10-14, Europe/Moscow. Сборка: `overhaul-s0-lifecycle-2026-10-14`. Контракт реализованного участка дополняет [S0b](07-s0b-proposals.md); полный [overhaul](README.md) ещё не включён.

## Identity и неизвестность

Перед canonical planning выполняется targeted inspect actual ID с проверкой selected root/assigned path. Fresh metadata имеет приоритет над listing; download относится к этой версии. Tracked rename не становится bootstrap download по другому пути. Другой ID по прежнему имени нельзя принять даже при одинаковых bytes.

| Наблюдение | Durable blocker |
|---|---|
| Tracked 404 / object-specific permission 403 | `drive-unavailable`, HTTP status, прежний ID и local version |
| Root/path изменился | `drive-relocated`; mapping автоматически не переносится |
| Прежний путь занял другой ID | `drive-identity-changed`, оба IDs |
| Native/artifact role изменились | `drive-unsupported`; primary writes blocked |
| Actual ID жив по прежнему path, но не вошёл в inventory | `drive-unlisted`; это не deletion evidence |
| После tombstone появился local файл / original untrashed | `drive-deleted-review`; без guessed new-ID create/download/trash |

Quota 403 и shared auth errors остаются typed retry/auth failures. Local read failure не считается deletion. Unknown переводит прежний transient retry в durable attention: retry projection снимается после сохранения inbox, исходный pending intent/payload не закрывается. Это предотвращает немедленный цикл просроченных retries. Stable inbox ID/revision хранит versions/hash/trash/local expected version/time/HTTP status/proposal links. Одинаковый повтор не пишет checkpoint. Unknown не исчезает после local deletion, scan, UI close или TTL. Initial unknown identity сохраняется даже без baseline. Возврат actual original в прежнюю scope позволяет закрыть access blocker; read-only probe не acknowledges новые canonical bytes.

## Tombstones и crash accounting

Fresh explicit trash и local missing позволяют сохранить original canonical baseline (ID/version/digests/path), deletion intent/receipt ID, actual trash version/time и доступный staged survivor payload. Baseline/pending уходят только в checkpoint с tombstone. Local trash повторно проверяет, что remote deletion не отозван и версия прежняя; remote trash проверяет approved version непосредственно перед PATCH и actual postcondition после него. Перед ack ещё раз проверяются remote trash/version и local missing.

Недоступность/relocation на pending replay также создаёт canonical inbox без удаления intent/IDs/payload. Lost checkpoint acknowledgement после local/remote trash сохраняет pending. Replay reconstructs тот же lineage; missing local после applied trash не стирает staged payload. Tombstones не удаляются по возрасту: проверен offline 100 дней. Пока S4 compaction отсутствует, хранится полная последняя lifecycle запись пути; это более консервативно, чем target summary после 90 дней. Полный event history нескольких delete/restore cycles ещё не реализован. Restore помечает текущий tombstone `restoredAt`, сохраняя его ID/evidence.

## UI и guarded actions

Команда **«Drive: неизвестные состояния и удаления»** и одноимённая кнопка в Recovery открывают retained namespaces, включая inactive history. Список показывает причины, оба IDs, HTTP status, remote version и proposal links; quiet tombstones видимы. Поиск/pagination 100, failure-preserving read и закрытие не запускают effects.

- **Проверить доступ и состояние**: targeted read-only file operation. Refresh может изменить inbox metadata. Pull execution, mutation recovery, artifact receiver, upload/trash/canonical write не запускаются. Quiet tombstone после explicit probe становится restore preview. Pending effects этой кнопкой не исполняются/закрываются.
- **Восстановить прежний объект**: отдельный preview/consent. Требуются active exact namespace/current policy, known tombstone, fresh root/path, тот же inbox revision/local version/remote version/trash flag, strong API SHA-256 и download/untrash permission. UI объясняет отсутствие SHA/permission. Generic 404 не имеет этого действия.
- Restore делает только same-ID untrash при необходимости и verified canonical download. Existing-ID content upload не включён. Local replacement сохраняет preimage и использует supported CAS; dirty/stale target blocked. Соседние canonical files и peer artifacts этим action не скачиваются. Unresolved pending сначала requires accounting.
- До запроса сохраняются `restore-known` intent и затем `untrash-started`. Lost response проверяется по тому же ID/root/path/approved digest без reserve нового ID. После download проверяются full SHA и fresh remote version. Changed bytes/owner оставляют pending; baseline ack и `restoredAt` сохраняются вместе.

Inactive account/root/mapping нельзя разрешить через другой active pair. Control action сообщает ошибку при unavailable namespace/path или stale preview. Rebind, publish-new, detach, proposal acknowledge/decline, legacy import и edited artifact publication пока недоступны. Полные Job card/tree annotations/inbox inspector — S1/S2. Strict combined inventories ещё могут остановить targeted probe из-за другого selected source/collision; independent per-job execution не включён.

## Storage amendment: checkpoint 3

Schema **3**, reader **1/2/3**, namespace/filenames сохранены. Добавлены inbox/tombstones/restore intent. Это semantic writer fence: S0b reader 2 отвергает новый checkpoint до effects. Settings/OperationStore schemas и physical layout прежние.

Import v1/v2 в памяти сохраняет proposals/receipts, payloads, pending IDs/directories/resumable URL/offset. До первого effect публикуется schema 3; до retirement retained generations immutable SHA-verified `v1-backup.json` и/или `v2-backup.json` сохраняют original envelopes. Один backup каждого исходного формата, без нового backup на каждый run. Backup-only active history loss, future/corrupt schema/backup, advanced legacy writer после backup и schema regression блокируют empty reset/effects.

GC roots: current latest+previous, pending/proposal/tombstone payloads, оба backups и legacy hash-only recovery objects. Backup-only domain остаётся root при blocked writes. Saved deleted survivor остаётся читаемым после actual GC. Backups автоматически не удаляются. Pin-aware GC, retired namespace cleanup, delta persistence, settings registry fence и concurrent writers — S4/S1 gates. История уже стёртых до upgrade baselines не восстанавливается из имени.

## Evidence и ограничения

`npm run verify`: **490/490**, TypeScript, styles, production build. S0c добавляет 37 regression tests к 453 S0b: actual host dispatch, root/ID/403 classification, v1/v2 imports, stale previews, dirty editor, capabilities, preimage/GC, withdrawn trash, crash до tombstone ack, lost untrash response и failure-preserving UI.

[25 probes](../audits/overhaul-s0c-probes.json): прежние 20 плюс пять lifecycle measurements. Historical snapshots сохранены. Warm 1/20/100 canonical files и одинаковый 404 повтор — zero checkpoint writes. Это fake API/FS/DOM evidence, не live Google/Obsidian acceptance. A26/A28/A30/A33/A34/A45/A47/A65/A69–A71 покрыты только указанными seams. Foreign-client inspect/PATCH race, namespace reconcile/shared authority, independent jobs, generic internal-error separation и startup finishing ещё не проверены/не включены.
