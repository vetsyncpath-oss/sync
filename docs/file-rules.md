# Profiles, tree assignments and sources

Settings contains a compact profile library and connection editor. Create a custom profile (or customize a copy of a standard profile), then assign it from the file tree to the entire vault, a folder including descendants, or an individual file. The tree supports file actions, multi-selection and Enter to open assignments. Changes stay in the tree draft until Save. Reloading inventories preserves that draft. Local discovery includes `.obsidian` through the vault adapter.

A profile specifies writing, deletion, conflict handling and an optional named source connection. Path validation, integrity checks, recovery and permissions are mandatory safeguards, not profile toggles. Scheduling and plugin/script permissions remain off by default; profiles do not enable them.

Within a vault/folder assignment, quick-select all files, plugin code (`main.js`, `manifest.json`, `styles.css`), `data.json`, or comma-separated exact basenames. These are names, not globs or extension filters. Assignments refer to final vault paths after folder mappings; selecting a remote node translates its path accordingly.

## Inheritance and sources

Precedence is vault < folder < nested folder < exact file. A basename filter is more specific than all files at the same scope. Each assigned profile defines both writing and deletion; its source and conflict policy may inherit. Equal-priority write/deletion settings use the last assignment. Equal-priority assignments naming different sources are errors and block synchronization, including overlaps for currently absent files. More-specific assignments can override a parent's source. Paths and basenames compare case-insensitively with Unicode NFC normalization.

Every file has one selected source. With no explicit source it uses the primary connection. A named connection identifies an actual repository, disk or endpoint with its own configuration and credentials. The same provider can have multiple connections. If the selected source lacks a file, another provider does not supply it automatically.

All required inventories must load and validate before any writes. The tree preview lists candidates from all configured connections and labels their origins, using separate source instances from synchronization. Preview availability is not proof that a file will be written: routing, exclusions, permissions and local conflicts still apply.

Routing or public connection identity changes isolate the cache and failed queue; credential rotation does not reset ownership. Primary-only configurations keep their existing namespace. A composite source allows deletion only when every member supplies the required immutable inventory guarantee. Adding Yandex, WebDAV or another unverified inventory does not grant it deletion authority.

## Profile actions

- **Do not touch:** no writes, moves or deletions, including force/retry.
- **Create missing:** install once and retain existing contents; a concurrently created file cannot be overwritten.
- **Update unchanged local files:** update only when local bytes match the last applied baseline. Skip modified or unowned files.
- **Match source:** check actual local contents even when remote metadata is unchanged; replace through the recovery safeguards.
- **Update with conflict resolution:** process source changes and resolve local edits by preserving a copy, keeping local contents, or asking during manual sync. Background conflicts requiring a decision stay pending, without opening a dialog or poisoning the retry queue; deletion is deferred for that run.

Deletion is independent: keep files absent from the source; delete previously synced files; or delete all eligible files absent from the source. Do not touch forces keep. Exclusions, protected runtime paths and script permissions remain stronger. Background deletions are deferred, and force/retry perform no deletions.

## Example: GitHub plugin code, Yandex documents

1. Add named GitHub and Yandex connections in Settings → Connections.
2. Create “Plugin code”: GitHub, Match source, Keep absent files.
3. Assign it in the tree to `.obsidian/plugins`, quick selection Plugin code.
4. Assign Create missing (or Do not touch) to `data.json` in that folder. Select GitHub explicitly if initial settings should come from that repository.
5. Create “Documents”: Yandex, Update with conflict resolution, Keep absent files; assign to the documents folder.
6. Add an individual-file assignment when a particular plugin's settings should follow the source.

If repositories use different layouts, map the relevant source folders to their final vault locations first. Folder mappings remain shared across the routed source; conflicting final destinations fail plan validation.

## Migration and limits

Existing fetch/light/full settings are converted once to editable profiles and assignments: Receive changes; Follow source deletions; Exact source copy. Folder overrides, inline file rules, exclusions and mappings are carried over. Migration is idempotent; a failed save restores the in-memory settings for retry. Deleting a profile still referenced by any saved policy prevents saving the library; remove its assignments first. Invalid profiles or missing connections block sync rather than dropping protections.

Explicit write policies suppress structural moves involving protected source/target paths. Because migrated profiles are explicit too, mapped destinations are processed under their profile while original paths can remain. Review and remove obsolete paths deliberately; migration does not silently clean them up.

Profiles operate per file, not as atomic plugin-package installations. Package-level rollback, version compatibility checks and safe activation/hot reload remain separate work. Auto-sync must be enabled separately. Older builds do not understand profiles and assignments: do not downgrade a vault relying on them without restoring equivalent exclusions.

Automated checks cover migration, coordinator routing, conflict safeguards, cache/queue isolation and DOM interactions with a host shim. Real Obsidian desktop/mobile and live multi-provider credentials have not been exercised by these tests.
