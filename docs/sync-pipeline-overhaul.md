# Synchronization pipeline overhaul

The previous pipeline reported only completed buffers, used renderer `fetch` for
Yandex downloads, and counted historical queued failures as errors in a new run.
A large folder could appear stuck at a few kilobytes before displaying many errors.
This change makes transport activity, pending work and application results explicit.

## Download and progress

- Desktop Git, Yandex and Google Drive use a Node HTTP transport outside renderer
  CORS. It follows at most five redirects, strips sensitive headers across origins,
  rejects HTTPS downgrades, and honors cancellation before headers and during body
  reads. WebDAV retains its no-redirect credential policy.
- Header and body inactivity timeouts default to 60 seconds. Body activity resets
  the inactivity timer. A desktop HTTP request also has a 30-minute time budget;
  retry waits have a separate bounded budget and long Retry-After waits are deferred.
- Mobile public downloads use Obsidian `requestUrl`. It exposes neither response
  chunks nor physical cancellation. The panel states that bytes appear after the
  complete response. A cancelled result cannot be applied; a shared transport gate
  retains the OS request's slot until it settles, preventing overlapping abandoned
  requests in the same plugin instance. Mobile WebDAV still uses native fetch to
  enforce no redirects and therefore requires a CORS-compatible endpoint.
- The panel shows active source/path, stage, attempt, host, retry deadline, last
  activity, completed-file count and current failures. Byte updates are throttled
  to 150 ms. Download progress and archive inventory progress are separate stages;
  receiving or checking a payload does not imply that it was applied.
- API, data verification, directory preparation, application, checkpoint and final
  failures preserve typed diagnostic context. A bounded trace of up to 500 stage
  transitions is exported with a build tag, platform, results and pending queue.
  Dropped trace transitions and result totals remain explicit. Signed URL queries,
  URL credentials and authorization values are redacted; file contents, connection
  settings and credential fields are not exported.

## Retry and result semantics

`failed` counts failures observed in this run. `pendingBefore` / `pendingAfter`
count unresolved participating paths. `retryScheduled`, `blocked`, `notAttempted`,
verified `received`, accepted `downloaded` and changed primary files (`updated`)
are separate counters. `notAttempted` includes package members whose application was deferred even when a staging download completed. Excluded/preserved paths and paths outside a targeted retry
remain in history but do not block unrelated permitted deletions.

Per-file transient failures, including size/digest mismatches, have a bounded automatic
retry budget (10 retries after the first failed run). Backoff grows from one minute
to six hours with jitter and respects server delay. Exhausted or permanent failures
require explicit retry after repair. Three repeated transport failures stop new
work for that source; its cooldown survives subsequent sessions. An expired
cooldown permits a serialized probe; a verified response reopens normal work.
File-specific integrity failures do not by themselves disable other files.

Manual retry can select a single path and retains comparison baselines and profile
protections. A changed plugin/theme runtime package expands that retry to its
participating runtime members. Force never bypasses Preserve/Create protections,
content verification or recovery. No automatic deletion is executed.

## Session ownership, cancellation and schedules

The final result is published after required persistence and source cleanup. A late
checkpoint failure remains a structured session problem rather than an earlier
success. Cancellation closes current preview/conflict prompts and prevents queued
prompts opening. An already started host file write must settle before ownership
is released; applied files remain applied. Auth probes contain synchronous errors
as well as rejected promises without changing the access verdict.

Each assigned connection can inherit the global interval, be manual-only, run once
at startup, or use its own interval. Source ownership/routing remains global while
only selected inventories are fetched. Startup-only is one event per scheduler
lifetime, including pause/resume and interval changes. Busy/offline ticks coalesce
into one pending catch-up on availability. Pause affects future starts and updates
an open panel immediately; it does not cancel the current run. Permanent metadata/session
failures stop automatic starts until the cause is repaired and a manual run is made.
Missing-file restoration uses one inventory and one accepted plan.

## Files, storage and recovery

- The pipeline checks cache publication, ledger capacity, recovery capacity and
  parent file/folder collisions before payload downloads. A shared metadata failure
  stops the session without manufacturing a new file error for every remaining path.
- A corrupt manifest projection is quarantined before verified republishing. The
  authoritative operation ledger remains fail-closed. Corrupt diagnostic journal
  bytes are backed up before replacement; unreadable diagnostic history is retained.
- Recovery can explicitly prune eligible completed history older than 30 days.
  Current baselines, latest applied effects and unfinished operations are protected.
  Pruning is a checksummed operation; a crash before its next checkpoint can replay
  it safely. Unreferenced old recovery objects can then be collected. The recovery
  dialog requires a separate confirmation and states that deleted copies cannot be
  restored; export important copies first. Cleanup is never automatic.
- Storage limits can be raised without discarding history (default 512 MiB recovery,
  10,000 operations). Desktop file buffers default to 64 MiB per file with a weighted
  concurrency budget; an explicit setting permits 4–256 MiB. Mobile file buffers
  remain bounded to 16 MiB. This is payload budgeting, not an OS-level RAM guarantee:
  hashing, host APIs, snapshots and GC add overhead.
- New hidden desktop configuration files use exclusive filesystem creation where
  the host adapter exposes its base path. Existing binary/CSS replacements retain
  version checks and verified recovery. This is not a filesystem CAS guarantee.
  Open Markdown editor text is compared with saved bytes before primary mutations.
- Changed runtime members of one plugin/theme are fetched and verified together
  before the first member is written. A failed member defers sibling writes. This
  prevents partial updates due to later download/digest failures. Host write errors,
  external concurrent edits, cancellation between commits or plugin reload can
  still leave a partial package: commits are per file, not a filesystem transaction.
- ZIP raw DEFLATE uses a bundled portable inflater, fixed output allocation and
  bounded chunks. Actual output cannot exceed the declared size; compressed reads
  and uncompressed entries are bounded, and cancellation is checked between chunks.
  A ZIP entry is limited to 64 MiB. Mobile full archives require known Content-Length
  and at most 32 MiB (or a smaller user limit); the host can still allocate its
  complete response before exposing it. Desktop archives stream to temporary files.
  A new manifest always downloads a fresh archive; disposal releases that snapshot.

## Validation and remaining host checks

`npm run verify` runs the existing regression suite, new state/transport/UI tests,
TypeScript, generated CSS and the production build. Real local HTTP tests cover
renderer-fetch failure, live slow streams, stalled bodies, pre-header cancellation,
redirect credentials, 429, announced/chunked size limits and archive cancellation.
Portable ZIP tests cover valid DEFLATE and forged output sizes. State tests cover
old/excluded queues, same-version repair, cooldown, quotas, late checkpoints,
unanswered prompts, one-inventory scan, package staging, cache recovery and pruning.
Browser checks exercise the actual panel at desktop and 425/375-pixel mobile widths,
including active attempts, waiting, focus/search retention, pause and targeted retry.

The user's actual signed Yandex download URL and installed Obsidian host were not
available. No claim is made that its exact CDN failure was reproduced. Validate one
problematic CSS with Connections → Test a sample download, then inspect/export the
stage, host, HTTP status and attempt from that installed build. Real Obsidian mobile
network behavior, hidden-path creation, unsaved-editor races, plugin activation and
OS fsync/power-loss guarantees still require host acceptance testing. The repository
has no tracked plugin manifest; production build is not itself an install package.
