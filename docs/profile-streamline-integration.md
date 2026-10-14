# Profile streamline integration — reviewed plan and implementation status

Implementation status (2026-10-14): this branch adds the compatible effective-policy compiler, explicit direction, connection validation, an explicitly selected Drive preset and acknowledged settings saves. Existing scope, profile IDs and pull behavior remain compatible. The complete UI/runtime replacement and v5 schema migration proposed in the attachment have not been performed. See [google-drive-integration.md](google-drive-integration.md).

The attachment remains a design proposal. Its sample migration/deletion code is not executed. The implementation keeps legacy axes as compatible input and derives effective behavior; it does not introduce a second independently editable policy authority.


Date: 2026-10-14 (Europe/Moscow).
Input: user-uploaded profile-streamline-proposal.md, 946 lines, 57,728 bytes.
Target: vetsyncpath-oss/sync overhaul/2b1-recovered, d74128619b151af58f4ebdc22e8a61b270e81c8d.
Companion: google-drive-bidirectional-spec.md.

The attachment is a design proposal, not an instruction to execute its migration snippets or delete legacy code. The user authorized analysis and integration into the plan. The review itself changed planning only; the subsequently authorized implementation is described in the status above.

## Accepted goals

1. A single normalized effective policy drives planner, execution, preview, status and recovery decisions.
2. Separate participation/coverage from update and deletion behavior, conflict decisions, source routing, path mapping and host safety.
3. Retain reusable profile library and ProfileAssignment identity, including exact-file scope, names, source and remotePath.
4. Derive preset labels from actual scope rules; do not maintain independently editable preset/runtime scope values.
5. Replace repeated legacy selectors with a concise profile UI and a preview of actual operations and winning rules.
6. Migrate idempotently, atomically and with an original settings backup; retain old readers for supported upgrades.
7. Retire MirrorLevel/LightConflictStrategy runtime branching only after the new implementation and compatibility adapter preserve behavior.

## Corrections required before implementation

| Proposal | Problem | Integrated decision |
|---|---|---|
| §1.2: update advances cache on conflict | Actual conflict.ts returns skipped/updateCache:false | Correct baseline description; do not migrate to incoming/cached acceptance |
| §2.3: every byte difference is a conflict | Remote-only or local-only changes are normal bidirectional propagation | Three-state planner first; conflict resolution only on actual competing versions, delete/edit, or unknown initial overlap |
| safe -> track/prune-tracked | Introduces deletions for a non-deleting profile | Keep safe with deletions keep; tracking deletions is an explicit new profile |
| standard:conflicts -> ask | Changes automatic keep-both into interaction/defer | Keep automatic visible copies; ask is a separate profile |
| Four Resolution values replace all WriteMode behavior | Cannot losslessly distinguish no updates, baseline-safe updates, source enforcement and visible incoming copies | Separate ordinary update policy from actual conflict policy |
| Two-element missing tuple | Encodes only pull; cannot separate a new local file from deletion of a previously tracked remote file | Explicit direction and named lifecycle rules; baseline-aware missing classification |
| coverage in profile and policy, selectedFolders elsewhere | Creates multiple independent coverage authorities | Scope/participation belongs to assignments and one scope tree; profile describes behavior |
| custom positive folder list replaces exclusions | Vault minus one excluded subtree can become empty; future folders/nested reinclusion change meaning | Preserve sparse include/exclude/inherit structure and test virtual future paths |
| mirrorFolders.off -> exclude | Mirror off protects deletions without necessarily excluding downloads | Migrate to deletion protection, not participation exclusion |
| compileProfileV2 is additive and equivalent | MissingLocal skip is lost, incoming is shadowed by update, preserve forces keep, exact-file scopes and routing are lost | Replace with validated effective-policy compiler; reject unrepresentable legacy roundtrips |
| auto ask can fallback to local | Applies an unrequested conflict choice and may create copies/false completion | Keep per-item needs_decision, continue independent files |
| unverified provider does not support deletion | Current mirror guard is an implementation safety rule, not universal inability to trash files | Keep old guard; use separate object-specific bidirectional deletion evidence |
| all data.json are machine-specific | Many plugin settings are portable; generic names may contain arbitrary user data | Protect known control/credential files; config selection is a scope template with explicit granular exclusions |
| profile migration never affects OperationStore | Pure UI/profile conversion may retain local format; Drive upload/trash/resume cannot fit existing local-only before/after records | Separate profile-schema migration from remote-operation schema extension and backward readers |
| incoming needs no recovery | Unchanged local primary may need no preimage, but uploads/retries/groups need stable payload and durable effects | Distinguish preimage recovery, transfer snapshots and visible conflict artifacts |
| remove legacy readers after all users migrate | Skipped versions/offline users still need old input readers | Remove duplicate runtime behavior and obsolete writers; retain bounded supported-schema migrations |
| migratedV5 flag is sufficient | A flag cannot validate policy or prove acknowledged persistence | Explicit schema version, validated migration result, durable commit and marker |
| estimated ten days | Does not include new Drive state, API concurrency gates and integration tests | Do not treat as a delivery commitment; estimate after vertical slice |

## Effective policy model

The UI may retain three blocks (scope, synchronization behavior, conflicts), while runtime fields remain explicit.

- Participation: sparse include/exclude/inherit rules with file/folder/vault scope; hard safety remains non-overridable.
- Direction: pull or bidirectional. Do not infer it from source kind or missing files.
- Creation: named createMissingLocal/createMissingRemote behavior. The planner classifies new vs previously deleted before using these permissions.
- Ordinary updates: none, on-source-change, enforce-source for pull; changed-side for bidirectional.
- Deletions: keep, tracked/all for pull where the current source safety permits; propagate-tracked-through-trash for bidirectional.
- Actual conflicts: primary preference, keep-other-visible-version and ask/defer. Mandatory mutation recovery is separate from visible copy preference.
- Source locator/routing: source ID, remotePath and validated mapping belong to the assignment/connection, not implicit profile labels.
- Diagnostics: resolved policy includes provenance of participation, behavior and routing plus capability/guard reasons.

Coverage presets (vault, Obsidian configuration, custom folders) edit this same scope tree. The profile does not carry an independently competing vault-wide coverage selector. Assigning a profile outside scope includes a path only through an explicit, visible participation change in the same transaction; it never overrides hard exclusions.

## Built-in behavior and migration

| Existing/profile | Preserved behavior |
|---|---|
| standard:preserve | No create/update/delete on the path |
| standard:seed | Create missing local files; do not update existing or delete |
| standard:safe | Create missing, apply source changes only without local edits; no incoming copy or deletion added by migration |
| standard:source | Enforce source version locally, with existing conflict protection; do not delete missing-source files |
| standard:conflicts | Apply source changes with automatic keep-both; no deletion or ask added |
| New Drive bidirectional | Propagate legitimate one-sided changes, keep-both on competing versions, automatically propagate tracked deletions through trash |

ask, existing-only, tracked-deletion and mirror are advanced templates/custom combinations. Configuration-only is a scope template, not a deletion policy. Existing IDs remain stable; a semantically unmatched legacy policy gets a generated custom profile, never a default track fallback.

Existing-only allows updates of files present on both sides, with baseline/conflict policy, without creating missing files. Pure pruning is an advanced one-way policy requiring suitable source evidence; it is not a bidirectional bootstrap default.

For pull incoming/local preference, acknowledge the observed/handled remote version separately. Do not replace primary applied baseline with the hash of a sidecar. For bidirectional local preference, the selected version must actually reach both canonical files before marking convergence.

## Migration invariants

1. Compile old settings and scopes to a validated canonical policy without file mutations.
2. Preserve sparse overrides/inheritance, exclusions, old IDs, exact-file scope, names, source, remotePath, targets, scopeSelection and auto settings.
3. Compare old/new effective behavior on existing and synthetic paths: excluded subtree, future folders, nested reinclusion, named rules and mapped destinations.
4. No new deletions, uploads, wider participation, incoming copies or prompts merely due to upgrade.
5. Validate all references/capabilities. Missing profile/source or incompatible rules block writes with a visible reason; do not substitute track/mirror.
6. Keep original settings backup. Commit settings/schema/marker as acknowledged state. Failed save leaves prior active policy; repeated migration keeps IDs and assignments.
7. Recover old in-flight effects under the recorded old operation semantics before applying a new policy to the same physical target. A policy change replans new work, not already-published effects.
8. Schema versions for settings/profiles, local ledger and new remote effects are distinct. Do not claim that a profile UI refactor alone implements bidirectional state.
9. Settings rollback does not undo completed file effects; recovery remains explicit.

## Updated implementation sequence

0. Capture current semantics and migration golden fixtures; fix known persistence-failure propagation and false success prerequisites.
1. Introduce canonical effective policy, explicit direction/lifecycle/conflict model and capability validation; keep legacy input adapter.
2. Implement lossless migration and single-authority scope tree; prove no behavioral expansion and migration failure safety.
3. Refactor planner/executor/resolver to a named context object and state-specific operations; eliminate mirror branching in execution only after equivalent callers exist.
4. Update profile library, scope UI, preview and status to use the same compiled policy, including blocked/deferred reasons and both transfer directions.
5. Integrate native OAuth, Drive picker and a read-only reconciliation preview; validate drive grant and folder write capabilities.
6. Implement versioned remote-operation state, stable transfer payloads, upload/download recovery and required live API concurrency tests.
7. Implement bidirectional conflicts, rename identity, trash propagation and tombstones under the new profile.
8. Add Changes feed, startup follow-up, pending decisions, retry persistence and metadata/revision retention; run end-to-end and speed comparisons.
9. Retire redundant writers/runtime enums, preserving supported upgrade readers, aliases and old recovery records.

## Required acceptance cases added by proposal review

- Remote-only A->B with unchanged local A updates normally; conflict preference does not intercept ordinary update.
- safe migration never deletes or creates incoming copies, and a deferred local change never falsely becomes applied remote baseline.
- Automatic keep-both remains automatic; ask remains pending on background runs and does not stop independent files.
- Existing-only never creates a missing file; prune-only is represented without the old preserve->keep override hiding it.
- Vault-minus-Private stays such, including future folders; mirror-off still permits downloads while protecting deletions.
- Exact-file protection, named rules, source/remotePath, path mapping and hard exclusions survive migration.
- Choosing Obsidian-config scope does not silently enable tracked pruning or exclude unrelated user data.json files.
- Bidirectional missing-new vs missing-deleted, delete/edit and unknown inaccessible state produce different plans.
- Lost settings-save acknowledgement, repeated migration, skipped-version upgrade and old pending recovery never allow writes under guessed policy.

Original review verification: the full proposal and relevant source branches were read. Current implementation verification and remaining live checks are listed in google-drive-integration.md.
