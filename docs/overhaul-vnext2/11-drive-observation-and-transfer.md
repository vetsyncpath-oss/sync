# 11. Observation, Drive transfers, OAuth и provider contracts

R11.1–R11.8 уточняют [03](../overhaul-vnext/03-providers-drive.md) и [сравнение Sync Engine](../audits/sync-engine-cross-comparison-2026-10-15.md). Defaults и пределы — [README](README.md).

## R11.1. ProviderRun и coverage

Один connection создаёт immutable ProviderRun на `{jobId,pairId,accountEpoch,policyRevision,runEpoch}`. Mutable settings/secret pool не читаются из середины operations. ProviderConnection хранит lifecycle credentials и capabilities; ProviderRun — snapshot/session; WritableProviderRun — typed effects с pre/postconditions. В legacy SyncSource bridge те же контракты обязательны, не второй pipeline.

```ts
interface ObservationSnapshot {
  snapshotId: string; pairId: string; observedAt: number;
  completeness: 'complete'|'partial'|'unstable';
  nodesById: ReadonlyMap<string, RemoteNode>;
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  coverage: readonly CoveragePartition[];
  diagnostics: readonly Diagnostic[];
  providerCursor?: string;
}
interface CoveragePartition {
  anchorId: string; ancestorIds: readonly string[];
  state: 'complete'|'partial'|'unstable';
  pages: number; reason?: string; continuationRef?: string;
}
```

Raw names и IDs сохраняются отдельно; literal slash в Drive name не превращается в директорию. Repeated identical object observations дедуплицируются по ID с diagnostic; различающиеся parents/version/metadata делают затронутую область unstable. Names/case/NFC aliases не сливаются по «последний победил». Каждый возврат metadata проверяет requested ID; root alias разрешён только при чтении и сразу заменяется actual ID.

При page failure/budget exhaustion provider возвращает полученный raw graph с partial coverage и typed issue; browse показывает его и возраст предыдущего snapshot. Отсутствующая страница не пустая папка. Destructive execution запрещён для incomplete/unstable области и зависимых targets. Positive download/create/update возможен только в независимо complete partition: известны все siblings нужного parent, ancestry/root проверены, compiled ownership исключает mapping alias других областей, fresh guard доказывает необходимые postconditions. Если adapter этого доказать не умеет — только browse/plan, без guesses.

Общая completeness=complete означает только завершённый bounded traversal; не атомарный snapshot всего Google Drive. Version guards всё равно нужны. Повтор/пустой/невалидный page token и incompleteSearch явны; nullable optional nextPageToken трактуется по API schema, не по случайной truthiness. Size/count limits относятся к наблюдениям и страницам, а не к уникальным files.

Новый diagnostic registry имеет стабильные machine codes. Legacy names маппятся без потери raw code: duplicate-name→duplicate-sibling-name, unsafe-name→unsafe-target, target-alias→mapping-collision, inventory-incomplete→incomplete-listing; repeated-object/inconsistent-object/cycle/parent-mismatch сохраняют отдельный смысл. File-directory-overlap не подменяется generic collision. UI/i18n не анализирует message.

## R11.2. Быстрый Drive observation и fresh guard

Initial selected-root обход ограничен выбранным ID/corpus. Параллельные folder queries допускаются через общий account gate; можно группировать parent predicates в OR при ограничении query size и полном корректном pagination. `q=trashed=false` всего аккаунта не default для broad drive scope. Account-wide strategy допустима только как явно выбранная capability/оптимизация с оценкой объёма и памяти.

ObservationContext индексирует node/parents/normalized target→**set IDs**, имеет собственную epoch и singleflight metadata reads. Общий ancestor в одном неизменном observation epoch не запрашивается заново на каждый leaf. Ни изменения чужого job, ни UI collapse не пересоздают этот индекс. Refresh/changes event отмечает affected nodes/descendants dirty. Между runs переносится только cache с provenance и known freshness, не authority.

EffectGuard получает immutable plan preconditions и заново проверяет непосредственно перед effect:
- current pair/root/account/VAM/settings epochs и target lease;
- exact object ID, version/digest, expected parent/ancestry и assigned path;
- capabilities edit/trash/untrash/addChildren в нужной области;
- destination occupancy с учётом всех duplicate IDs;
- current local bytes/version, состояние dirty editor и pending reservations.

Local replacement требует проверенного host conditional-write primitive; read-then-write не считается atomic CAS. Если нужный primitive недоступен, unsafe replacement блокируется либо предлагается unique sibling copy, не silent fallback. Unsaved editor content нельзя затирать обновлением файла за его спиной.

Проверка до write не является атомарным compare-and-swap с чужим клиентом. Она уменьшает TOCTOU, но **не открывает** existing-ID overwrite gate. Неизменённый item без effect использует verified snapshot/baseline; no-op не выполняет N повторных fresh ancestry walks. Unlisted tracked object проверяется отдельно по ID, не выводится из cached absence.

Local index хранит verified hash, size, host file identity/stat и dirty generation. Host events invalidation обязательны; незавершённая наблюдаемость/перезапуск/внешняя смена файлов лишают cache статуса verified. mtime/size — hint; одинаковые timestamps не доказательство unchanged. Периодический bounded scrub обнаруживает пропущенные события, а destructive/replace guard всегда проверяет актуальные bytes. Не хешировать все unchanged files при каждом realtime проходе.

## R11.3. Task executor, staging и physical request lifecycle

Единый executor разделяет phases: observe→plan→reserve→stage→guard→effect→verify→commit. DAG фиксирует mkdir before child, dependent rename/delete, local/remote aliases, shared operation prerequisites. Готовые независимые transfers/jobs работают параллельно; общий state mutex удерживается только при atomic ledger transitions, не на весь network call. Реализация широкого concurrency блокируется до R12.3 leases и B49/B26.

Fair weighted gates ограничивают account requests, глобальные transfers, memory и disk staging. Defaults 4 transfers/4 metadata/4 account; это не 8 запросов на account, суммарный account cap применяется к обоим классам. Metadata не должна голодать за большими transfer; используются отдельные очереди с общим cap. Permits принадлежат operation ID, exactly-once release, finally при cancel/error; waiter имеет deadline, cancel удаляет его из queue.

Memory charge включает payload buffers, hash copies, multipart framing, decompression, retry buffers и in-flight response bodies. Нельзя резервировать 16 MiB, а буферизовать 64 MiB. Streaming/spooling может поддержать default file limit 64 MiB в 32 MiB mobile budget; если host adapter буферизует весь response, effective limit снижается и UI объясняет его. Oversize operation не получает бесконтрольное исключение «если память свободна». Disk preflight отдельный: bytes + recovery preimage + journal reserve; освобождение stage blob после crash через pin-aware GC.

Каждое ожидание: admission deadline, metadata deadline, transfer inactivity watchdog, total elapsed bound. Deadline начинается до ожидания gate, а body чтение входит в request lifecycle. Timeout unabortable mobile request завершает логического caller с typed issue, но physical permit/orphan остаётся зарегистрированным. Повторный caller также получает bounded result, а не бесконечное ожидание. Ограниченная quota orphan requests, поздний response discarded/verified по epoch; unlimited replacement запрещён. Если transport не способен восстановиться, affected account имеет explicit reconnect/reload requirement. Desktop sync throw до http.request initialization безопасно очищает timers.

## R11.4. Download/upload и протокол Drive

### Download

- Binary files с finite nonnegative size и проверенными checksum/version; native docs/shortcuts не проходят в alt=media fallback.
- Range streaming проверяет 206, Content-Range start/end/total, точную длину и order chunks. 200 на nonzero range → discard/restart, не append.
- Между ranges фиксируется объект/version; при изменении staged stream отвергается. Итоговый digest и expected size обязательны до canonical local commit; target fresh guard обязателен.
- Redirects по умолчанию запрещены. Если live Drive требует content host redirect, отдельный документированный allowlist/protocol без передачи bearer на произвольный origin; mixed hosts/content type mismatch → error. Это live gate, не основание убрать redirect policy.
- Abort/error освобождает stream reader, response, memory и ephemeral temp после снятия pins. Незавершённые canonical files не публикуются.

### Small-file create/proposal

Multipart fast path рекомендован до 5 MiB (configurable capability, учитывается memory budget), только для доказанно нового объекта/версии proposal. До POST: durable intent, reserved Drive ID, expected parent/path, payload digest и pins. MIME в metadata и content header согласованы. Lost response → inspect reserved ID, verify digest/parents/properties; matching object settle, mismatch blocked, 404 не автоматически означает not-applied при unknown transport — bounded probe/evidence policy.

### Resumable

8 MiB chunks (кроме последнего — multiples 256 KiB); sequential внутри session, параллельность между независимыми файлами. Session URL/offset/total/id защищены от diagnostics/export и входят в durable pending state. Перед записью session URL валидируется API origin/path; untrusted Location не получает credentials.

308 обрабатывается по подтверждённому сервером Range, не по длине отправленного chunk. Timeout/connection loss → status probe; дальше resend только непринятой части. 404/410 session истекла: re-inspect reserved object, затем guarded новый session того же intent/ID, не второй объект. Final 2xx проверяет id/digest/parent и целевой тип. Ответ пришёл после cancel — сохраняется только fenced receipt старого intent, без новой работы.

На каждый chunk сохраняется короткий offset event, не полный checkpoint всего job; publication payload refs закреплены до первого bytes request. Рестарт не теряет session/offset, однако bearer-capability URL не выдаётся обычному журналу или другому sync source.

### MIME и revisions

Минимальная таблица: md→text/markdown, txt→text/plain, json/canvas/base→application/json, png/jpeg/gif/svg, pdf, css/js, основные audio/video; unknown→application/octet-stream. Extension lookup own-key safe, отдельная validation имени. MIME не превращает binary в native Google Docs и не даёт новых write capabilities. Existing native type не конвертируется случайно.

`keepRevisionForever` не default. До открытия existing-ID update нужен лимит/retention revisions и live проверка; текущие створки gate не обходятся новым uploader. Rename поддерживает ID только после fresh identity/parents и reconciliation; не выдавать checksum совпадение за уникальную identity.

## R11.5. Changes, quotas и provider retry

Changes API — новая реализация, не заимствование у Sync Engine. После полного первоначального индекса получать cursor согласованно: изменения, произошедшие во время initial traversal, должны быть replayed, а не пропущены. Cursor и index commit атомарны на своей generation; effect acknowledgements хранятся отдельно. Cursor advance допустим при сохранённой durable pending work, но не как объявление baseline applied.

Feed фильтруется по account/corpus и selected root membership; moved folder требует пересчёта descendants, смена root/principal инвалидирует cursor через reconciliation. removed/permission loss не auto deletion. Expired cursor→complete rescan с retained baseline и no destructive effects до восстановления coverage. Повторные events идемпотентны; crash before/after cursor publish тестируется.

Google quota classification сохраняет provider reason: rateLimitExceeded/userRateLimitExceeded→backoff/account cooldown; dailyLimitExceeded→long-lived quota prerequisite/next documented availability, не tight loop; sharingRateLimitExceeded только для соответствующих операций, не blanket retries file media; 401/invalid_grant→reauth; permission 403≠quota. 429 Retry-After seconds/date и 5xx transient используют R10.8. Quota scope account/project явно хранится и не выключает другие accounts.

GitHub secondary limit 403 с Retry-After обрабатывается даже при remaining>0. Неизвестный 403 без quota evidence — permission/source issue, не часовой sleep. Modern Accept/API-version/Bearer для GitHub-capable endpoint; GitLab/Gitea/GHE имеют собственный protocol adapter, а не слепо одинаковые headers.

## R11.6. OAuth, disconnect и проверка соединения

Desktop PKCE S256, random state/verifier, loopback 127.0.0.1, exact Host/path/method, одноразовый callback и 5 min interactive bound сохраняются. Manual copy/open URL показывает URL только пользователю в auth UI; diagnostics редактирует code/state/tokens/session URLs. Cancel закрывает listener/connections и поздний callback не активирует аккаунт.

Token exchange/refresh валидирует scopes и стабильный subject. `drive.readonly` grant хранится как явная read-only capability: pull/browse при достаточном scope допустимы, bidirectional пишет blocker reauthorization-required; не тихое переключение profile и не потеря старой identity. Existing readonly tokens не становятся full-drive от одного изменения Cloud Console consent screen.

Singleflight refresh per account+client generation; один 401 replay входит в budget. Один cancelled waiter не отменяет shared refresh для остальных, disconnect отменяет generation целиком. userinfo transient failure отделяется от identity mismatch. Credentials/refresh tokens не входят в pair hash. Смена settings/client credentials освобождает obsolete pool после завершения leases; поздний refresh не восстанавливает disconnected cache.

Два отдельных действия:
- **Disconnect locally**: немедленно закрыть новые запросы, invalidate epochs, стереть local secret через feature-detected deleteSecret; fallback empty value явно диагностируется как local invalidation, не real key deletion. Pending lineage сохраняется.
- **Revoke Google access**: явное действие, использует token для bounded revoke request; результат confirmed/failed/deferred показывается. Token не помещается в ordinary retry journal; при local disconnect без успешного revoke пользователь получает ссылку на управление доступом Google и честный статус.

Readonly Test connection не начинает upload/trash и не создаёт root. Он проверяет grant/root/list readability и отдельно сообщает advertised capabilities write/trash как metadata evidence, не live proof. Write smoke test — отдельная явная операция на disposable объекте с cleanup receipt и VAM. No browser/network callback оставляет UI в вечном waiting.

Mobile OAuth остаётся unsupported capability этой волны, пока свой client/scopes/flow не пройдут приёмку. Нельзя переносить device flow/credentials донора как доказательство поддержки нашего full-drive flow.

## R11.7. Остальные источники: обязательный минимум overhaul

| Provider | Нормативный контракт |
|---|---|
| Git | Branch ''/default разрешается в настоящий ref и immutable commit; sourceId reconciliation до переноса старого hash cache. Symlink blob не записывается молча как target content: unsupported видим, либо explicit literal-file mode; submodule видим как unsupported без обхода внешнего repo. Recursive truncated tree неполон, 304 без valid cache не successful empty; GHE/Gitea sub-path parser fixtures |
| ZIP URL | Singleflight session на URL/validator/config epoch; rejected/loser sessions dispose. TTL после sync не включать до identity fence. Resume требует exact Content-Range/total и If-Range при доступном validator; changed validator→restart. Limits compressed/decompressed/count, zip-slip/path identity, CRC/digest и cleanup. URL эвристики provider-specific; Google interstitial HTML не принимается за ZIP |
| Yandex | visited IDs/paths реально добавляются; budget включает directories, cycles без files прекращаются; root public-link error отличается от nested unavailable. Expired download URL refresh bounded, проверяет ту же identity; failure не deletion |
| WebDAV | Depth:1, namespace-aware XML, response cap 16 MiB до buffered parser при способном transport; host capability до выделения памяти. URL root/security и credential handling; Basic по HTTP запрещён default, existing configuration требует явного migration warning/consent. Case folding URL не глобальный: server-dependent capability. Cancellation/deadline и typed PROPFIND status без потери Retry-After |
| Drive API-key | Pull-only capability, folder ID validation/query escape, paginated listing с declared bounds; uppercase hashes нормализуются. Native export/shortcuts unsupported visible. OAuth schema — отдельная ветвь, apiKey не требуется от OAuth connection |

Schema validation использует URL parser, обязательные поля по provider/auth mode, migrations для future/unknown fields, stable diagnostics. Unknown source kind не превращается молча в Git source. Reusable providers обязаны иметь `dispose` и refresh semantics; optional forceDispose bridge вызывает documented fallback, не оставляет stale session. Dispose error даёт maintenance issue, не скрывает original failure.

## R11.8. Заимствование и performance доказательства

Переносить выборочно MIT api helpers, limiter, range stream, multipart framing, task result pattern и benchmark fixtures. Сохранять intent/recovery/idempotency и license notice. Context cache обновляется после postcondition, не после отправки запроса. KV backend не является распределённой транзакцией Drive+vault. Ни cache-only fast path, ни native PATCH не открывают закрытые capabilities.

Измерения S: 1/12/312, 1/12/1212, 2/102/3102 относятся к list/inventory/warm identity stages на fake API, не к real sync duration. Gate B70 требует исчезновения N×ancestor loops для no-op; B71 — реальный apples-to-apples throughput/requests/memory/correctness. Сначала counters и correctness, затем настройка concurrency. Локальные/сетевые таймеры и UI redraw измеряются отдельно.
