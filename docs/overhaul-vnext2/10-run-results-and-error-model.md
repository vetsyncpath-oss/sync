# 10. Результаты, ошибки, расписание и семантика профилей

Нормативное дополнение к [README](README.md). Требования R10.1–R10.10. Source findings и приёмка — [traceability](traceability.md), [B01–B80](13-conformance-and-release.md).

## R10.1. Явный результат и идентификаторы

Каждый `requestRun` возвращает ровно один `RunRequestResult`, даже если запуск не был допущен. Каждый admitted run получает уникальный runId, каждый item — stable intentId и attempt/step IDs. Повтор одного intent не считается новым успешным файлом. `batchId`, `cycleId`, `runId` различаются; общий batchId нельзя выдавать за уникальный runId всех jobs.

```ts
type Outcome = 'success' | 'partial' | 'cancelled' | 'rejected' | 'deferred'
  | 'blocked' | 'needs-attention' | 'failed' | 'accounting-required';
interface RunRequestResult {
  requestId: string; jobId: string; admitted: boolean; runId?: string;
  outcome: Outcome; issues: readonly Issue[]; retryAt?: number;
  stopReason?: string; continuation?: ContinuationRef;
}
interface JobResult extends RunRequestResult {
  admitted: true; runId: string; cycleId: string; pairId: string;
  generation: string; policyRevision: string;
  executionOutcome: Exclude<Outcome,'accounting-required'|'rejected'>;
  accounting: 'committed' | 'pending';
  items: readonly ItemResult[]; counters: SettledCounters;
  convergence: 'converged' | 'pending' | 'unknown';
}
```

Types здесь описывают границы, не готовый API patch; concrete declarations должны устранять невозможные комбинации tagged unions. `admitted=false` запрещает effects; разъясняются rejected (invalid request/unsupported mode), deferred (временный admission/cooldown), blocked (нужна внешняя предпосылка), cancelled (явная отмена queued request). Если run не admitted, runId отсутствует, requestId сохраняется в diagnostic history. Pending promise не является способом представления blocked.

| Outcome | Условие |
|---|---|
| success | Все выбранные допустимые work items settled, accounting подтверждён, нет скрытого unresolved work в scope этого запроса; convergence отдельно для всего job |
| partial | Часть допустимой работы settled, остались failures/blocked/deferred items; точные категории сохранены |
| needs-attention | Не осталось автоматической работы, есть решения по конфликтам/unknown; это не network failure |
| failed | Выполнение/планирование не удалось; effects/partial stats не теряются даже если outcome failed |
| blocked | Нет допуска к полезной работе до VAM/account/root/config/repair prerequisite |
| deferred | Временное ожидание имеет reason и retryAt либо explicit next allowed activation |
| cancelled | Запрос отменён; завершённые effects сохраняются; оставшиеся не рестартуют сами |
| rejected | Запрос не принят по валидации/несовместимой capability; это не потеря сетевого ответа |
| accounting-required | Effects имеют результаты, но durable final accounting не подтверждён; запрещён blind replay |

Отказ `confirm=false`, закрытие диалога подтверждения всего запуска и отмена через кнопку обязаны вернуть cancelled. Нельзя возвращать `emptyStats()` для отказа. No-op требует доказанного отсутствия действий; пустой список из failed/partial listing не no-op.

## R10.2. Агрегация и прогресс

`ItemResult` включает logicalFileId, intentId, phase, outcome, effect certainty, bytes transferred/verified и issue IDs. Счётчики uploaded/downloaded/deleted начисляются только после postcondition/receipt; attempt bytes считаются отдельно. Logical deletion canonical path отдельно от retained recovery bytes. Zero-byte file — файл, а не «ничего».

Правила итоговой агрегации, в порядке:
1. Неподтверждённое durable accounting → accounting-required, сохраняя executionOutcome.
2. Явная отмена → cancelled, сохраняя все settled counts и unresolved effects.
3. Смесь settled работы с failure/block/defer → partial.
4. Ошибка без settled работы → failed; отсутствие prerequisite → blocked; временный admission → deferred.
5. Только unresolved decisions, возможно после успешных transfers → needs-attention.
6. Иначе success.

Aggregate batch сохраняет каждый job result; один failed Drive не превращает successful Git в failed. UI не восстанавливает outcome из `failed===0`. `lastAttemptAt`, `lastCompletedAt`, `lastConvergedAt` и `lastSuccessfulTransferAt` отдельны; cancelled/partial не обновляют lastConvergedAt.

## R10.3. Typed errors, область остановки и unknown effects

```ts
interface Issue {
  id: string; code: string; stage: string;
  scope: 'item'|'target-group'|'job'|'account'|'global';
  effect: 'not-started'|'not-applied'|'applied'|'unknown';
  retry: 'none'|'backoff'|'replan'|'reauthorize'|'decision'|'probe'|'repair';
  jobId?: string; intentId?: string; targetKeys?: readonly string[];
  status?: number; providerReason?: string; retryAt?: number;
  messageKey: string; safeDetails?: string; causeId?: string;
}
```

Provider adapters преобразуют documented status/reason и platform error codes на boundary. Ошибки локального FS типизируются отдельно. Regex по `message` допускается только для диагностической подсказки, никогда для scope/retry/destructive decision. Unknown exception — internal-error: job остановлен с сохранением stack/cause в redacted diagnostics; остальные jobs продолжают только при неповреждённой общей authority/storage. Ошибка после отправки mutation по умолчанию unknown, пока postcondition probe не докажет иное.

| Ошибка | Поведение |
|---|---|
| Download конкретного файла, гарантированно без effect | Item failed/deferred; независимые items продолжают; bounded retry |
| Local target изменился | Replan данного item; не overwrite новой локальной версии |
| Collision / reserved target | Target group blocked, unrelated groups продолжают |
| Auth expired/invalid_grant | Account blocked; cancel new requests этого account; unrelated account/jobs продолжают |
| 403 permission / 404 tracked ID | Unknown/decision/probe, не deletion и не автоматический new upload |
| 429/quota | Account/project cooldown; timeout UI не снимает cooldown |
| Corrupt shared ledger / lost global authority | Global writes blocked; browse/diagnostics допустимы |
| Unknown remote/local effect | Target reservations сохраняются; только probe/accounting или явно предусмотренное recovery, не blind retry |
| Checkpoint/summary failure после effect | Accounting-required/repair; transfer не повторяется из-за ошибки журнала |

Dependency graph хранит не только local paths, но remote IDs, ancestor creation/deletion, physical target aliases и shared storage prerequisites. «Продолжить остальные» запрещено, если независимость не доказана.

## R10.4. Отмена и жизненный цикл blockers

Cancel увеличивает run epoch, прекращает admission и новые effects, aborts cancellable requests, завершает queued promises; физически неотменяемые requests остаются учтёнными. Через 10 s UI может выйти из ожидания с `cancelled + unresolved effects`, но reservations и orphan accounting не снимаются. Late callbacks не меняют новый run UI, policy или tokens; могут записать только проверенный receipt старого intent через fenced recovery path.

Blocker хранит `{code, scope, accountEpoch, pairId, configRevision, evidence, nextAction}`. Success одного запроса не стирает все blockers. Reauthorization того же subject снимает только соответствующий auth blocker после проверки актуального grant; другой subject требует reconciliation. Permissions/root/checkpoint blockers снимаются только проверкой своего prerequisite. Manual run не делает blanket clear Map. Подписки завершённых contexts освобождаются.

VAM revoked: блокируется новое execution для всех jobs этой сборки; started ambiguous effects записываются/сверяются без расширения эффекта. Recovery mutations снова требуют VAM. Local read-only diagnostic/export ранее сохранённых recovery bytes доступен без cloud mutation; никакой скрытый soft bypass.

## R10.5. Расписание, startup-only и continuation

Configured schedule (`inherit/off/startup-only/interval`) не равен current activity. Job snapshot всегда показывает effective schedule, source of inheritance, cycle phase, blocker и next retry/finishing timestamp.

Startup trigger возникает один раз после host layout-ready; ожидание VAM/account readiness сохраняет pending trigger. User cancel потребляет текущий cycle; late ready событие не возобновляет его. Reauth без user cancel может продолжить eligible startup cycle в оставшемся retry window. После окна — continuation-required, ручной запуск или следующее разрешённое activation. `off` запрещает новые auto/retry/finishing effects; minimal read-only recovery probe не считается новым auto cycle.

Initial, retry и finishing используют один cycleId и budgets. Finishing назначается после подтверждённых changes или явного remaining-safe-work даже при needs-attention в другом item; не зависит от `outcome==='success'`. Две дополнительные проверки через 5 s, один queued finishing на job. No-op finishing завершает цикл. При исчерпании бюджета остаётся visible pending, не вечный таймер.

Schedule change увеличивает generation расписания; старый timer не действует. Due retry переносится только если новая schedule допускает continuation и user не отменил его. Pause не стирает историю/очередь. Resume делает один catch-up, не проигрывает все пропущенные intervals. Manual coalesces identical pending auto work; force означает fresh observation/replan, не игнорирование ownership, VAM, recovery или conflicts.

Каждый deferred admission имеет durable/in-memory scheduling registration с wake source либо explicit `nextActivationRequired`; pending без таймера и без источника wake запрещён. Неполученный permit не считается выполненной попыткой API. Settings/account/VAM события проверяют epoch перед wake.

## R10.6. Журнал, словари и accounting

Один serialized writer на append/clear/retention. Очистка UI-журнала создаёт clear-watermark по durable event sequence; late append старого события ниже watermark не воскрешает историю. События нового run сохраняются. Clear не удаляет ledger, baselines, queue, pins, recovery или migration receipts.

Terminal row строится из JobResult; повторная доставка events идемпотентна по runId/eventId. Final summary сохраняется либо реконструируется из durable intent receipts. Если neither подтверждено — accounting-required. Ошибка только отображения уже подтверждённого summary — diagnostic degradation, не повтор effects. Reader принимает все девять outcomes, unknown future schema сохраняет как opaque diagnostic и запрещает unsafe writer migration.

Никаких plain-object lookup по непроверенному path/ID: Map/null-prototype + own-key на deserialize/import/lookup/flush. `__proto__`, `constructor`, `toString` легальны как имена вне host path restrictions. Проверять roundtrip, merge и JSON parsing, не только один setter.

Хеши на provider boundary нормализуются в lowercase с hashAlg и exact length; opaque version/ETag не изменяются. Legacy digest token хранится отдельно. Нет auto equality по size или по одному совпавшему mtime.

## R10.7. Полная семантика профилей и конфликтов

Scope/ownership разрешаются раньше поведения. В таблице `L0/R0` — локальный/удалённый объект отсутствует с **доказательством**; unknown не R0. `L=R` — подтверждённое content equality, не размер. `Ldirty` — локальная версия отличается от applied baseline; baseline неизвестен → потенциально dirty. Baseline подтверждает содержимое, а deletion authority требует дополнительно managed receipt и действующую policy.

| Pull write mode | L0,R есть | L=R | L есть,R изменён,L clean | Ldirty или нет baseline, L≠R | R0 |
|---|---|---|---|---|---|
| preserve | Не создавать | No effect | Не менять | Не менять | Не удалять; комбинация с delete≠keep invalid |
| create | Создать | No overwrite; verified adoption по policy | Не менять | Не менять, показать skipped-by-profile | Только явно настроенная delete axis и receipt; builtin seed=keep |
| update | Создать | Verified no-op/adopt | Обновить с recovery | Сохранить L; blocked/needs-attention item, не ложный success overwrite | Delete axis отдельно |
| changes | Создать | Verified no-op/adopt | Обновить с recovery | Rule conflict resolver ниже; incoming не меняет L | Delete axis отдельно |
| remote | Создать | Verified no-op/adopt | Установить R | Установить R с проверенной local recovery; global incoming/local-wins не имеет приоритета | Delete axis отдельно |

`remote` — явное enforce-source независимо от R-changed относительно baseline. Rule conflict применяется только к changes; несовместимые remote+incoming input не интерпретируются как keep-local: validator сообщает ignored/incompatible axis, compiler выдаёт однозначный remote behavior. Во время миграции такого сочетания требуется preview, не тихая смена эффекта.

| Conflict choice для changes | Primary / другая версия |
|---|---|
| local-wins | L остаётся primary; R не считается applied; версия решения сохраняется, чтобы не повторять тот же вопрос |
| incoming | L остаётся primary; R публикуется как local conflict copy; applied local baseline не подменяется hash(R) |
| keep-both | R становится primary, L сохраняется в verified local copy/recovery до replacement |
| ask | Manual получает guarded decision с preview; auto переводит item в needs-attention и продолжает независимые |
| defer/cancel decision | Defer оставляет item pending; cancel whole run только явным действием отмены run |

Для user-visible copies и internal recovery разные retention и authority. Decision receipt включает hashes/IDs/versions: изменившийся counterpart создаёт новое решение, старое не применяется.

| Delete axis (pull) | Условия |
|---|---|
| keep | Никогда не удаляет local из-за remote absence |
| tracked | Только managed local target с applied receipt, complete relevant remote coverage и unchanged local bytes. Dirty/missing permission → decision/unknown |
| mirror/all | Только внутри явно включённого owned scope после preview для расширения. Untracked locals не удаляются за счёт пустого/incomplete inventory; protected/conflict/recovery исключены; local preimage обязателен |

Ни exclusion, ни отключение source, ни loss permission не являются удалением. Trash requested → trash или typed trash-unavailable с сохранением original. Локальный recovery blob не оправдывает молчаливый remove fallback. Drive hard delete не поддерживается.

### Двусторонний Drive, default propagate-trash

| Baseline / наблюдения | Действие |
|---|---|
| Нет base, L0/R0 | No-op, без invented baseline |
| Нет base, L0/R | Download verified bytes |
| Нет base, L/R0, absence доказана | Create reserved ID; postcondition и receipt |
| Нет base, L=R | Verified adopt; existing ID сохраняется; deletion authority явно определяется compiled policy/receipt |
| Нет base, L≠R | Bootstrap proposal; L сохраняется, R не перезаписывается |
| Base, обе стороны unchanged | No-op без per-file checkpoint/ancestor reinspection |
| Base, local clean, remote changed | Download с fresh guard и recovery |
| Base, local changed, remote unchanged | Proposal local version; **L остаётся primary**, R сохраняет ID/content; outcome needs-attention, не converged |
| Base, обе изменились и теперь равны | Verified convergence/adopt новой общей версии |
| Base, обе изменились и различны | Proposal + decision, обе версии сохранены; никакого mtime winner |
| Local missing, remote unchanged | После доказанного local deletion и свежей identity/permissions проверки — remote trash, tombstone |
| Remote explicit trashed, local unchanged | Local trash, recovery, tombstone |
| Delete vs edit | Сохранить survivor и lineage; needs-attention, не автоматическое удаление правки |
| Tracked 404/403/unlisted/relocated | Unknown; не новый upload, не trash; probe/rebind/detach/restore по R12.5 |
| Tombstone, обе отсутствуют/trashed | No-op; compact lineage сохраняет identity и запрещает bootstrap recreation |
| Tombstone, recreated local или новый same-name remote ID | Decision с новым evidence; автоматический resurrection запрещён |

Повтор прежнего proposal не создаёт новые copies. Editable peer artifact — отдельный versioned proposal, не изменение canonical baseline. «Принять remote» — explicit preview, сохраняющий текущую L до замены. «Принять local в существующий ID» недоступно до gate R12.7; UI предлагает разрешённые альтернативы, не обещает завершённый full bidirectional.

## R10.8. Единый бюджет попыток

`RetryBudgetKey = cycleId + jobId + pairId + intentId + stepId`. Step — например metadata page(token), GET object version, upload start(reserved ID), upload chunk(session,offset,length) или trash object/version. Успешная следующая страница/следующий chunk — новый step. Не более пяти sends **одного step** в cycle, включая transport retries, auth replay и scheduler повтор; attempts списываются до отправки. Finishing не обнуляет их. Серверный upload status probe — отдельный read step с ограничением; общий per-intent mutation replay не более пяти попыток одного и того же effect, не пяти разных chunk offsets.

Queue хранит attempts, firstFailureAt, nextRetryAt, expected versions, origin, typed issue, payload pins; merge не затирает diagnostics. После сбоя persistence budget до mutation отправка не допускается. Read-only transient counters допускаются memory-only, но restart не повторяет автоматически отменённый/исчерпанный startup cycle как новый.

Delay для retry ordinal r (первый r=0): `jitter=random(0,min(900000,5000*2^r))`; local minimum scheduling delay 1 s предотвращает hot loop. `nextRetryAt=max(now+max(1000,jitter), validatedServerRetryAt, accountCooldown)`. Retry-After поддерживает seconds и HTTP-date; malformed hint даёт diagnostic и bounded fallback. Server cooldown может превышать local cap.

Scheduler сам не содержит второй независимой лестницы. Для interval следующая разрешённая активация может открыть новый cycle, но persistent item `automaticFailureCycles` ограничен пятью подряд циклам без прогресса; далее explicit parked/manual. Progress означает подтверждённый эффект или устранение причины, не новый timestamp. Existing legacy attempts не сбрасываются; importer сохраняет обе старые метрики и консервативно расходует новый budget.

Неидемпотентный/unknown effect не ретраится через эту формулу: сначала read-only probe, затем settlement или guarded resume. Quota wait не удерживает active transfer permit и не обещает UI «ждём внутри запроса», если фактически возвращён deferred.

## R10.9. Общие ошибки адаптеров

Promise guard покрывает synchronous throw до создания request и async body failure. Все timers/listeners/readers освобождаются в finally. Physical orphan не вызывает unbounded replacements: admission ограничен, каждое ожидание заканчивается result. После timeout пользователь видит scoped degradation и recovery requirement. Общий EOF/empty body/404 не преобразуется в пустой успешный manifest.

## R10.10. Доказательство реализации

Тесты обязанны проверять production seam: host request→job executor→queue/scheduler→journal/UI. Unit test resolver сам по себе не закрывает ложный success на host boundary. P1–P15 превращаются в утверждения нового поведения; P12 уже опровергал внешний баг и не обязан «падать до исправления». Условие red-before/green-after относится только к regression test **подтверждённого дефекта**, не ко всем историческим probes.
