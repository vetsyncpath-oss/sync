# Write and deletion rules

Settings → Write and deletion rules edits a draft for the current source. Select the entire vault, a folder (all descendants), or an exact file. Apply saves; leaving settings without applying discards the draft. Existing fetch/light/full modes remain the fallback. Auto-sync and script permissions still default to off.

Within a vault/folder rule, select all files, plugin code (`main.js`, `manifest.json`, `styles.css`), `data.json`, or comma-separated exact basenames. Names are not extension filters or glob expressions. Paths refer to final vault locations after folder mappings.

## Inheritance

Each axis resolves independently: vault < folder < nested folder < exact file. Within the same scope, a basename-filtered rule is more specific than an unfiltered rule. Last equally specific rule wins. Paths and names compare case-insensitively with Unicode NFC normalization, so portable aliases do not lose protection. The settings path checker reports the resulting write/deletion modes and rule numbers; sync exclusions and script permission checks still apply separately.

- Do not touch: no writes, moves or deletions, including force/retry.
- Create missing only: install once; existing contents are retained. A concurrently created file cannot be overwritten.
- Update if unchanged locally: accept remote changes when the saved local version still matches the last applied baseline. Existing unowned/modified files are skipped, without a conflict prompt.
- Match source content: check local contents even when remote metadata has not changed, and restore remote bytes with the existing recovery safeguards.

Deletion is independent: keep; delete previously synced files absent from the source; or delete all eligible files absent from the source. Do not touch forces keep. Exact-file and basename rules apply to deletions too. Existing folder excludes, mirror-off areas, runtime protection and script permissions remain stronger than these rules. Background deletions remain deferred; inventories without the required completeness guarantee cannot authorize deletion. Force/retry continue to perform no deletions.

## Example: code updates with personal settings

1. Folder `.obsidian/plugins`, code quick selection: Match source content; Keep when absent.
2. Same folder, `data.json`: Create missing only; Keep when absent (or Do not touch to avoid initial seeding).
3. Optionally, exact file `.obsidian/plugins/example/data.json`: Match source content; Keep when absent.

Rules do not enable script permission or scheduling. They do not fetch settings from plugins that store data under unrelated names: add explicit rules for those files.

## Compatibility and limits

`SyncPolicy.fileRules` is additive. Missing/empty rules preserve legacy behaviour; existing modes and global defaults are not silently changed. Adding rules to a source without a policy retains its legacy folder/config-only scope. Structure presets, onboarding and the tree editor retain rules and exclusions. Invalid saved rules block synchronization before inventory retrieval; they are not silently discarded.

A new explicit write rule suppresses structural moves involving its source/target; the mapped destination is processed according to its rule, and the old path is retained. This avoids moving away a protected or seed-only file. Deleting that old path requires a separate deliberate policy change. Rules do not turn per-file writes into a plugin-package transaction or hot-reload plugins. Safe activation, package-level rollback and compatibility checks remain separate work. Unknown original audit defects are not claimed fixed by this change.

Older builds do not understand `fileRules`: do not downgrade a vault relying on these protections without restoring equivalent exclusions first. No live Obsidian desktop/mobile UI validation was available; tests exercise the coordinator, state model and filesystem adapters.
