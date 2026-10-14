# Runtime, ошибки и расписание

Нормативная часть [Overhaul vNext](README.md). `main.ts` становится host composition root; orchestration и error classification уходят в тестируемые core services.

## 1. Компоненты и ответственность

| Компонент | Владеет | Не владеет |
|---|---|---|
| JobManager | Validated definitions, activation epoch, trigger admission, агрегированный snapshot | Выбором conflict winner, FS effects |
| JobRuntime | Schedule state, queue/inbox references, current run, последнее завершение | Правами другого job |
| RunContext | Immutable policy/bindings, RunSnapshot, abort/deadlines, plan, counters | Вечной inventory connection |
| AccountContext | Token refresh singleflight, grant identity, quota/cooldown, account auth state | Baseline всех jobs одного account |
| BindingCompiler / AuthorityRegistry | Projection, owner witnesses, reservations | Сетевыми попытками |
| Planner | Provider-aware immutable operation graph | Mutation side effects |
| Executor | Staging, durable prepare, capability guards, effects/probes/receipts | Самостоятельным policy fallback |
| Store services | Ack/verification, generation registry, pins, retained histories | Повторной синхронизацией при load |
| UI projections | Tree/job/plan/inbox/journal snapshots | Неявным запуском или угадыванием success |

Manager создаётся inert. Load/validation/recovery discovery/ownership validation завершаются до регистрации timers. У одного JobRuntime максимум один исполняемый run; новые triggers coalesce в bounded запрос следующего run. Manual не прерывает auto write и не создаёт параллельный retry loop.

Host registration: `onload` регистрирует commands/status hook и inert manager; после acknowledged settings load/ownership verification и layout-ready активирует eligible schedules. Online event будит только due work с fresh validation, offline приостанавливает network admission без изменения configured interval. Governance/VAM block имеет отдельную host reason и не маскируется как provider error. Storage discovery/read не запускает обычный sync; command/manual/retry/decision получают явный job selection.

```ts
interface RunContext {
  jobId: JobId; runId: RunId; pairId: PairId; generation: DataGeneration;
  epoch: Epoch; policyRevision: PolicyRevision; trigger: Trigger;
  signal: AbortSignal; snapshot?: RunSnapshot; plan?: SyncPlan;
  authority: ScopedAuthority; store: JobStatePort; budget: ResourceLease;
}
type Trigger = 'manual' | 'startup' | 'interval' | 'retry' | 'finishing'
  | 'decision' | 'restore-missing' | 'reconcile';
```

## 2. Pipeline одного job

`admit → validate → recover/probe → observe → compile bindings → plan → stage → apply → verify → persist receipts/baselines → finalize`.

1. Admission фиксирует definition/epoch. Проверяет enabled, scope, auth и blockers, не удаляет очередь при отказе.
2. Recovery discovery проверяет persisted integrity и unresolved reservations. Безопасные probes разрешены даже при запрещённых new effects. Неизвестный effect удерживает его targets; остальные owner-disjoint items могут продолжаться.
3. Remote/local observations принадлежат run. UI preview snapshot не становится execution inventory без freshness/version доказательства. На run создаётся свежий provider session; object metadata revalidation выполняется перед effects.
4. Binding compiler использует глобальную policy, затем выбирает winning scopes этого job/direction. Pull и Drive branches не исполняют один physical target дважды.
5. Planner классифицирует ordinary change, conflict, deleted, unknown, unsupported и artifact; сохраняет explicit blockers и dependencies.
6. Staging скачивает/хеширует и проверяет payload; не меняет пользовательские файлы. Local editor dirty/CAS guard повторяется перед publication.
7. Executor применяет DAG: готовый независимый item продолжается при decision/error другого. Copy-before-replace/trash — dependencies одной operation group.
8. Receipt подтверждает реальное postcondition, затем baseline/pending delta записывается с ack. Потеря receipt/ack создаёт recovery requirement, не success.
9. Finalize сохраняет job result и journal, releases только settled leases и предлагает retry/finishing. `finally` освобождает ephemeral provider resources; durable pending остаётся.

Observe failure Drive A не блокирует Git B, если authority уже доказала их независимость. Shared authority corruption блокирует все jobs, которым нельзя доказать безопасные writes. Ошибка одного account блокирует его jobs, а не все providers. Зафиксированный partial plan не даёт права удалять отсутствующие элементы неполного inventory.

## 3. План и решения

```ts
interface SyncPlan {
  planId: string; jobId: JobId; runId: RunId; pairId: PairId;
  generation: DataGeneration; policyRevision: PolicyRevision;
  snapshotId: string; createdAt: number;
  items: readonly PlannedItem[]; summary: PlanSummary;
}
interface PlannedItem {
  itemId: string; logicalFileId: string; bindingId: string;
  localPath: string; remote?: RemoteLocator; kind: OperationKind;
  expectedLocal: LocalObservation; expectedRemote: RemoteObservation;
  dependencies: readonly string[]; owner: OwnerWitness;
  blockers: readonly Blocker[]; proposalId?: string;
}
```

Kinds включают adopt, download/create/replace, upload-new, proposal-copy, trash-local, trash-remote, restore, move-review, decision, unknown и skip. Preview показывает provider direction, actual IDs и причины; legacy `downloads/deletions/moves` — адаптер, не полный Drive plan.

Consent привязан к plan/item IDs, pair/generation, policy revision, local digest и remote version. Нельзя применить согласие по одному пути к новой версии файла. Decision handler получает конкретные inbox/item IDs, делает targeted fresh observation и либо исполняет разрешённый choice, либо показывает updated conflict. Он не запускает весь global sync с вопросами.

Replan допускает новые unrelated items, но они не включаются в уже подтверждённую destructive choice. Manual «синхронизировать» строит новый plan; preview из settings draft допускает read-only estimation, apply требует acknowledged settings.

## 4. Ошибки и область воздействия

```ts
interface JobIssue {
  code: IssueCode; scope: 'item' | 'job' | 'account' | 'authority' | 'storage';
  jobId?: JobId; itemId?: string; stage: Stage;
  retry: 'none' | 'backoff' | 'reauthorize' | 'replan' | 'decision' | 'repair';
  retryAt?: number; effect: 'not-started' | 'not-applied' | 'applied' | 'unknown';
  safeMessage: string; details?: RedactedDiagnostic;
}
```

Ошибка не классифицируется regex по английскому message. Adapter переводит typed HTTP/API/host errors в domain codes. Unexpected exception становится `internal-error`, сохраняет sanitized cause и stage; assertions не превращаются в обычный file skip.

| Причина | Поведение |
|---|---|
| 401 / invalid grant | Один refresh/replay; затем account auth-required, без бесконечного запроса входа |
| 403 | Разбирать Drive reason: permission — job/item blocker; rate/user quota — cooldown/backoff; не все 403 постоянные |
| 429, 408, 5xx, transport timeout | Bounded backoff; после ambiguous mutation сначала probe, не слепой replay |
| 404/410 объекта | Unknown evidence; не local trash и не вечный неадресуемый pending |
| Incomplete inventory / missing root | Job observe error; browse сохраняет stale snapshot с явным возрастом; deletion запрещён |
| Collision | Block конкретной target group; остальные доказанно независимые groups продолжаются |
| Dirty editor / stale local/remote | Item replan/decision; не overwrite и не общий permanent auto block |
| Unsupported type/size/capability | Visible skip/block с actionable reason, без периодического бесполезного retry |
| Metadata corruption / failed intent save | Блок затронутого store/domain до repair; новые external effects не начинаются |
| Payload quota / ENOSPC | Stop staging/new effects, сохранить уже сделанное; существующие protected payloads не удалять ради места |
| Journal write error после effects | `accounting-required`, подтвердить effect recovery state; не повторять upload из-за отсутствия journal |
| Cancel | Outcome cancelled только для остановленного work; неизвестный published effect остаётся recoverable |

Queue entries адресуются jobId + logicalFileId + operation intent, а не только local path. Каждый entry хранит attempts, nextRetryAt, typed reason, expected versions и payload reference при необходимости. Permanent blockers и inbox не считаются retryable failed files. Retry actions работают со selected jobs/items и свежим plan; stale queue entry не имеет authority сам по себе.

Backoff default: full jitter, base 5 секунд, cap 15 минут, учитывать server `Retry-After`; не больше 5 mutation/transport attempts за один automatic cycle на item. Длительный server cooldown может превышать cap и уважает provider hint. После budget exhausted entry остаётся видимым до следующего разрешённого cycle/manual, без tight loop.

Read retry использует тот же attempt budget, чтобы transport и scheduler не умножали 5×5 попыток. Proposed startup retry window — 30 минут с первого transient failure, не limit всей первоначальной большой синхронизации. Если server retryAt выходит за window, startup work остаётся visible pending до manual/следующего activation; source не помечается permanent-blocked. Finishing run не сбрасывает attempts/window.

Request deadlines: metadata/read response default 60 секунд; transfer progress watchdog 60 секунд без продвижения, полноценный большой transfer не ограничен 60 секундами. Observe-stage default 10 минут с visible partial/cancel outcome; увеличение лимита явно configurable. Timeout после начала mutation всегда даёт probe/unknown semantics. Cancel/quiescence UI ждёт default 10 секунд, затем показывает retained recovery/block reason; manager не активирует нового writer на unsettled targets только потому, что UI перестал ждать.

## 5. Расписание

Canonical input: `connection.auto ?? inherit`; `inherit` разрешается через global `autoSyncInterval`. Scheduler получает только `off|startup-only|15m|30m|1h|2h`; undefined/inherit не передаётся в interval lookup. Изменение глобального schedule затрагивает только наследующие jobs.

Job schedule snapshot содержит configured input, resolved interval, paused/disabled, current activity, block reason, startupCycle, nextPeriodicAt, nextRetryAt, finishing state и lastAutoResult. `nextPeriodicAt: null` после startup не означает off.

Startup cycle начинается один раз на host activation, после layout readiness и default 30 секунд delay. Reload settings без нового host activation не потребляет startup повторно. Вновь включённый job получает explicit activation cycle; это видно в status. Pause остановляет timers новых auto runs, не отменяет уже опубликованные effects.

После первоначального прохода и каждого effect-changing finishing run выполняется проверка сходимости, включая независимые файлы при незакрытых конфликтах. Default максимум 2 finishing runs сверх initial, delay 5 секунд; только один pending finishing trigger на job. Они не зависят от общего `outcome === ok`, но не выполняют unknown/decision work без prerequisites.

Retry и finishing отличаются: finishing проверяет последствия успешных изменений, retry повторяет разрешённую transient работу. Исчерпанный finishing budget показывает `continuation required`, не бесконечный background loop. Startup-only transient retries продолжают этот же cycle по nextRetryAt; после budget остаётся manual/следующий startup. Новые изменения спустя часы не синхронизируются сами без нового разрешённого trigger.

`off` не запускает auto retry/finishing для обычных новых файлов. Startup/off не запрещает minimal read-only probe уже начатой операции при следующем загрузке: подтверждение ранее разрешённого effect отделено от нового sync. Любая recovery mutation всё равно проверяет recorded intent, текущие permissions и reservations.

Manual run coalesces pending auto run без повторного исполнения идентичных intents. Due interval ticks не накапливают неограниченную очередь. Если cancel пользовательский, immediate finishing/retry не возобновляет отменённую работу; следующий explicit/разрешённый trigger видит сохранённое pending состояние.

## 6. Lifecycle и отмена

Reload: stop trigger admission/timers → request cancel → await quiescence/probe-or-mark-unknown → retain unsettled leases → verify candidate config/ownership/stores → acknowledged activation → new epoch → start eligible jobs. Ошибка до activation оставляет старую verified конфигурацию, после чего её timers можно возобновить без дубля startup.

Read timeout может логически закончить UI ожидание даже при noncooperative port; его поздний ответ отбрасывается по epoch/request ID. Write timeout не освобождает target: внешняя запись могла пройти. Durable intent, payload и reservation сохраняются; новый writer допускается только после reconciliation.

Provider dispose различает connection-level pool/token и run-level snapshot/temp archive/locators. Plugin unload очищает listeners/timers/OAuth server и просит отмену; durable pending переживает shutdown. Нельзя обещать, что чужой HTTP запрос физически прекращается вместе с abort.

## 7. Результаты, ресурсы и события

Job outcome: `success`, `partial`, `needs-attention`, `failed`, `cancelled`, `blocked`, `accounting-required`. Состояние activity (`idle/queued/observing/planning/staging/applying/verifying/finalizing`) отдельно. Unchanged job с unresolved review — needs-attention, не failed и не converged.

Batch result сохраняет каждый job outcome; aggregate label не скрывает partial success. `lastAttemptAt`, `lastCompletedAt`, `lastConvergedAt` различаются. Counters считаются по уникальным intent/proposal IDs, не по сумме повторных rows. Progress разделяет observed/planned/settled files и upload/download bytes; zero-byte metadata не притворяется transfer.

Начальные defaults: максимум 2 одновременно observing/staging jobs, serial apply, до 4 transfer workers глобально с учётом provider caps, 128 MiB общий буферный budget. Текущий Drive per-file limit 64 MiB сохраняется по умолчанию; размер больше budget не выделяется сверх лимита без streaming. Выбор больших limits UI ограничивает budget/capability. Quota gates общие на provider/account/project, не отдельные безлимитные Semaphore каждого job.

```ts
interface JobEvent {
  sequence: number; jobId: JobId; runId?: RunId; epoch: Epoch;
  policyRevision: PolicyRevision; kind: string; at: number;
  itemId?: string; snapshot: Readonly<JobProjection>;
}
```

Подписчик получает initial snapshot и ordered updates; callbacks unsubscribe при закрытии UI. Late/foreign epoch события не переписывают текущую activity, но accounted old effects появляются в history. UI не вычисляет собственный auto status из aggregate timer. Legacy public VaultSync hook получает backward-compatible aggregate плюс versioned optional jobs; источники listener не получают tokens, signed URLs или payload bytes.
