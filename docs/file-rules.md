# Vault workspace, profiles and source bindings

Open Settings → File tree. The workspace starts with the local vault; remote access is not required to open or edit it. The left panel lists named source connections, the centre shows either the vault or one selected source, and the right panel edits the selected folder/file. On narrow screens the panels stack.

## Connect a local destination

1. Select a folder or file in the vault tree.
2. Choose a named connection in Source.
3. Enter its Source path, or pick a path from that connection's separate inventory. Empty means its root; a file binding requires an exact remote file path.
4. Choose a behaviour profile, or inherit behaviour from the parent.
5. For folders, optionally select plugin code (`main.js`, `manifest.json`, `styles.css`), `data.json`, or exact comma-separated basenames.
6. Apply to draft, then Save settings. Save settings also includes unfinished inspector fields.

For example: `Yandex:/Notes → Vault:/Documents`. The reverse workflow is supported: browse a connection, select its remote folder/file, enter the destination and use Place in vault. Source bindings and profile assignments are independent: a source-only assignment inherits writing/deletion/conflict behaviour. Profiles contain behaviour only. Legacy profile source defaults are materialized into assignments during migration.

Profile selectors use vault < folder < nested folder < exact file precedence. A basename filter is more specific than all files at the same scope. Write/deletion settings use the last equal-priority assignment. Different equal-priority sources, or different remote paths at that priority, are errors. Paths and basenames compare case-insensitively with Unicode NFC normalization.

Every destination file has one winning source. A missing file never falls back to another provider. Files covered by a mount are consumed by its bindings, including nested overrides, and is not also downloaded at its original remote-relative path. Distinct source inventories can contain identical paths and metadata without being merged. Final destination collisions still fail validation.

Source names identify actual repositories, disks or endpoints, not only provider types. Multiple connections can use the same provider. Configure, Check access, Refresh contents, Set as default source, Sync this source and removal are available directly beside each connection. Referenced connections cannot be removed from the saved workspace. The default connection is a regular named connection; changing it does not hide vault assignments. Choose Assignments only to synchronize only explicitly bound destinations. A configured default that is still needed must load successfully; an invalid configuration cannot silently omit it and authorize deletion.

## Inspect and save

Each connection loads independently. An unavailable default does not block local browsing or another connection's preview. Failed refresh retains that connection's last successful snapshot with an error/stale marker. Snapshots are held for the open workspace only; reopening fetches again. Superseded or aborted responses cannot replace a newer snapshot. Source edits invalidate the old snapshot.

Local rows show their source and behaviour, inheritance/direct assignment, mixed sources, exclusions/permissions and whether a file appears in a loaded source snapshot. Projected source files can appear before they exist locally. These labels describe inventory availability; they do not guarantee a write or verify local content against the applied baseline. Large trees are paged in groups of 150 visible rows; searching traverses collapsed descendants. Enter opens an inspector, arrows expand/collapse folders. Checkboxes select multiple local files/folders; Profile for selection changes their behaviour while preserving direct source bindings. The source-path picker also supports search.

Assignments and connection edits are drafts. Applying a form does not start synchronization. Save validates references and source overlaps, then persists both together. Closing a changed workspace offers Save / Discard / Return. Background inventory/local refresh does not reset partially edited inspector fields. External settings changes or active execution prevent saving a stale workspace. Actual synchronization still obtains and validates every required fresh inventory before any write; browsing does not weaken execution safeguards.

## Behaviour profiles

- **Do not touch:** no writes, moves or deletions, including force/retry.
- **Create missing:** install once and retain existing contents; concurrent creation cannot be overwritten.
- **Update unchanged local files:** update only when local bytes match the last applied baseline; skip modified or unowned files.
- **Match source:** check actual local contents even when remote metadata is unchanged; replace through recovery safeguards.
- **Update with conflict resolution:** process source changes and preserve a local/incoming copy, keep local content, or ask during manual synchronization. Automatic conflicts requiring a decision stay pending without a modal or poisoned retry entry; deletions are deferred for that run.

Deletion is independent: keep absent files, delete previously synced files, or delete all eligible files absent from the source. Do not touch forces keep. Folder/file exclusions, runtime protection, integrity checks and script permissions remain stronger. Scheduling and script permissions remain off by default. Profile assignments do not enable them.

## GitHub plugin code and Yandex documents

Create named connections in the workspace. Link `.obsidian/plugins` to the GitHub repository's plugin directory and choose Match source / Keep absent, filtered to Plugin code. Add a `data.json` assignment using Create missing or Do not touch. Link `Documents` to the Yandex documents folder with the desired conflict profile. An exact-file assignment can override a particular plugin's settings. Sync remains source→vault; local changes are not uploaded.

## Migration and limits

Existing fetch/light/full settings and inline rules migrate once into profiles. The active source policy becomes `vaultPolicy`, while the old primary configuration becomes a regular named connection selected as the vault default. Existing assignments, folder mappings and exclusions are retained. Older per-source records remain archived; execution and the workspace use the vault policy. Migration is idempotent and restores in-memory settings on save failure. Source edits/default selection no longer switch the assignment library.

New vault routing uses a SHA-256 cache/queue namespace derived from public connection identities, bindings and mappings. The previous cache/queue remains in its old namespace; it is not adopted automatically as ownership for new routes. Expect a fresh baseline and possible conflict copies on the first run after migration. Credential rotation preserves the routing namespace. Recovery references/history are not discarded.

Legacy folder mappings remain supported and apply to unbound inventory paths. Explicit new bindings produce final vault paths and are not remapped again by a legacy folder target. Explicit write profiles suppress structural moves; originals can remain after migration. Cleanup is deliberate.

Composite deletion requires every participating provider to supply an immutable inventory guarantee. Background deletion is deferred; unverified Yandex/Drive/WebDAV inventory cannot authorize deletion. Unused default sources are omitted when an explicit all-vault source assignment supersedes them.

Profiles are per-file policies, not atomic plugin-package upgrades. Package rollback, compatibility checking, safe activation/hot reload, unsaved editor buffers and recovery retention remain separate work. Recovery UI supports verified export, separate-file restoration and review of pending operations; it does not repair corrupt ledgers. The original `manifest.json` is still required for installation. Do not downgrade builds without restoring equivalent exclusions and source protections.

Tests cover routed execution, migrations, independent source previews and DOM interactions through an Obsidian host shim. Real Obsidian desktop/mobile and live provider accounts have not been exercised by these tests.

### Выбор источника хранилища

В «Подключения → Источник для хранилища» выберите сохранённое подключение,
например Yandex, и нажмите «Сохранить библиотеку». Такой же выбор доступен в
дереве; там он сохраняется кнопкой «Сохранить настройки». Создание подключения
само по себе не меняет назначение файлов. Источник хранилища применяется к файлам
без отдельного назначения; более точные назначения в дереве сохраняют приоритет.
«Только назначения в дереве» отключает общий источник и оставляет синхронизацию
только явно назначенных областей. При новой настройке пустое legacy-подключение
больше не становится обязательным источником. Уже сохранённый неработающий
источник нужно заменить через этот выбор; автоматического переназначения нет.

Yandex использует публичную ссылку на папку или ZIP-архив. OAuth и доступ к
приватному диску не реализованы; неработающее поле токена удалено из формы.

## Run one source, then another

Save the assignments, then open a connection’s Actions and choose Sync this source.
The detailed plan lists only that source’s operations. Its run cannot read or
mutate another source’s destinations, cache or failed entries. Repeat for the
second connection. Both runs share the configured routing namespace. A file
still has one winning source; replacing its owner requires changing its assignment.

Entire vault retains the previous selective folder choices separately. Switching
back restores them. Explicit exclusions, bindings and mappings remain effective.
Closing a conflict prompt defers the decision. The run panel and journal distinguish
received content, accepted versions, actual primary-file updates and pending actions.

The [UI overhaul specification](ui-overhaul.md) describes the complete draft,
preview, result and recovery contracts, migration and validation limits.
