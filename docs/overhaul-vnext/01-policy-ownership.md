# Политика, идентичность и владение

Нормативная часть [Overhaul vNext](README.md). Runtime не имеет права самостоятельно угадывать отсутствующий profile/source или отдавать область неисправного job другому подключению.

## 1. Сохраняемые настройки

Первый refactor читает текущие `connections`, `profiles`, `vaultPolicy`, legacy source policies и `autoSyncInterval`. `JobDefinition[]` получается из validated compiled settings; это не второй редактируемый файл конфигурации. Current profile axes остаются входом compatibility compiler, который выдаёт единственный `EffectivePolicy`.

Допустимое additive поле подключения: `enabled?: boolean`, default `true`. Оно отключает новые запуски job и сохраняет его ownership; `auto: off` отключает только фоновые запуски, manual остаётся доступен. Отключение, удаление подключения и исключение scope — разные действия. Нельзя трактовать отсутствие источника или отказ авторизации как `enabled: false`.

UI хранит draft; validation выполняется до acknowledged save. Active settings не меняются до подтверждения сохранения и fenced activation. Ошибка save возвращает прежнюю active revision, а draft остаётся доступен. Изменение credentials передаётся AccountContext; секреты не участвуют в хеше scope и не перезапускают baseline.

Profile `source` пока сохраняется как legacy default routing подсказка. Assignment `source` имеет приоритет; UI явно показывает источник, заданный профилем. Новый job не назначает себе автоматически области, которые оказались без источника.

До использования новых security-relevant settings, включая `enabled` и ID overrides, нужен settings writer/version fence из [storage migration](04-storage-migration.md). Историческая сборка, игнорирующая новые поля, не является безопасным rollback reader.

## 2. Идентичность

```ts
type ConnectionId = string; // существующий сохранённый id
type JobId = string;        // v1: deterministic "job:" + ConnectionId
type PairId = string;       // verified endpoint pair, не имя/URL/token
type PolicyRevision = string; // digest canonical compiled policy
type DataGeneration = string; // durable lineage; не номер каждого запуска
type RunId = string;
type Epoch = number;        // runtime fence, не durable baseline identity
interface JobDefinition {
  jobId: JobId; connectionId: ConnectionId; enabled: boolean;
  pairId?: PairId; generation?: DataGeneration; policyRevision: PolicyRevision;
  readiness: 'ready' | 'unresolved';
  bindings: readonly CompiledBinding[]; schedule: ResolvedSchedule;
}
```

Connection/Job IDs не меняются при изменении имени, токена, pause, интервала или профиля. PairId фиксирует provider namespace, проверенный principal, настоящий remote root ID и относящуюся к этому подключению routing map локальных/удалённых anchors. Подключение Git не добавляет свои mappings в Drive pair fingerprint.

Новое подключение без verified account/root имеет unresolved definition: оно browsable/configurable, но RunContext для mutations не создаётся. Existing job сохраняет recorded pair при временной недоступности и не заменяет его пустым/новым ID. `ready` требует pair и generation; persisted intent с undefined identity запрещён.

Principal для OAuth — проверенный Google `sub`; для provider без проверяемого principal используется recorded endpoint identity с явной степенью доверия. Нельзя заменять его email или display name. Локальный vault identity хранится отдельно от пути его каталога; перенос vault не означает новую пустую историю.

Изменение remote root/principal или эффективного routing map создаёт кандидат нового pair/generation. Переход выполняется через reconcile с сохранением старой истории и reservations. Часть bindings, identity которых доказанно не изменилась, может получить imported baseline с receipt. Смена участия, conflict policy или расписания меняет policy revision, но не стирает baseline. Новая generation — не разрешение bootstrap-upload/delete.

Pending effect исполняется по recorded pair/generation/operation semantics. Новая policy не переписывает его postcondition. Граница новой policy не пропускает запись в физический target, который удерживает unresolved старый effect.

## 3. Единая canonical policy

```ts
interface EffectivePolicy {
  participation: 'included' | 'excluded' | 'unassigned' | 'protected';
  owner?: JobId;
  direction: 'pull' | 'bidirectional';
  createLocal: boolean; createRemote: boolean;
  update: 'none' | 'on-source-change' | 'enforce-source' | 'changed-side';
  deletion: 'keep' | 'tracked' | 'all' | 'propagate-trash';
  conflict: { preference: 'local' | 'remote' | 'ask'; keepOther: boolean };
  provenance: readonly RuleWitness[];
  blockers: readonly CapabilityBlocker[];
}
```

Scope отвечает за участие; profile — за поведение; assignment/connection — за source binding и projection. Hard host protection применяется независимо и не отменяется nested include. Scope presets меняют ту же sparse tree; сохранённый custom draft не является дополнительной active scope authority.

Совместимый порядок: exact file > deepest folder > vault; на одинаковой глубине `names` selector > весь scope; последний равный rule выигрывает по оси поведения. `names` — exact basenames во всём соответствующем subtree, не globs и не только непосредственные дети папки. Их case/NFC семантика сохраняется. Одинаково специфичные пересекающиеся source bindings с различным source/remotePath отвергаются; arbitrary last-source-wins запрещён.

RemotePath, source и sourceRule применяются одним binding, не наследуются независимо так, чтобы remotePath остался от другого source. Legacy folder mapping задаётся remote prefix; assignments — final local destination. BindingCompiler обязан разрешить оба пространства до применения precedence и выдать прямой и обратный locator. Nested move не конкатенируется с parent move: сохраняется текущая semantics «самый глубокий explicit target перезапускает поддерево».

Возможны 0 или 1 default source. `Assignments only` оставляет непокрытые пути unassigned. Explicit override pull profile под bidirectional parent остаётся pull; direction не выводится из типа подключения.

Для выбора неоднозначного Drive объекта добавляются validated optional input fields: assignment `remoteAnchor: { provider: 'gdrive', objectId, kind }` и policy `remoteObjectOverrides: [{ connectionId, objectId, include?, localTarget? }]`. Anchor фиксирует actual file/folder ID, а remotePath остаётся display/legacy locator. Overrides компилируются в ту же canonical scope/projection tree, не создают второго editable coverage. ID exclusion ограничивает участие конкретного объекта; explicit inclusion/map проходит hard protection, origin scope и глобальную ownership проверку. Одинаково специфичные противоречивые ID overrides отвергаются. Legacy path-only binding сохраняется, пока уникальность доказана; при duplicate имени запрещено выбирать произвольный ID.

## 4. Профили и ограничения

| ID / режим | Create local | Update | Удаление | Conflict / remote writes |
|---|---|---|---|---|
| `standard:preserve` | Нет | Нет | Keep | Никаких effects |
| `standard:seed` | Только missing | Нет | Keep | Pull; existing файл не трогается |
| `standard:safe` | Да | Source change без локальных правок | Keep | Local edit deferred/skipped; incoming copy не добавляется |
| `standard:source` | Да | Enforce source с действующей защитой версии | Keep | Pull, существующая conflict protection сохраняется |
| `standard:conflicts` | Да | Source change | Keep | Automatic keep-both, не ask |
| `standard:drive-bidirectional` | Да | Changed side | Tracked через trash | Drive OAuth; keep-both; existing-ID gate |
| Custom `ask` | По explicit axes | По explicit axes | По explicit axes | Background создаёт inbox, не выбирает local самостоятельно |

Migration custom/legacy profiles сохраняет реальную комбинацию, не сводит все к шести labels. Tracked/full pull deletion сохраняет current source evidence guard; неподдерживаемый provider не становится deleting из-за соседнего Git job. Full mirror удаляет только принадлежащие job цели; локальные файлы другого job или unassigned paths не становятся «лишними».

Existing-only и prune-only могут вводиться как новые advanced policy capabilities отдельно; они не объявляются реализованными текущими пятью write modes. Bidirectional `local-wins`/`incoming`, existing-ID overwrite и unsupported combinations остаются disabled с объяснением, пока provider gates не расширены. Profile editor не предлагает выбор, который executor тихо преобразует в другую стратегию.

## 5. Symbolic owner resolver

Результат `resolveOwner(localPath, objectKind, revision)` зависит от **всех** назначений, включая disabled, auth-failed и невыбранные jobs. Selected run IDs фильтруют выполнение после определения owner, не пересчитывают владельцев. Preserve, excluded и unassigned не превращаются в scope для соседнего source.

Compiler строит trie локальных prefix boundaries, exact-file overrides, basename selector classes и mappings. Проверяются непустые пересечения областей, включая синтетический новый basename, отсутствующие вложенные папки и исключённые/повторно включённые subtree. Witness path выводится в diagnostic. Перечня найденных файлов и одного `__file__` недостаточно.

Для потенциально неоднозначного inverse mapping compiler блокирует bidirectional binding до уточнения, даже если в сегодняшнем inventory нет соответствующего файла. Неизвестный remote graph может оставить job browsable, но не даёт права на upload в guessed parent.

После remote browse compiler проверяет конкретные object IDs и post-policy destinations. Разные objects, aliases (`A.md`/`a.md`, NFC/NFD), file-vs-directory и ancestor target конфликтуют по физической canonical identity. Unsafe remote name показывается в browse, но не нормализуется молча в другой local filename.

## 6. Общая authority и leases

AuthorityRegistry хранит local ownership, remote writable namespace claims и unresolved historical reservations. Живёт дольше JobRunner. JobDirLock, созданный на экземпляр, не заменяет этот registry.

| Ресурс | Key / правило |
|---|---|
| Local file | Vault identity + host-normalized path; консервативный NFC/case alias guard |
| Local ancestor | Creation/rename/trash каталога конфликтует с зависимыми descendant effects |
| Plugin package | Единый package group для `main.js`, `manifest.json`, `styles.css`; split ownership не допускает package commit |
| Remote existing object | Provider object namespace + file ID, **без** изоляции ключа по Google account |
| Remote future child | Actual parent folder ID + target name comparison; Drive duplicate-name API не считается exclusive create |
| Remote subtree | Verified root ancestry/writable bindings; unresolved overlap удерживает только конфликтующие writers |
| Retired effect | Recorded local/remote targets и payload refs остаются reserved до доказанного terminal outcome |

Два OAuth accounts могут видеть один Drive file ID. Один account может иметь несколько jobs с пересекающимися roots. Для writable bindings это требует проверки global remote overlap; отсутствие локального пересечения недостаточно. Pull readers могут читать общий remote object в разные локальные цели, если они не становятся вторыми bidirectional authorities.

Before effect: owner witness + current epoch + durable lease + host/provider capability. Before commit: повторная version/ownership проверка. Leases получают в детерминированном общем порядке; при конфликте освобождают предварительные live leases и ставят работу в ожидание, без deadlock. Durable unresolved lease не освобождается одним TTL или abort.

В первой реализации apply один на весь vault; reads/staging ограниченно параллельны. Даже при serial apply reservations необходимы для recovery между runs, old generations, GC и late callbacks. Concurrent commits включаются отдельно после race fixtures для shared parent/package/remote roots.

## 7. Передача владения

Изменение assignment строит ownership diff для текущих **и будущих** целей. Если old target имеет pending/recovery, переход не вступает в силу для него до settle либо explicit reconcile. Новому владельцу передаётся binding/history receipt или состояние bootstrap-overlap, а не пустой baseline с разрешением затереть файл.

Default change и удаление connection не удаляют локальные/remote файлы. UI показывает affected scopes, conflicts и retained recovery history. Старые refs становятся retired; ручной discard recovery — отдельное действие с описанием конкретной утраты. Нельзя автоматически отдавать старый scope default source, если пользователь просто отключил job.

Scope exclusion защищает excluded files от sync/delete, но unresolved external effect по ним всё равно должен быть accounted. Автоматический recovery может probe и подтвердить уже выполненный effect; новые пользовательские изменения под старой policy требуют отдельного решения, а не скрытого расширения scope.

Hard guard сохраняет собственный plugin/control directory, `.trash`, `.git`, credential/recovery stores и известные host control paths. Разрешение other plugin code (`allowPlugins`) не разрешает запись в собственный plugin; package integrity guard проверяет набор файлов. Generic `data.json` не объявляется credential file без знания конкретного owner — это может быть переносимая пользовательская конфигурация.
