# Google Drive bidirectional integration — target specification

Implementation status (2026-10-14): the desktop OAuth and cautious bidirectional pilot are now implemented and covered by automated tests. See [google-drive-integration.md](google-drive-integration.md) for the exact implemented subset, limitations and required live validation. This document describes the complete target, including pending work; it is not a claim that every requirement below has shipped.

User decision after the original design: preserve existing Drive IDs; until live concurrency tests, publish proposed updates to existing objects as reviewed conflict copies rather than updating/replacing their canonical content.

Architecture review 2026-10-14: [Drive/V6 cross-review](audits/drive-jobs-cross-review.md) confirms current gaps in artifact visibility, unresolved absence/review UX and no-op state writes. [Per-source jobs plan](per-source-jobs-plan.md) adds independent RunContext while retaining global mutation authority, pair generations and safe migration; it does not relax the existing-ID update gate.


Date: 2026-10-14, Europe/Moscow.
Target: vetsyncpath-oss/sync, overhaul/2b1-recovered, d74128619b151af58f4ebdc22e8a61b270e81c8d.
Reference: hesprs/sync-engine, a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9.
User decisions: bidirectional Google Drive; automatic deletion propagation through trash.
Live Google account validation is still pending. Requirements below include both the implemented pilot and future stages.

## Scope

- Desktop Windows/macOS/Linux initially. Native OAuth Authorization Code + PKCE S256 in system browser, temporary loopback listener, no hosted OAuth server.
- Select an existing private Drive folder by immutable ID and a local vault root. Binary files, including Markdown, attachments, Canvas, Base and JSON. Empty files and directories supported.
- Preserve existing pull profiles and connections. Add an explicitly bidirectional profile; do not reinterpret legacy write/delete axes as permission to upload.
- Profile streamline review is integrated in profile-streamline-integration.md. Use one canonical effective policy; coverage/participation is an assignment scope tree, ordinary update policy is distinct from conflict resolution, and propagation is direction/baseline aware. Preserve safe and automatic keep-both semantics during migration.
- Initial reconciliation merges new files from both sides, compares content for overlaps and never infers deletion without an established bidirectional baseline.
- Google-native Docs/Sheets/Slides, shortcut targets outside the root, cross-shared-drive moves and automatic text merging excluded from the initial release. Unsupported objects remain visible as excluded/protected, never as missing.

## Authorization

- Request https://www.googleapis.com/auth/drive and openid; email optional. drive.readonly cannot authorize uploads; drive.file does not cover arbitrary existing folder contents. The Cloud client remains Desktop app.
- Granted scope is account-wide. Enforce folder boundaries for every upload, move, trash and parent lookup. Picker/account Changes feed may return metadata outside the selected root; do not persist irrelevant account inventory.
- Separate client configuration, account identity, credential reference, connection/root and profile assignment.
- Shared single-flight token refresh per account/client/grant, expiry skew, one refresh/retry on either returned or thrown 401.
- Validate grants and account subject. Protect against late callback and late refresh using an account/attempt epoch checked before and after awaited operations and in the commit section.
- Local disconnect invalidates requests, timers and credentials regardless of remote revocation outcome. Revocation is a separate observable operation; do not swallow failures.
- Access tokens in RAM; refresh tokens through CredentialStore; references only in settings. No tokens/codes/verifiers/resumable session URLs in logs. Imported Desktop client configuration is distinct from user tokens.
- External/Testing Drive refresh tokens normally expire in seven days; classify as auth_required, pause affected accounts, preserve work.

## Contracts and state

- Keep the existing SyncSource read interface for existing providers. Introduce an optional writable remote port with inspect, download, create/update, mkdir, move, trash, restore and change-feed capabilities.
- Pure BidirectionalPlanner emits a typed plan; a shared operation executor handles local safety, leases, dependencies, errors, durable intent and recovery. Do not run independent push and pull loops.
- Operation types: download, upload-create, upload-update, mkdir-local, mkdir-remote, move-local, move-remote, trash-local, trash-remote, save-conflict-version and acknowledge-state.
- Every mutation carries operationId, pairId, item identity, policy revision, expected local state, expected remote state, immutable transfer snapshot reference and dependencies.
- Pair identity includes account subject, remote root ID and routing/local root semantics; token refresh, client rotation and display names must not reset content identity.
- Per-item baseline records local applied SHA-256, remote fileId/checksum/version/headRevisionId, path mapping, previous existence and deletion tombstones. Remote version stays a string/int64, not an unsafe JavaScript Number.
- Per-pair discovery state records root metadata, folder graph, remote inventory and cursor. Applied baseline and inventory are separate.
- Reject ambiguous/overlapping authoritative mappings before I/O. Lease physical local targets across all providers, including pending recovery from a different namespace.
- Upgrade from pull caches requires fresh content reconciliation; the old cache alone cannot establish that both sides once agreed. Root/account/mapping changes must not cause implicit deletions.

## Decision matrix

| Baseline | Local | Remote | Action |
|---|---|---|---|
| None | present | absent | Upload new file after checking destination collisions |
| None | absent | present | Download new file |
| None | present | present, equal content | Establish baseline, no content replacement |
| None | present | present, different content | Preserve both |
| Agreed | unchanged | unchanged | No-op |
| Agreed | changed | unchanged | Upload update, guarded and recoverable |
| Agreed | unchanged | changed | Download update, compare-and-write |
| Agreed | changed | changed, equal content | Reconcile baseline without transfer |
| Agreed | changed | changed, different content | Preserve both |
| Agreed | confirmed deleted | unchanged | Remote trash |
| Agreed | unchanged | verified trashed | Local trash |
| Agreed | deleted | changed | Delete/edit conflict: save survivor as conflict sibling on both sides before completing deletion |
| Agreed | changed | verified trashed | Edit/delete conflict: same rule |
| Agreed | deleted | verified deleted | Retain tombstone, no resurrection |
| Any | unreadable/unknown | unknown/incomplete | Block affected scope, never infer deletion |

- Same size, mtime or weak fingerprint is not content equality. Use SHA-256/MD5 appropriately; calculate local content checksums when remote checksum is available. Without a reliable checksum, fetch and hash before establishing equality.
- Cache hashes with local dirty generations and observations. On startup reconcile metadata; periodically verify content to detect external changes that preserve stat fields. Document that metadata caching alone cannot prove such changes absent.
- Renames use Drive IDs and reliable local rename events. Do not infer identity solely from duplicate hashes or size/mtime. Existing destination means conflict, never automatic destination deletion.
- A rename on one side plus content edit on the other may combine only for a unique identity with valid guards. Divergent renames, file/folder mismatches and ambiguous local identity block only the affected item/subtree.

## Discovery and cursor

1. Before a cold scan obtain Changes start token T0.
2. Validate selected root and recursively enumerate its tree, fully paginated and bounded. Build graph by IDs.
3. Replay changes since T0 to reconcile modifications during scan, discovering newly moved-in subtrees and updating moved-out membership.
4. Commit inventory, durable dirty/reconcile work and new cursor together. Cursor advancement does not require every file/conflict to have converged.
5. On warm runs use Changes API, refreshed relevant metadata and dirty local paths. Avoid account-wide files.list on every local edit.
6. Unexpected/incomplete discovery does not mutate baseline or authorize destructive actions. Rejected cursor or state corruption triggers rescan without deletion inference.

- Change.removed can mean loss of access as well as deletion. A 404 has the same ambiguity. Neither is sufficient to auto-delete a local copy.
- Selected root unavailable/trashed pauses the whole pair; do not recreate it, clear baseline, or treat the entire tree as deleted.
- Moving an item outside the root is scope_exit; preserve local content and flag it rather than writing outside the source or restoring the item into Drive automatically.
- A complete live listing is not an immutable snapshot. Existing deletionSafety remains unverified. The new bidirectional deletion evaluator uses item-specific baseline and verified trash evidence; do not weaken old mirror safety globally.

## Transfers and recovery

- Upload a stable local snapshot; its bytes/checksum/length must remain fixed across retries and resume. Download into temporary storage, verify, then guarded apply.
- Use multipart for small files, resumable for larger ones. Initial chunk size 8 MiB, sequential chunks within a file, multiples of 256 KiB except last. Empty files are handled explicitly.
- Read server Range on 308. After timeout/5xx probe session status with an empty PUT, then resume at acknowledged offset. Missing Range means no bytes acknowledged. Do not blindly advance by bytes sent.
- Persist pending operation, file ID, resumable session and confirmed offset before relying on them for recovery; session URLs are protected operational state, not diagnostic text.
- Pre-generate and durably record Drive IDs for eligible new binary files/folders. Retry the same ID after uncertain create. On 409, inspect ID and verify ownership/content/operation rather than blindly accepting success or allocating a duplicate.
- Validate 206, Content-Range, total length and revision identity for range downloads. Same-length chunks alone are insufficient. Prefer simple download for small files; use pinned/known revision where the API permits stable range reads.
- Dependency graph enforces parents before writes/moves, verified copies before destructive actions, children before empty-directory removal, acknowledgement after verified effects.
- Independent items run concurrently. Local or remote unknown publication result becomes reconcile_required; do not redo an uncertain destructive operation blindly.
- Journal/cache/settings failure is session-fatal for mutations. Cleanup failure is separately reported and never masks the primary outcome.

## Remote concurrency boundary

- v3 File.version is output-only and Files.etag is removed from the documented v3 resource. A read-before-PATCH and read-after-PATCH are not atomic compare-and-swap. Never advertise race-free overwrite based on those checks.
- Required live contract tests must establish whether an actual conditional-write mechanism is available for the chosen API endpoints, including resumable completion, rename and trash. Unsupported mechanisms must remain an explicit capability, not a presumed feature.
- For binary data, evaluate protecting previous and newly uploaded revisions using keepForever/keepRevisionForever, plus durable local snapshots and post-write reconciliation. Drive's ordinary revision history is purgeable and not a permanent backup.
- This can preserve recoverable versions of cooperating plugin clients but does not prove arbitrary external clients cannot write between checks. If live concurrency tests cannot preserve all edits, use a conservative conflict-copy publication path or withhold automatic overwrite for that scenario; do not silently ship a last-writer-wins claim as safe sync.
- Protect/purge only revisions managed by this plugin and not active in recovery. Respect the 200 kept revisions per-file ceiling, explicit age/count policies and quota errors. No uncontrolled revision pinning and no cleanup of unknown/manual pinned history.

## Conflicts and deletions

- Default keep-both: remote snapshot remains canonical at original path; local divergent content becomes a uniquely identified sibling on both sides. Do not choose winner by device clocks.
- Conflict ID includes item identity and version/content information; deterministic names and operation records prevent repeated copies. Exclusive local create, collision-aware remote create. Existing user conflict files are never overwritten.
- Conflict siblings are normal synchronized items with lineage metadata, not globally excluded by name. Do not feed their creation back as a new conflict on the original.
- ask is a per-item needs_decision state; no blocking background modal. User choice replans current state. Errors/conflicts do not stop independent tasks.
- Auto-trash applies only to previously tracked, still in-scope files with confirmed disappearance on one side and unchanged survivor on the other.
- Changed survivor in delete/edit is preserved locally and remotely before trashing its original. Failure to preserve means no deletion.
- Unknown/untracked/excluded files, lost access, missing local/remote root and incomplete scans never authorize automatic deletion.
- Folder trash is prohibited while it contains protected, untracked, unknown or excluded children. Prune verified empty directories only after children commit; never trash the selected roots.
- Restore/untrash is a new explicit version/event; reconcile tombstone without resurrecting an older offline copy. Expired/missing recovery evidence requires reconciliation, not automatic upload of stale content.

## Scheduling and outcomes

- Preserve configured startup-only behavior. One startup job may continue through retry/follow-up; it does not silently enable continuous sync.
- Events during execution are recorded. Suppress proven self-write echoes, not every event from a running session. Active-job dirty paths get a bounded follow-up; subsequent edits after completion obey the configured mode.
- Optional realtime mode debounces local changes; remote changes need polling without a public webhook server. Priority/coalescing of manual/startup/interval/retry must not lose triggers while busy.
- Retry only transient errors, with bounded shared transport/job budget, jitter and Retry-After. Credentials/access errors await a state change. Pending queue survives restart.
- Outcomes: completed, completed_with_warnings, partial, needs_attention, blocked, cancelled, failed. Track per-item convergence separately from upload/download counts.
- UI reports configured auto mode, job status, pending conflicts, auth state, retry time, last attempt and last fully acknowledged success independently.

## Storage, exclusions, retention

- Plugin control files, OAuth credentials, workspace files, trash and staging/recovery payloads are excluded from ordinary data synchronization. User configuration syncing needs explicit policy.
- Reuse operation ledger only after fixing failure propagation, premature save acknowledgement and physical target recovery isolation.
- Normally keep two verified checkpoints plus required recovery anchors; one previous backup per retained manifest. Compact append events only after a verified checkpoint.
- GC follows real live references; empty archived queues cannot pin namespaces forever. Unresolved operations pin their exact payloads; terminal tombstones and recovery versions have explicit retention.
- Cleanup failure/unsupported state format is visible. Stop writes on unrecoverable state ambiguity, preserve files needed for manual recovery, never delete unknown future-format data as garbage.

## Reuse boundaries

| Donor code | Reuse decision |
|---|---|
| gdrive/api.ts buildUrl, escapeQuery, getHeader | Adapt/copy small pure helpers, expand typed errors/metadata validation |
| gdrive/upload.ts guessMimeType, multipart builder | Adapt/copy; HTTP transport and size handling follow our ports |
| gdrive/upload.ts resumable flow | Partial reuse only after status/Range, immutable payload, cancellation and durable resume changes |
| gdrive/auth.ts TokenManager | Adapt single-flight design; replace global key, add epochs/account/client isolation and returned-401 handling |
| gdrive/auth.ts device flow | Do not copy for desktop arbitrary-folder scope; implement native PKCE |
| gdrive/fs.ts CRUD calls and ID mapping | Reuse API patterns; implement selected root and ambiguity-safe mapping; do not copy whole-account listing/dedupe/move-overwrite semantics |
| sync/decision/bidirectional.ts | Reimplement matrix; no size-only bootstrap or silent delete/edit resurrection |
| sync/utils/detect-moves.ts | Reuse principles only; stable ID/event identity and physical-path guards |
| sync/conflict-resolve/rename-and-keep-both.ts | Reimplement durable group and unique names; no fixed .conflict overwrite or clock-winner |
| fs wrappers / scheduler | Borrow bounded concurrency, memory budget and trigger coalescing concepts; integrate with existing lifecycle and ledger |
| SynthKernel, Uni-KV, SDK, Solid UI, module loader | Do not import merely to adopt Drive; avoid a second state/lifecycle stack |
| benchmark scripts | Adapt MIT test fixtures; add byte/hash verification and fault/concurrency scenarios |

Copied/adapted portions require the full copyright and MIT permission text in distributed notices, upstream path/commit records and modification notes. Dependencies have separate licenses. Documentation must be independently written or separately attributed under its license.

## Performance acceptance and release stages

- Defaults proposed for measurement: four file transfers, eight metadata requests, 64 MiB retained-buffer budget; reduce under rate limiting. Chunk parallelism never violates per-file sequential upload.
- Warm no-op: no media traffic; use account Changes feed rather than full files.list. Single small edit: no whole-vault rehash/reupload; metadata traffic proportional to relevant changes plus guards.
- Measure cold upload/download, warm noop, one-file change, rename, delete and conflict. Reference dataset: 2,000 files, including 20 large files; add large-account/small-selected-folder case.
- Report p50/p95, request counts, bytes, held buffers/RSS, checksum correctness and restored versions under same account/network/settings. No invented speed guarantees.
- Stage 1: current-semantics fixtures, canonical effective policy and ports, lossless profile/scope migration, fatal state-error corrections and shared mutation ownership. Retain compatibility readers; do not enable uploads/deletions by migration or rely on the proposal's lossy compileProfileV2.
- Stage 1b: refactor planner/executor with named operation context, then profile/scope/preview/status UI; remove duplicate runtime authorities only after equivalent callers exist. Details and expanded acceptance cases: profile-streamline-integration.md.
- Stage 2: native OAuth, folder picker, capability inspection and read-only reconciliation preview.
- Stage 3: create/update transfers, actual resumable recovery and required live API/concurrency contract tests.
- Stage 4: bidirectional planner, conflict groups, moves, auto-trash and tombstones.
- Stage 5: change feed, event follow-up, retry persistence, retention/GC and comparative benchmarks; finally retire redundant legacy writers/runtime branches while preserving supported old-settings and recovery readers.
- Release tests: initial different/equal same-size files; edits on both devices; delete/edit; permission loss/403/404; vanished roots; duplicate names/case aliases; parent dependencies; lost final upload response; partial 308 acknowledgement; 401 return/throw; cancellation late credentials; crash after remote effect before local commit; no duplicate create/conflict on retry; restart/queue recovery; bounded metadata/revisions.

## Research evidence

Four direct isolated probes of donor source were run, not the full Bun suite: equal-size bootstrap produces addRecord for distinct UIDs; delete/edit produces upload; returned 401 causes no refresh; partial server acknowledgement is ignored in subsequent offset.
Earlier isolated auth probes also found late-cancel/late-refresh races and silent revocation errors.
Live Google operations, real OAuth login, throughput and concurrent API write guards were not tested because this session has no Google account authorization.

Sources:
- https://github.com/hesprs/sync-engine/blob/a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9/LICENSE
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://developers.google.com/workspace/drive/api/reference/rest/v3/changes
- https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/getStartPageToken
- https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference
- https://developers.google.com/workspace/drive/api/guides/manage-revisions
