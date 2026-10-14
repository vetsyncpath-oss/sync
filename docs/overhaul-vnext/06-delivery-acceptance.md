# Внедрение, traceability и критерии приёмки

Нормативная часть [Overhaul vNext](README.md). Здесь перечислены необходимые будущие проверки; они **не заявляются пройденными** текущим пилотом. На базе пакета проходят 390 текущих тестов, typecheck и build по последней проверке `aa1a561`; это не доказательство готовности новых contracts.

## 1. Вертикальные этапы

| Этап | Результат / зависимости | Exit gate |
|---|---|---|
| S0: Drive correctness prerequisites | Raw ID browse+typed collisions, proposal lineage/inbox, no-op delta, own-key metadata; без wholesale storage cutover | A01–A10, A30–A34; raw tree открывается, copies видны peer, warm IO bounded |
| S1: authority compiler | Stable jobs/pairs, symbolic routing/ownership, actual remote overlap, settings compatibility fence | A11–A24, A49–A52; неизвестность owner не fail-open |
| S2: independent job runtime | JobManager inert activation, per-job queues/schedules/status, shared ledger/serial apply, pull+Drive runners wired | A25–A29, A35–A43; Drive error не блокирует независимый Git |
| S3: immutable planning + UI | Unified provider-aware plan, tree/inbox/job events, targeted stale decisions, preview parity | A44–A48, A53–A61; UI показывает реальные effects и при запуске не выключает auto |
| S4: state/recovery cutover | Verified importer, all-generation refs/live pins, receipts, tombstones, journal accounting, old-build fence | A62–A74; crash matrix без потерянных/повторных effects |
| S5: throughput | Bounded staging parallelism, memory/account/project gates, measured hashing/delta/index costs | A75–A79; perf evidence и race fixtures, serial apply остаётся default |
| S6: live compatibility/release | Real desktop/two-vault/foreign-client Drive; packaged manifest/versions/license; rollback rehearsal | A80–A87; documented actual capabilities, не расширять existing-ID gate автоматически |

S0–S3 работают с supported shared stores; tombstone/no-op/proposal additions могут потребовать versioned Drive reader раньше полного S4. Writer fence выпускается **до** активации новых semantics, а не в конце после первых writes. Parallel metadata work не означает concurrent commits.

Первая end-to-end единица: Drive job с одним plugin-path файлом и collision/inbox плюс независимый Git job, настоящий host mapping и failure injection. После измерения этой единицы оцениваются следующие объёмы; календарные оценки V6 не принимаются как обязательство.

## 2. Карта текущих модулей

| Сейчас | Целевое изменение |
|---|---|
| `main.ts`: routingContext/prepareSession/executeSync/runSession | Composition root + JobManager ports; запрет общего cache/queue swap между jobs |
| `coordinator.ts` | Pull runner под RunContext, scoped queue/state/authority; не singleton owner всех sources |
| `drive-coordinator.ts`, `drive-planner.ts` | Drive runner под тем же JobContext, operation graph/proposals/typed observations |
| `routed-source.ts`, `source-bindings.ts`, `policy.ts` | BindingCompiler/projection/inverse locators; temporary adapter до parity |
| `profiles.ts`, `file-rules.ts`, `profile-policy.ts` | Canonical compiler/provenance/symbolic validation; legacy input readers сохранены |
| `gdrive-client.ts`, `gdrive-oauth-source.ts` | Raw ID graph + run sessions; typed errors/capabilities; existing-ID gate retained |
| `scheduler.ts`, `queue.ts` | One job schedule/retry admission; startup cycle semantics; no shared path-only queues |
| `operation-store.ts`, `drive-state.ts`, `manifest-cache.ts` | JobState partition views → verified backend; deltas/receipts/retained generation registry |
| `durable-mutations.ts`, `dirlock.ts`, `resource-gate.ts` | Shared authority/reservations, host capabilities, budgets и pins |
| `recovery-store.ts`, `migration.ts`, `journal.ts` | Pin-aware GC/import receipts/additive journal identity/accounting |
| `sync-workspace-modal.ts`, `tree-walk.ts`, `source-inventories.ts`, `source-path-modal.ts` | ID-aware tree/projection/browse cache; stamped requests; job inspector |
| `profile-library.ts`, `policy-editor.ts`, `file-rules-editor.ts`, assignments/exclusions UI | Один draft/effective preview, profiles без duplicate coverage |
| `sync-popover.ts`, `status.ts`, `statusbar-view.ts`, `vam-status-modal.ts` | Shared JobProjection, schedule/evidence/attention отдельны; governance reason не global network failure |
| `operation-table.ts`, `conflict-modal.ts`, `recovery-modal.ts`, `journal-modal.ts` | Provider-aware plan/inbox/verified actions и job/generation filters |
| `gdrive-folder-picker.ts`, `source-connection-modal.ts`, OAuth adapters | Success-only history, stable ID selection, account lifecycle/reauthorize |
| `vault-sync-hook.ts`, i18n, styles | Backward-compatible optional jobs events, RU/EN, accessible panes/keyboard |

Удаление old modules — отдельный diff после parity, а не предпосылка нового design. Host capability/test fixtures обновляются вместе с runners; mock port не должен обходить настоящую policy.

## 3. Приёмочные сценарии

### Дерево, collision и proposals

| ID | Сценарий | Обязательный результат |
|---|---|---|
| A01 | Один binary file в `.obsidian/plugins/example/main.js` | Raw browse проходит; own plugin protected, other plugin package permission отдельно |
| A02 | Один ID дважды на страницах, одинаковая metadata | Один node, repeated-object diagnostic; не `Drive path collision` |
| A03 | Один ID, разные version/parent | Unstable, bounded reobserve; никакой случайной версии для mutation |
| A04 | Два IDs с одним именем / две одноимённые папки | Оба nodes/ветви; второй выбирается по ID; ambiguous target blocked |
| A05 | Case/NFC alias, file-dir, ancestor, two mappings | Typed target group diagnostic с обоими locators/rules; unaffected items продолжаются |
| A06 | Excluded/unsupported Doc совпадает именем с included binary | Browse оба; executable collision только participating targets |
| A07 | A создаёт conflict artifact, B загружает | B видит validated artifact в origin scope без recursive copies; hard protection остаётся |
| A08 | `first → second → first` edits на одном canonical base | Две distinct proposals; первая повторно использована, ссылки не перезаписаны |
| A09 | Review+новая правка+retry crash | Unique proposal counts; same intent сохраняет reserved copy ID и payload |
| A10 | `constructor`, `toString`, `__proto__`, uppercase API checksum | Нет inherited-key ошибки; checksum normalized на boundary; независимый файл исполняется |

### Политика и ownership

| ID | Сценарий | Обязательный результат |
|---|---|---|
| A11 | 0 defaults / exact root assignment вместо default | Assignments-only работает; неиспользуемый default не загружается |
| A12 | Vault минус Private + future folders + nested reinclusion | Sparse scope semantics идентичны до/после compile/migration |
| A13 | Exact file, deep folder, names, equal rules | Current per-axis precedence; equal conflicting sources rejected |
| A14 | Named folder rule и отсутствующий descendant | Symbolic ownership заранее учитывает basename в subtree |
| A15 | Disabled/auth-failed job B и выбранный A | A не получает scope B и не очищает его state/queue |
| A16 | Bidir parent, explicit old pull profile child | Child не upload/trash remote; mixed job корректно отображён |
| A17 | Nested remote mapping → local overrides | Прямой/обратный locator parity; ambiguous inverse blocked |
| A18 | Same local alias/same ancestor/package у двух jobs | Shared authority запрещает conflicting effects до mutation |
| A19 | Два roots одного Drive / два accounts с одним file ID | Remote write overlap проверен глобально, independent reads разрешены |
| A20 | Retired namespace pending на новом target | Новый owner blocked до settle/import; история не потеряна |
| A21 | Change name/token/schedule/profile, unrelated Git mapping | Drive baseline/pair не сбрасываются |
| A22 | Change Drive root/principal/actual relevant mapping | Fenced reconcile, candidate generation, no guessed bootstrap |
| A23 | Profile preserve/seed/safe/source/conflicts upgrade | Без новых deletions/uploads/prompts/copies; IDs неизменны |
| A24 | Full pull mirror при соседнем Drive и другой ownership | Provider evidence scoped; Git deletion не blocked соседним provider, чужие файлы не удалены |

### Runtime, ошибки и расписание

| ID | Сценарий | Обязательный результат |
|---|---|---|
| A25 | Drive list timeout, Git ready | Git завершается; Drive failed/queued retry, batch partial |
| A26 | Conflict/404/collision на одном item | Остальные independent items продолжаются; inbox адресуемая |
| A27 | Shared authority corrupt / payload store fatal | Зависимые writes fenced, отсутствует false per-job safety |
| A28 | Failed intent/receipt/baseline/journal save | Boundary-specific accounting/recovery; no false success/no duplicate effect |
| A29 | Unexpected exception / typed file stale | Internal-error отдельно от stale; никакого regex fall-through в generic IO |
| A30 | 404 + local exists / local manually deleted | Не perpetual anonymous pending и не guessed deletion; explicit inbox resolution |
| A31 | Existing-ID local update / unsupported local-wins answer | ID сохраняется; proposal/review; запрещённый choice отклонён, не тихо заменён |
| A32 | Remote-only change и unchanged local | Normal update, conflict preference не перехватывает |
| A33 | Local delete/remote edit и remote trash/local edit | Copies saved до final effect; restore/review сохраняют changed content |
| A34 | Tracked deletion обеих сторон + повтор/offline | Tombstone сохраняет lineage; next run не bootstrap upload |
| A35 | `inherit`/undefined/global/off/startup-only | Valid interval; нет NaN timers; UI показывает resolved input |
| A36 | Startup completed, next periodic null | «При запуске · завершено», auto не off |
| A37 | Startup transferred + unresolved conflict | Finishing для independent work запускается, не требует aggregate ok |
| A38 | Finishing меняет файлы / exhausted budget | Не более 2 finishing сверх initial; continuation visible, no infinite loop |
| A39 | Retry-After/429/403 quota/401 invalid grant | Account cooldown/reauthorize scope; max budget, unaffected providers работают |
| A40 | Late callback после cancel/reload/timeout | Старый epoch не меняет новый state; unknown effect lease/payload retained |
| A41 | Manual click во время auto / frequent interval ticks | Same-job triggers coalesced; no competing retry loop |
| A42 | Pause/off/cancel после initial | Новые auto effects не продолжаются самовольно; pending accounted/probe отдельно |
| A43 | Settings reload/failed activation/plugin unload | Timers не стартуют до validation; old verified state или fenced recovery; subscriptions cleaned |

### План и UI

| ID | Сценарий | Обязательный результат |
|---|---|---|
| A44 | Full Drive plan create/download/copy/trash/unknown | Preview соответствует actual permissible effects и counters |
| A45 | Remote/local изменились, пока открыт conflict | Targeted refresh; новое destructive consent, никакого old snapshot apply |
| A46 | Close conflict/progress и reopen | Решение осталось pending; UI close не cancel; same run без дубля |
| A47 | Retry selected queue/inbox IDs | Только selected eligible work; no global question sync |
| A48 | Force reconcile / restore missing | Pending/baseline не стирается; restore-missing не upload/delete |
| A49 | ID anchor/exclusion для duplicate name | Один конкретный object выбран, default sibling не проскочил по path |
| A50 | ID override вне scope/own plugin/ambiguous inverse | Hard protection, explicit include и ownership checks, no write expansion |
| A51 | Loss settings ack / old build ignores enabled | Draft сохранён; candidate не active; unsupported writer fenced где поддержан |
| A52 | Bulk profile / switch view / mapping edits | Source/names/exclusions/draft сохранены; no hidden coverage switch |
| A53 | Stale browse after failed refresh / late old account response | Last snapshot labelled stale; late response discarded; no empty success |
| A54 | Two duplicate labels + sorting/refresh/keyboard | Focus/selection по keys; action попадает в правильный ID |
| A55 | Folder mixed sources/directions/future overrides | Mixed badge не выводится из одного witness файла |
| A56 | Picker Back/Forward fails / duplicate folders | History/current обновлены только success; выбран actual ID |
| A57 | OAuth callback не приходит / token port hangs | Current deadlines/cancel/copy URL; нет вечного «ожидание» |
| A58 | Readonly grant / client config same vs changed | Write disabled до reauth; same import idempotent, changed client grant не переиспользуется |
| A59 | Successful Git + failed Drive + proposals | Status/journal отражают partial outcomes и last convergence отдельно |
| A60 | Remove connection/shared revoke/legacy journal | Scoped lifecycle; shared tokens/history не удалены случайно; names совместимы |
| A61 | RU/EN, narrow pane, ARIA/keyboard, hook subscriber throws | Same semantics, accessible focus, unsubscribe; pipeline не ломается |

### Хранилище и crash matrix

| ID | Сценарий | Обязательный результат |
|---|---|---|
| A62 | Crash на prepare/effect/probe/receipt/baseline boundaries | Доказанный terminal либо persisted unknown; never blind duplicate mutation |
| A63 | Upload lost final response / 409 / expired resumable | Same reserved ID/payload; inspect/probe, verified digest/parent |
| A64 | GC races dedup/save/live staging | Pin barrier не даёт удалить referenced blob |
| A65 | Old/retired/current generation refs | Все retained roots учитываются; unsupported/corrupt store не GC как мусор |
| A66 | 1,000 no-op runs + churn namespaces/checkpoints/.previous | Bounded writes/retention; no per-file full checkpoint, candidates verified |
| A67 | Cleanup fails / disk quota exhausted | Maintenance/admission issue; protected data сохранены, no repeat upload |
| A68 | Migration ambiguous owner / chain partition | Retained legacy recovery domain; receipts, не rename-only |
| A69 | Migration Drive pending/review/copy/directory/resume state | Все IDs/refs/offsets сохранены либо safe restart same ID |
| A70 | Crash каждого migration phase/settings-registry mismatch | Verified old/new либо fenced recovery, не blended active configuration |
| A71 | Repeat import/skipped-version upgrade/rollback | Stable IDs/no expanded effects; supported exporter/reconcile, old writer fence |
| A72 | Unknown/trashed tombstones >90d offline | Compact lineage не превращает deletion в new upload; unknown remains guarded |
| A73 | Journal clear/append failure/crash before append | Effects/recovery retained; runId dedup/accounting issue reconstructable |
| A74 | Export/recovery/storage UI | No secrets/URLs/bytes leak; unsupported discard unknown payload запрещён |

### Производительность и live gates

| ID | Сценарий | Обязательный результат |
|---|---|---|
| A75 | Warm 1/20/100/1,000/10,000 files | Report reads/hash bytes/metadata writes/checkpoint bytes/time/memory; no O(N²) saves |
| A76 | Cold upload/download, many folders/pages, conflict-heavy | Отдельные actual network/FS metrics, bounded memory и worker budgets |
| A77 | Two jobs shared account/project quota | Fair global gate/cooldown; N jobs не умножают allowed quota |
| A78 | Large file/buffer/unsupported binary CAS | Block/stream explicit capability, no memory allocation beyond budget/no unsafe fallback |
| A79 | Concurrent commit candidate parent/package/alias/remote races | Gate остаётся serial до полного race evidence |
| A80 | Real desktop OAuth denial/cancel/refresh/restart | Bounded waits, SecretStorage/ref lifecycle, no plaintext refresh token |
| A81 | Two vaults bootstrap/ordinary edits/conflict artifact propagation | Same identity/lineage; proposal visible peer; canonical gate сохраняется |
| A82 | Two devices trash/restore/delete-edit/permission loss | No unknown-driven deletion; recovery copies usable; residual Drive races recorded |
| A83 | Foreign client changes между inspect/PATCH/verify | Проверить реальные conditional capabilities; не выдавать version precheck за atomic CAS |
| A84 | Shared Drive roles/root/parents/generated ID/permission | Поддержка объявляется только по проверенным operations; unsupported combinations visible |
| A85 | Host dirty editors/text/binary/hidden file/trash/crash | Реальные adapters соответствуют guards; фэйк не единственное доказательство |
| A86 | Packaged plugin manifest/min host version/MIT attribution | Установимый артефакт и license notices, current missing package manifest исправлен до release |
| A87 | Rollback rehearsal с pending remote effect | Никакой старой empty-history записи; payload/leases/accounting сохранены |

## 4. Traceability аудита и инвариантов

| Исходное замечание | Контракт / проверки |
|---|---|
| Drive audit 4.1–4.4: copies/404/reviews/unsupported choice | Providers §§4–6, storage §4, UI §5; A07–A09/A26/A30/A31 |
| 4.5–4.6: checksums/secrets | Metadata boundary/account lifecycle; A10/A58/A60/A80 |
| 4.7–4.8: speed/read retries | Runtime budgets/typed retries, delta state; A25/A39/A66/A75–A78 |
| 4.9–4.10: picker/MIME | UI §7/provider binary contract; A56/A76; MIME mapping в нижеуказанных gates |
| 4.11–4.12: absent features/live concurrency | README §6/provider §7/S6; A80–A85 |
| 4.13–4.16: UX/stale/client/retry loops | UI §§4–7/runtime §§3–6; A35–A48/A57/A58 |
| Новые findings: prototype/O(N²)/namespace/review counter/collision | Policy identity/providers/raw graph/store deltas; A01–A10/A21/A66/A75 |
| V6 migration/GC/schedule/ownership/Drive omission | Shared authority/job ports/import/pins; A11–A24/A35/A64–A71 |
| Пользователь: auto off/conflict stops/no finishing | Runtime schedule/UI status; A26/A36–A38/A59 |
| Пользователь: checkpoints и `.previous` копятся | Storage §5; A65–A67 |

| Инварианты | Приёмочные доказательства |
|---|---|
| INV-01/INV-08 | A11–A24, A49–A52, A68–A71 |
| INV-02/INV-07 | A35–A48, A53–A61 |
| INV-03/INV-04/INV-12 | A28, A31–A34, A62–A63, A73 |
| INV-05/INV-06 | A25–A30, A39–A43, A53 |
| INV-09/INV-10 | A40, A64–A70, A74, A87 |
| INV-11 | A10 и metadata boundary fuzz fixtures |

## 5. Обязательные gates расширений

Binary MIME mapping улучшает display/download headers, но никогда не включает Google-native conversion по extension. Gate — Markdown/JSON/media roundtrip bytes/digests и отсутствие неожиданных native objects.

Changes cursor commit, rename identity, empty directories, streaming и existing-ID content CAS не входят автоматически в S2 «jobs готовы». Каждый получает отдельный spec amendment с operation schema, recovery/crash evidence, migration и UI preview. Existing-ID gate снимается только explicit изменением capability после A83; до этого UI сохраняет disabled choices, IDs и proposals.

## 6. Definition of done

Релиз готов, когда implementation matrix помечает каждый реализованный контракт test/host/live evidence, unsupported контракты явно disabled, migration/crash fixtures проходят, два vaults воспроизводят accepted workflows, installation artifact собирается и rollback проверен. Документы, mock tests и build по отдельности этим критерием не являются.

Для каждого этапа: узкий diff, meaningful regression fixtures для реальных ошибок, `npm run verify`, актуальные specs/implementation matrix и review invariants. Повторное широкое тестирование без новых runtime изменений не требуется. Внешняя публикация/merge/release не выполняется как побочный эффект работы над спецификацией.

## 7. Проверка этого документального пакета

На 2026-10-14 выполнены: проверка relative links и code fences во всех 7 новых и 4 связанных документах; проверка непрерывных acceptance IDs A01–A87 и покрытия INV-01–INV-12; `git diff --check`. Повторно запущены 20 architectural probes: observations точно совпадают с `docs/audits/drive-jobs-probes.json`, то есть известные дефекты остаются воспроизводимыми.

Новый runtime код этим этапом не изменён. 87 сценариев — требования для следующих implementation tests/host/live checks, не 87 новых пройденных тестов. Последний полный verify текущего runtime — 390/390; он не повторялся ради изменений только Markdown.
