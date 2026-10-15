# 13. Приёмка, доказательства и выпуск

R13.1–R13.6. Это критерии будущей реализации, не перечень уже пройденных тестов. Сценарии A01–A87 сохраняются; B01–B80 уточняют новые regressions, contracts и live gates.

## R13.1. Формат доказательства

Каждый requirement/scenario имеет evidence record: `{id,requirementIds,baselineCommit,candidateCommit,command,fixtureOrEnvironment,expected,actual,status,artifactHash,limitations}`. Status: not-run/pass/fail/blocked/not-applicable-with-reason. Code inspection не pass execution. Fake API не live Google. Build success не гарантирует behavior. Заголовок документа и package manifest не определяют точный snapshot бинарника — нужен commit/bundle SHA.

Подтверждённый regression обязан воспроизводить старый дефект и проходить после fix через production seam. Positive assurance или опровержение ложной находки не обязано давать red на старом коде. Старые results JSON сохраняются; новые snapshots добавляются отдельно, не переписывают историю.

Новые аудит-пробы N1–N5 выполнены на baseline; это факты о старом поведении, а не готовые acceptance assertions новой реализации. 534 tests — исторический suite previous stage; оценка процента реализации по нему запрещена.

## R13.2. Обязательный VAM

Сборка требует VAM. При отсутствии/missing/denied/expired допуска effects запрещены для manual/auto/retry/force/recovery mutation. Read-only settings/local diagnostics доступны, remote browse — только если governance policy прямо разрешает read; default без допуска remote sync requests не стартуют. Явный local disconnect/revoke credentials разрешён независимо от допуска как отзыв доступа, а не sync effect. UI показывает отдельный governance reason, required dependency/install/enable steps и текущее schedule.

Инициализация ожидает VAM с bounded timeout (default 15 s для первичного ответа), затем blocked, не endless pending. Позднее появление валидного manager восстанавливает readiness без reload и не дублирует startup cycle. Revocation при active run прекращает новые effects, сохраняет unknown receipts/claims и не превращает уже завершённые writes в «ничего не было». Dispose убирает listeners/pollers/pending callbacks; pollMs=0 не отменяет timeout.

Удаляются root duplicates/dead VAM UI и runtime softMode bypass. Проверка bundle graph + AST/символьных ссылок; простой grep без whitelist может находить слова в тестах/документации и не заменяет reachability. Cooperative renderer governance не объявляется защитой от другого привилегированного плагина. Это не основание ослаблять обязательность VAM данной сборки.

## R13.3. Package, docs и лицензии

Source artifact содержит package.json, lockfile, TypeScript/esbuild config, source, tests/scripts/docs, LICENSE/third-party notices. Install artifact содержит manifest.json, main.js, styles.css и обязательные notices; source ZIP и install ZIP называются по-разному. Manifest id/version/minAppVersion/isDesktopOnly соответствует реально проверенным host API/platform capabilities. Окончательный minimum version определяется host acceptance, не копируется из донора.

Pinned dependency install и production build воспроизводимы; bundle hash, build tag и исходный commit записаны в manifest-side release metadata/ARCHIVE-INFO. Full MIT notice для заимствованных существенных частей сохраняется в main.js и source distribution, карта origins перечисляет file+commit. OAuth credentials донора не включаются. Dependency licenses проверяются отдельно от root MIT.

Одна таблица ConfigDefaults генерирует runtime/UI/docs значения и тестирует их совпадение. Active docs дают ссылку на vNext-2; устаревшие claims «профили не реализованы», «migrateLegacyShas вызван», числа 390/453/534 и старые phase order помечаются историческими, а не стираются без контекста. No claim “no tests/licenses” переносится с неполного clone.zip на полный репозиторий.

## R13.4. Benchmark и live protocol

Контролируемый набор: 100/1000/10000 small files, shallow/deep paths; empty files/folders; binaries 1/16/64 MiB; duplicates/NFC/case aliases; cold upload/download, unchanged run, one edit, rename, delete/edit conflict. Baseline/candidate/Sync Engine получают одинаковые данные и ограничения scope; account-managed и arbitrary-folder серии разделены. Full sync и donor cached realtime сравниваются отдельно.

Собирать фазовые timings p50/p95, list/inspect/media/mutation counts, local bytes read/hashed, network bytes включая retries, peak resident memory, disk stage/recovery/checkpoint bytes, UI responsiveness, final digests, canonical IDs/links/permissions и retained artifacts. 10 повторов warm сценариев после фиксированного прогрева; cold baseline пересоздаётся в disposable области. Никакого promised factor до реального измерения.

Hard acceptance: correctness/IDs/cancel/recovery не ухудшились; memory/admission deadlines соблюдены; no-op больше не N×ancestor inspect и не N full checkpoints. Начальная target: не более одной observation fetch каждого общего ancestor на epoch плюс root validation/явные unknown probes; свежие effect guards измеряются отдельно. Numeric throughput target утверждается по baseline machine/network, не придумывается по fake latency.

Live fixtures: desktop OAuth обычный и недоступный browser endpoint/SetSID; reauth read-only→full; два vault; сторонний Drive клиент; permission revoke/restore, trash/untrash, concurrent edits, потерянный final response, quota, interrupted upload/restart. Не использовать рабочий пользовательский vault. Remote test writes требуют явно выделенного test root; доступ к реальному Google аккаунту не считается полученным только из запроса написать спецификацию.

## R13.5. Приёмочные сценарии B01–B80

В колонке «Уровень» U — unit/component с реальным модулем, H — host integration fake ports, F — fault/crash injection, L — live provider/Obsidian, P — performance. Один pass U не закрывает указанный H/L.

| ID | Уровень | Arrange → action → обязательный результат |
|---|---|---|
| B01 | H | confirmSync=false в manual batch → файл не меняется, job cancelled, aggregate не ok, journal хранит cancellation (P14) |
| B02 | H | Cancel во время prepare до execute → явный cancelled, нет retry/finishing, не null (P3) |
| B03 | H/F | Старый физический callback после cancel/new epoch → не меняет новый UI/state; old receipt accounting проверяется отдельно |
| B04 | H/F | Два effects settled, третий apply throws → первые counts/receipts сохранены, partial/failure не emptyStats |
| B05 | H/F | Effect подтверждён, final summary write fails → accounting-required, restart восстанавливает отчёт без второго effect |
| B06 | U/H | Error text “changed/directory/exist” без typed metadata → internal error, не invented collision/local-changed (P7) |
| B07 | H | a.md download io, b.md исправен → b.md завершается, a.md typed item failure, scoped retry (P11) |
| B08 | H | Два Drive IDs на a.md + b.md + другой Git job → b/Git завершаются, только collision group blocked (P1) |
| B09 | H/F | Corrupt shared authority vs corrupt одного provider item → global write stop только для общей corruption, причины различаются |
| B10 | U/H | Два jobs same relative path + re-add queue entry → IDs не смешаны, issue/origin/attempts/pins сохранены |
| B11 | H/F | append удержан на read, затем clear, затем late append → старые записи не воскресли; новые события сохраняются (P5/N) |
| B12 | U/H | Reload всех девяти outcomes и future schema → no dropped accounting/cancelled; unknown future write blocked |
| B13 | U/H | constructor/__proto__/toString через cache load/set/merge/flush/import → точный own-key roundtrip без inherited entries (P8) |
| B14 | U/H | Stable uppercase и alternating hash case → no ложных transfers, opaque version не изменён (P12) |
| B15 | H | remote profile + global incoming + dirty L → effective remote либо explicit migration decision, никогда молчаливый keep-local с applied R (P15) |
| B16 | U/H | Полная pull write×delete×L/R/base матрица R10.7 → expected effects/receipt/skip reason; unsafe combos rejected |
| B17 | H | Existing Drive ID, local dirty, gate closed → proposal, L остаётся primary, R unchanged, needs-attention, повтор не новый copy |
| B18 | H/F | Local-delete vs remote-edit и reverse; tombstone после 100 дней → survivor сохранён, no guessed resurrection |
| B19 | U/H | useTrash=true, adapter без trash → typed trash-unavailable, original остаётся, remove не вызывается (N5) |
| B20 | H/UI | Startup-only initial+finishing completed → UI всё ещё “только при запуске”; off/paused/blocked различимы |
| B21 | H | Transfers завершены, один conflict pending → finishing независимой работы запускается ≤2 раз, не требует overall success |
| B22 | H/F | Cancel cycle; затем due retry/VAM ready/resume/late timer → отменённая работа сама не возобновляется |
| B23 | H | Auth block→same-subject reauth→success; другой checkpoint blocker рядом → снят только auth, без manual blanket clear (P4) |
| B24 | U/H | Transport+401+scheduler retries одного step и upload 10 успешных chunks → step ≤5 sends, успешные chunks не исчерпывают весь файл |
| B25 | H | 429 Retry-After 10 min при short request budget → explicit deferred/account cooldown; unrelated account работает; UI не обещает inline sleep |
| B26 | H | Drive observation удержан, Git готов → Git допущен независимо, общий admission не занят сетью (P2) |
| B27 | H/F | Unabortable mobile request timeout, второй waiter → bounded result, no eternal pending/unbounded physical replacements (P13) |
| B28 | U/F | Synchronous http.request throw до initialization → нет leaked timer/TDZ; async body error освобождает listener |
| B29 | H/UI | Вторая страница list fails → partial tree+coverage+age; no absence deletion; independent complete partition может работать |
| B30 | U/H | Repeated equal IDs, differing parents/version, cyclic folder, observation bound → diagnostics/unstable; no arbitrary winner |
| B31 | H/UI | Duplicate ID excluded/object anchor selected → excluded ID не блокирует независимый target; cross-job physical overlap по-прежнему blocked |
| B32 | H/F | Root/parent/permission/local bytes меняются после preview → fresh guard replan/block, no stale write |
| B33 | H/F | Range 200 вместо206/wrong Content-Range/changed revision/truncated chunk → staged bytes не публикуются, корректный cleanup |
| B34 | H/F | Multipart create принят, ответ потерян → probe reserved ID, один объект, matching receipt, no second POST new ID |
| B35 | H/F | 308 partial Range, timeout, expired session, restart → offset из сервера; mismatch blocked; final ID/digest checked |
| B36 | H/P | Concurrent buffered/streamed files + cancel + quota sleep → resident charge в budget, permit exactly-once release, no starvation |
| B37 | U/H | md/png/pdf/unknown и key-like extension → корректный safe MIME/header; no native conversion |
| B38 | H/L | OAuth cancel/timeout/wrong Host/state/late callback/SetSID unreachable → terminal понятный status, listener закрыт |
| B39 | H/L | Concurrent refresh + disconnect + readonly grant → no stale token resurrection; pull readable, bidir reauth blocker |
| B40 | H/L | deleteSecret present/absent, revoke offline/success → честные local/revoked outcomes, old lineage сохранена |
| B41 | U/H | GitHub403 Retry-After remaining>0; permission403;429 HTTP-date → разные typed results/cooldowns без Error field loss |
| B42 | U/H | Git symlink/submodule/sub-path URL/truncated tree/304 без cache → declared capability или partial/error, не fake ordinary file |
| B43 | U/H/F | Concurrent ZIP ensureSession; changed URL/validator; bad resume range → singleflight, no leaked loser, safe restart |
| B44 | U/H | Yandex folder-only cycle и expired file href → bounded visited traversal, identity-preserving refresh, distinct nested error |
| B45 | U/H | DAV oversized XML/namespace/case variant/HTTP Basic config → early budget enforcement или capability blocker, no global casefold |
| B46 | U/H | API-key malformed folderId/2000+ files/uppercase digest/native item → escaped query, complete pagination или visible limit, no false deletion |
| B47 | H/UI | Один scenario через preview/manual/auto/retry/force/scan/control → одинаковые ownership/policy/preconditions; scan без effects |
| B48 | H/F | Settings save/cutover failure, unrelated setting change → old revision active; affected writes fenced; unrelated job не перезапускает lineage |
| B49 | H/F | Два overlapping effects одновременно check/begin; unrelated sibling parallel → один owner, sibling работает; transfer не держит global commit lock (P6) |
| B50 | U/H | Rename connection/token/interval/Git mapping vs Drive root/principal change → первые сохраняют pair, вторые candidate reconcile |
| B51 | H/F | lastSyncShas при Git/routed/Drive caches → import только с verified Git provenance; ambiguous quarantine; dirty local не overwritten |
| B52 | H/F | Crash на каждом шаге backup/import/receipt/active pointer → одна active generation, все IDs/offsets/pins/queues сохранены |
| B53 | H/F | Future/corrupt state, supported downgrade и произвольный old writer → fail-closed/explicit unsupported rollback, no обещание magical fence |
| B54 | H/F | Старый blob получает новый pin между mark/sweep → не удаляется; epoch change retry; reader/late writer respected |
| B55 | H/F | 100 cycles/checkpoints, retired routes *.previous, cleanup denied → safe generations bounded; referenced previous retained; no repeated upload |
| B56 | H/F/UI | Corrupt quarantine + disk pressure + explicit discard → automatic cleanup не теряет recovery; reasons/bytes видны |
| B57 | H/F | first→second→first proposal, repeated attempts/restart → две publications, distinct attempt IDs, one pending per version |
| B58 | H/F | Peer marker spoof/changed artifact/local edit/missing counterpart → no copy-of-copy/overwrite/recreate; lineage preserved |
| B59 | H/UI | acknowledge/decline/rebind/publish-new/detach + stale/double click → exact revision decisions, no implied delete/overwrite |
| B60 | H/F/L | Same-ID restore permission denied/dirty local/lost response → no unsafe replacement, resume old intent; ID preserved |
| B61 | U/H | Wait...md/v1..2/%2e%2e literal, actual ../, Windows aliases, a//b → safe names allowed or declared portable blocker; uniform target keys (N1/N3) |
| B62 | H | Host configDir=.custom + own plugin under it → config-only correct, own state protected во всех entrypoints (N2) |
| B63 | H/UI | notes.conflict-resolution.md vs exact legacy copy vs verified peer artifact → ordinary file не скрыт, legacy import explicit, no marker bypass (N4) |
| B64 | UI/P | Job events при раскрытом tree/inspector, keyboard, 10000 rows → focus/details/selection сохранены, a11y, bounded rendered rows |
| B65 | H/UI/L | VAM absent/denied/timeout → все writes blocked, явная обязательная зависимость, schedule сохранён; soft bypass отсутствует |
| B66 | H/F | VAM поздно появляется/отзывается/dispose/pollMs0 → bounded state, no duplicate startup/listeners, pending effects accounted |
| B67 | Build/L | Чистая установка из install ZIP и reproducible source build → manifest/API/platform truthful, binary hash соответствует source |
| B68 | Build/H | Expanded MIT donor code и diagnostic export → notices присутствуют, OAuth/session URLs/refresh tokens не экспортированы |
| B69 | Static/H | Docs/default constants/schema/outcome registry → одинаковые значения, нет broken links и active stale claims |
| B70 | P/H | Наборы S 100/1000 deep/wide, unchanged runs → нет N×ancestor inspect/full-checkpoint и ненужного полного local hash scan |
| B71 | P/L | Apples-to-apples benchmark cold/warm/edit/rename/delete → измерены requests/bytes/memory/time, final hashes/IDs корректны; никакого выдуманного factor |
| B72 | H/F/L | Changes bootstrap race, duplicate event, expired cursor, moved subtree, crash cursor commit → no missed changes/false deletion |
| B73 | H/F/L | Rename path при stable Drive ID, same-digest different IDs, target collision → ID/link preserved только при доказанной identity |
| B74 | H/L | Empty folder create/delete/rename и file↔folder collision → explicit capability, ancestor ordering, no implicit recursive loss |
| B75 | H/L | Shared Drive roles/corpora/incompleteSearch/root relocation → correct permission/coverage; до доказательства UI experimental/blocked |
| B76 | H/UI | Native Docs/shortcuts в mixed folder → visible unsupported, no binary/absence fallback; export/traversal не заявлен без отдельной spec |
| B77 | H/L/P | Mobile host/API/memory/OAuth restrictions → honest capability limits, bounded requests, no Node-only startup crash |
| B78 | F/L | Foreign client races existing-ID update, lost response, revisions/permissions → gate открывается только при доказанном atomic/race contract; иначе CLOSED |
| B79 | L | Два vault + foreign edits/trash/untrash/reauth → proposals/tombstones/identity корректны, independent files завершаются |
| B80 | F/L | Upgrade + crash + rollback rehearsal после remote effects → no blind old-backup replay, recoverable receipts и truthful journal |

B16/B18/B59 — параметризованные matrices, а не один счастливый пример. У B71 минимум полная signature окружения; у B78 отсутствие подходящего API primitive означает blocked gate, а не «pass с оговоркой».

## R13.6. Волны и release gates

| Волна | Объём | Выход |
|---|---|---|
| W1 correctness | R10: explicit outcomes, file error isolation, cancellation/block lifecycle, journal/dictionaries/profile precedence/retry budget; new mandatory VAM declaration | B01–B25 и relevant B65–B66; baseline P/N regression assertions; никакого широкого параллелизма пока leases не готовы |
| W2 unified execution / fast observation | R11 observation/provider bounds/transfers correctness и R12 compiler/plan/paths/UI decisions; basic scoped indexing | B27–B47, B57–B64; same tree/preview/run authority; upfront overlap leases из W3 обязательны до concurrent mutations |
| W3 durable per-job | R12 JobManager/reservations/pair migration/storage/pins/GC; account gates и bounded parallel transfers | B26/B49 и B48–B56/B80; slow Drive не держит Git; verified migration и storage boundedness |
| W4 release/performance | Package/docs/MIT, full UI regression, reproducible benchmark и live compatibility | B67–B71/B79/B80, remaining relevant A01–A87; явная capability matrix |

Dependencies: R12.3 lease core → concurrent effects; R12.4 pair reconcile → физический перенос stores; R12.6 pins → GC; R10 outcomes/errors → scheduler/finishing fixes; R11 index → Changes. W2/W3 можно чередовать вертикальными slices, но запрещено включать concurrency раньше precondition leases. Каждая slice содержит runtime+tests+UI outcome+docs/status, а не только файл класса.

B72–B78 — отдельные capability gates. Changes/rename/empty-folder — целевые расширения после foundation; Shared Drives/mobile OAuth/native export остаются неактивными до их собственной приёмки. B76 проверяет честное отсутствие неподдерживаемой функции, не её реализацию. Полностью открытый existing-ID overwrite не является условием выпуска **ограниченного** Drive-профиля, выбранного пользователем; он является условием claim «полная двусторонняя синхронизация существующих файлов».

Release запрещён при reproducible loss/false success, unknown effect без retained claim, ошибочной trash semantics, миграции без provenance, неполном install artifact или нарушении обязательного VAM. Отдельный bug severity не понижается от того, что он указан в backlog. Если target не реализован, capability закрыта и release notes описывают ограничение; не маркировать весь S0–S6 выполненным.
