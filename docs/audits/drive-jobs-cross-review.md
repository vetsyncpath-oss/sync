# Drive collision, аудит интеграции и Per-Source Jobs V6: критическая сверка

Дата: 2026-10-14, Europe/Moscow. Проверяемый runtime: `028215b94ba2b546fad1862b46d6b31758bc184d`, ветка `integration/google-drive-bidirectional`; база — `overhaul/2b1-recovered`. Сверены оба пользовательских документа целиком: `audit-google-drive-sync.md` (371 строка) и `per-source-jobs-architecture-v6.md` (971 строка), текущие код/тесты, `docs/overhaul.md`, Drive target specification и ранее принятый profile streamline plan.

Вложения рассматриваются как аудит и предложения, а не как разрешение выполнить их migration snippets, удалить RoutedSource или включить concurrent mutations. Внешние документы `audit-engines-pipeline-autosync.md` и `profile-overhaul-spec-v5.md`, на которые ссылается V6, не приложены; их полное содержание здесь не подтверждается. Имеющаяся profile-streamline-proposal и её предыдущая интеграция в план учтены.

## Вывод

**Разделение исполнений по подключениям полезно и должно войти в overhaul. V6 в представленном виде нельзя использовать как готовую спецификацию реализации.** Оно уменьшает влияние ошибки одного источника на другие, но не исправляет обнаружение Drive-объектов, отбрасывание конфликтных копий, вечные unknown состояния и стоимость Drive checkpoints. Более того, предложенная изоляция журналов и параллельная запись убирают некоторые действующие защиты, если не добавить общий mutation authority.

Первым шагом должны быть корректные inventory/identity/ownership и разрешаемые состояния ошибок. Затем — независимые RunContext при сохранении общих гарантий безопасности. Физическое разбиение журналов и concurrent application должны идти после доказанной миграции и проверок. Исправленный порядок изложен в [плане per-source jobs](../per-source-jobs-plan.md).

## 1. Что означает текущий Drive path collision

Точный текст `Drive path collision: <path>` формируется в [gdrive-client.ts:73](../../src/sources/gdrive-client.ts#L73). Это **не сравнение локального и удалённого файла** и не отказ OAuth. Условие объединяет два разных случая:

```ts
paths.has(path.normalize('NFC').toLowerCase()) || seen.has(file.id)
```

После этого падает весь `inventory()`. Загрузка дерева в [main.ts:1831](../../main.ts#L1831) вызывает `source.getManifest()`, тот вызывает этот же строгий inventory. UI получает ошибку вместо дерева. У дерева нет отдельного ID-ориентированного browse API.

Пользователь уточнил: речь об одном файле, а ошибка указывает на путь внутри папки плагинов. Полного пути, двух метаданных объектов и ответа API нет. **Точную причину этого конкретного запуска пока нельзя утверждать.** Нахождение в `.obsidian/plugins` само по себе не вызывает это условие: Drive-клиент не знает `allowPlugins` и защиту локальной папки плагина. Политика применяется позже.

Изолированные воспроизведения настоящего `GoogleDriveClient`, без Google-аккаунта:

| Данные fake API | Результат |
|---|---|
| Один обычный файл | Успех, один объект |
| Один файл `.obsidian/plugins/example/main.js` с уникальными ID всех родителей | Успех, один файл |
| Тот же единственный plugin-файл с повтором того же ID на второй странице | `Drive path collision: .obsidian/plugins/example/main.js` |
| Два разных file ID с одинаковым именем в одной папке | Такой же collision |
| `Note.md` и `note.md`, разные ID | Такой же collision |
| Две Unicode-записи имени, совпадающие после NFC | Такой же collision |
| Binary и исключаемый Google Doc с одинаковым именем | Такой же collision **до исключения Docs** |

Следовательно, «один видимый файл» не доказывает ошибку выбора локальной папки. Повтор ID/нестабильная пагинация и конфликт с исключаемым объектом дают такое же сообщение, как два действительно разных файла. Проверка включает также папки; дубликаты родительских папок — отдельная возможная причина неоднозначного mapping. Ни один из fake-сценариев не доказывает, что именно он произошёл у пользователя.

Google Drive допускает одинаковые имена в одной папке: это прямо указано в [File resource, поле name](https://developers.google.com/workspace/drive/api/reference/rest/v3/files). Запрет применять два объекта к одному локальному пути обоснован. **Запрет просматривать весь источник из-за такой неоднозначности — неподходящий UX и неверное смешение browse и execution contracts.**

Нужно:

1. Разделить `duplicate-name`, `portable-alias`, `repeated-id`, `cycle` и конфликт итогового mapping. В диагностике показывать оба ID, исходные имена, parent ID, MIME, версии, путь и этап; не включать токены/session URL.
2. Построить raw Drive graph по ID; UI должен показывать оба объекта, даже когда их display paths совпадают. Нельзя схлопывать их обычным `Map<path, node>`.
3. Повтор одной и той же identity в пагинации проверять отдельно. Идентичные повторные наблюдения можно объединить после проверки метаданных; несовместимые наблюдения должны инициировать ограниченную повторную сверку, а не выбирать случайную версию.
4. Применить participation/protection/export policy перед проверкой **execution destination**. Исключённые объекты остаются видимыми как excluded и не становятся доказательством отсутствия tracked-файла.
5. Блокировать неоднозначный объект/поддерево, продолжая просмотр. Для sync нужны явное сопоставление ID и destination, выбор конкретного объекта либо исключение области. Автоматически удалять, переименовывать или выбирать один из одинаковых объектов нельзя.

**Per-source jobs не меняют `GoogleDriveClient.inventory()` и эту ошибку не устранят.** Они позволят Git продолжить независимо, если глобальное владение его путями доказано; Drive останется заблокированным до исправления своего inventory/mapping.

## 2. Сверка всех пунктов приложенного Drive-аудита

Аудит проверял вариант с 382 тестами. После него добавлен OAuth wait fix: текущая версия содержит 390 тестов, статусы входа, перенос OAuth-ссылки, явную отмену и deadlines для callback/exchange/refresh. Остальные замечания сверены с текущим кодом, а не приняты по номерам строк из вложения.

| Пункт аудита | Проверка | Уточнение / решение |
|---|---|---|
| 4.1: conflict copies не приходят на другие устройства | **Подтверждено, высокий приоритет.** [PathPolicy:130](../../src/core/path-policy.ts#L130) отбрасывает любой `.conflict-*`; настоящий host mapping также возвращает пустой результат | Прямой executor создаёт копию на устройстве A и в Drive, но B её не скачивает. Фикстура Drive-тестов дополнительно исключает копии и скрывает интеграционный пробел. Требуются artifact lineage и нормальное участие копий, с сохранением protection и старого pull recovery поведения |
| 4.2: 404 даёт вечный pending | **Подтверждено; предложенный выход неверен** | `unavailable` возвращает `pending` до проверки обоих отсутствий. Ручное удаление local **не закрывает** состояние 404. TTL не доказывает удаление и не должен разрешать его автоматически. Нужны явные, guarded решения с durable ack |
| 4.3: review и повторные копии | **Подтверждено частично; последствия сильнее описанного** | Review хранится локально по path, а не является общей inbox на устройствах. Новая правка заменяет ссылку на предыдущую review. Обычный retry одного durable intent не создаёт новую копию; новый intent повторно предложенного содержимого может создать её. Нужны versioned proposals и идемпотентность по lineage/content, а не только имя |
| 4.4: keepRemoteCopy / local-wins | **Подтверждён latent defect** | Настройки сейчас запрещают local-wins. Программный ask override может его обойти, после чего выбранная local primary снова превращается в remote primary + copy. Домен должен отвергать unsupported choice; при будущем включении нельзя молча менять решение. Запрет читать trashed сейчас явный, его снятие требует отдельного capability/restore contract |
| 4.5: uppercase SHA | **Подтверждено** | Pending heuristic сравнивает `current.sha256` с ненормализованным checksum, а restore shortcut также сравнивает SHA без lowercase. Нормализация нужна на metadata boundary; UUID/recovery identity менять не следует |
| 4.6: orphan secrets | **Подтверждено с поправкой** | Новые отменённые черновики обезвреживают свой secret пустой строкой. Уже сохранённые удалённые/переподключённые grant references остаются. Revoke не следует автоматически выполнять на delete одной connection: grant может использоваться другими connections. Нужны refcount и отдельное account disconnect/revoke |
| 4.7: performance | **Проблема реальна; оценка запросов преувеличена, главное упущено** | SHA/version доступны: обычный тёплый no-op не вызывает `parent()`/`owned()` для каждого неизменённого файла. Parent обходы относятся к mutations/проверке отсутствий; листинг зависит от числа каталогов/страниц. Полное local hashing остаётся. Дополнительно подтверждена квадратичная запись Drive state, см. ниже |
| 4.8: нет metadata/download request retry | **Подтверждено на transport-level; «ретраев нет вообще» неверно** | Есть job retry, file queue и upload retry. Листинг действительно падает с первого transient и требует нового запуска. Добавить ограниченный read retry с общим budget/Retry-After. Нельзя слепо повторять все POST/PATCH через общий NetLayer: неизвестный mutation result требует fixed-ID/status reconciliation |
| 4.9: folder picker Back | **Подтверждено** | История меняется до успешной загрузки и при forward, и при back. Навигационные запросы уже отменяются при смене папки; это не исправляет историю. Breadcrumb/current folder/корректный разбор supported links полезны отдельно; docs.google.com document URL не является folder locator |
| 4.10: octet-stream | **Подтверждено** | MIME влияет на UX/preview. Маппинг должен остаться binary upload, без случайного преобразования Markdown/JSON в Google-native формат |
| 4.11: нереализованные функции | **Подтверждено** | Existing-ID content update выключен по решению пользователя; это capability gate, а не обещанная готовая функция. Rename, tombstones, empty directories, Changes, streaming/multipart, полный Drive preview и remote repair остаются backlog |
| 4.12: live checks | **Нужны, но не заменяют contract review** | Особенно trash/parents, shared access, root membership и гонки между inspect и PATCH. Передача version как строки и проверка перед PATCH не дают атомарного compare-and-set |
| 4.13: UX loops | **В целом подтверждено** | Keep-resurrection — поведение keep, которое нужно объяснять. Ask требует явной inbox/ручного решения; произвольный автоматический fallback запрещён. Poisoned paths требуют понятного repair/retry, не кнопки безусловного снятия guard |
| 4.14: stale inventory при вопросах | **Подтверждено** | `resolveQuestions()` и cached source используют исходный inventory. После ответа нужны targeted fresh metadata/local observations; при смене версий — replan/повторное подтверждение. Повторять всю инвентаризацию на каждую модалку необязательно |
| 4.15: повторный импорт того же JSON | **Подтверждено как UX/lifecycle gap** | То же client config может сохранить identity; другой client должен явно инвалидировать grant. Нельзя сохранять старый token при смене identity без проверки |
| 4.16: долгий startup retry | **Частично подтверждено** | File queue backoff может длиться часы; Drive source/network failures дополнительно ограничены scheduler budget 5. Pull file failures имеют другой scope. Нужны общий elapsed budget и retry только due paths; startup-only нельзя превращать в постоянный realtime |

`deferredConflicts!--` в аудите отмечен как потенциальный NaN. Нормальный ask path заранее увеличивает счётчик; воспроизведения NaN здесь нет. Зато обнаружено реальное удвоение счётчика review при новой правке одного pending path.

### Ошибочные API/семантические утверждения аудита

- `prompt=consent` не гарантирует успешный вход и refresh token: пользователь может отказать, не дать полный grant или столкнуться с ограничениями. Текущий код правильно проверяет результат, а новый timeout fix не считает browser callback успешной авторизацией.
- «1000 запросов на пользователя за 100 секунд» нельзя использовать как текущий универсальный лимит. На проверенной [странице квот](https://developers.google.com/workspace/drive/api/guides/limits) Google описывает новую модель quota units с 1 мая 2026 для новых проектов; часть прежних проектов сохраняет старые квоты. Нужны значения конкретного Cloud project и account-level backoff. Это особенно важно при нескольких jobs одного аккаунта.
- «Удалить local, чтобы закрыть 404» неверно по порядку веток planner. Не следует предлагать пользователю удаление данных как ремонт служебного состояния.
- «TTL автоматически закроет отсутствующий remote» допустим только для уведомлений/архивирования вручную разрешённого состояния; возраст ошибки не превращает потерю доступа в доказанное удаление.
- Немедленный best-effort revoke при удалении connection может разлогинить другое подключение, использующее тот же grant. Локальное отключение и серверный revoke — разные действия с отдельными исходами.

## 3. Дополнительные находки, пропущенные приложенным аудитом

### D1. Drive state заново вводит квадратичную запись метаданных

[planDrive:11](../../src/core/drive-planner.ts#L11) возвращает `adopt` при одинаковых байтах. [DriveCoordinator:82](../../src/core/drive-coordinator.ts#L82) всегда вызывает `baseline()`, а тот сохраняет полный DriveState даже при неизменном baseline. Для N уже согласованных файлов происходит N полных generation-публикаций размера O(N).

Измерение на in-memory filesystem, после initial reconciliation, без upload/download:

| Файлов | Записей Drive checkpoint | Байтов JSON в `fs.write` | Media transfers |
|---:|---:|---:|---:|
| 1 | 1 | 403 | 0 |
| 20 | 20 | 104 820 | 0 |
| 100 | 100 | 2 572 200 | 0 |

Это объём одного переданного в `write` JSON на поколение; чтения/проверки/rename, host filesystem и latency не включены. Это не live benchmark Drive. Рост подтверждает O(N²) metadata traffic в тёплом режиме. Retention до двух файлов ограничивает число файлов, **не объём постоянной перезаписи**. Тем самым Drive reintroduces проблему, ради которой overhaul 2б.1 переводил local ledger на deltas.

Исправление: no-op acknowledgement без записи, если baseline/review/pending не изменились; durable запись каждого фактического эффекта сохраняется. Затем item deltas/checkpoint batching с recovery boundaries. Нельзя отложить все remote acknowledgements до конца сеанса и потерять idempotency после crash.

### D2. Review counter считает один путь дважды

Воспроизведение: baseline `base`, затем local `first`, `second`, снова `first` при неизменённой remote primary.

| Правка | Review entries | Copy objects | `deferredConflicts` |
|---|---:|---:|---:|
| first | 1 | 1 | 1 |
| second | 1 | 2 | 2 |
| first повторно | 1 | 3 | 2 |

Старый review учитывается до нового решения; новый review учитывается ещё раз, затем заменяет старый по тому же path. Нужны ID-ориентированные unresolved records и счётчики из unique records, отдельно число paths и число proposals. Совпадение имени или hash не разрешает перезаписать пользовательскую копию.

### D3. Namespace всё ещё зависит от чужого legacy mapping

[driveNamespace:12](../../src/core/drive-state.ts#L12) включает все `policy.folders` с `target`, даже относящиеся к Git. Probe показывает: добавление mapping `Git → Code` меняет Drive namespace. Не связанные provider URLs и fileRules уже исключены; legacy folder mapping остаётся пробелом.

Последствие: прежний Drive baseline/pending/review становится неактивным, а bootstrap больше не отличает new от previously deleted. Старые файлы состояния не должны удаляться как мусор. Нужны compiled routing semantics **конкретной pair**, стабильная storage identity и явная новая generation при реальной смене пары.

### D4. Нельзя разделять journals, не сохраняя общую защиту physical targets

Текущий [DurableMutations:19](../../src/core/durable-mutations.ts#L19) проверяет unresolved records во всём shared OperationStore. Если каждому job дать отдельный store, `records()` увидит только собственные записи.

Probe: old-job имеет `committing` intent для `shared.md`; new-job с отдельным store записывает `B` в этот же физический путь, хотя старый intent остаётся committing. Это моделирует смену ownership с сохранённым recovery, а не законную запись двух active scopes одновременно. Валидация только текущих назначений не видит retired ownership. Общий registry/lease должен включать legacy, disabled, retired jobs и generations.

### D5. Rename-only migration молча теряет cache

Manifest содержит `sourceId`. Probe: после переименования `manifest-old-namespace.json` в `manifest-new-job.json` новый reader получает **0 записей вместо 1**, поскольку [readPublished:129](../../src/core/manifest-cache.ts#L129) отвергает identity mismatch и при отсутствии подходящего `.previous` возвращает null.

Для новых intent store namespaces простой rename ещё хуже: общий ledger содержит несколько namespace, chain tip, sequence, baselines и marker. Filename-only migration не разделяет их и не доказывает владельца старой операции. Это основание переработать V6 §6, а не прикрутить ещё один migrated flag.

### D6. Обычный filename может столкнуться с prototype key состояния

Drive baseline/pending/review хранятся в обычных `{}` и читаются через `object[path]`, без проверки own property. Fake remote-файл с допустимым именем `constructor` (без расширения) воспринимается как существующий pending function из Object prototype. Probe получает `Cannot read properties of undefined (reading 'kind')`, scope session, а следующий `other.md` не скачивается. Это не нарушение диска, но обработчик превращает исключение в session IO failure.

Нужны Map/null-prototype records либо `Object.hasOwn` при каждом чтении; валидаторы должны защищать от inherited keys. Точечный blacklist пользовательских имён скрывает дефект структуры данных. Этот сценарий не является объяснением collision конкретного plugin-файла пользователя.

## 4. Что Per-Source Jobs действительно улучшат

| Проблема | Улучшение V6 | Что требуется помимо job-объектов |
|---|---|---|
| Permanent failure одного подключения блокирует все auto starts | Per-job blocked state | Различать job, account, subtree и общую storage/governance ошибку; пересчитывать блокировки после repair |
| Все selected inventories должны пройти до любых writes | Можно выполнить здоровые независимые jobs | Глобальный owner resolver не должен зависеть от доступности source; fail не передаёт его область default job |
| Composite deletionSafety ограничивает Git из-за unverified source | Evidence по source/scope | Проверять не только общий immutable флаг, но конкретный snapshot и наличие межjob dependencies |
| Queue/cache меняются с aggregate routing namespace | Очереди и baseline живут у своей pair/generation | Job ID сам по себе не является identity данных |
| Recovery одной области прерывает unrelated work | Локальная проблема не блокирует unrelated job | Shared ledger corruption/IO/quota остаются общими; чужой unresolved target всё ещё защищён |
| Разные интервалы и pending startup events | У каждого подключения понятный job lifecycle | Совместимость `inherit`, pause/resume, bounded continuation и перенос сигналов при rebuild |
| Source recreate каждый запуск | Можно хранить ConnectionContext | RunSnapshot должен обновляться. Сам по себе persistent ZIP/Drive source не доказывает freshness и cleanup |
| Сложный общий UI | Per-connection results и progress | Стабильные jobId/connectionId/generation в журнале, полный Drive plan и inbox, уникальные counters |
| Одновременные transfers | Можно уменьшить ожидание между источниками | Account quota budget, global buffer budget, package/parent locks; performance требует измерений |

## 5. Ошибки и недоказанные гарантии V6

1. **«Корень всех проблем — RoutedSource» слишком сильно.** collision — provider inventory; conflict copies — PathPolicy; pending — planner/UI; quota — retention; stale identity — pair model. Удаление класса не исправляет их.
2. **Текущие разные профили не «невозможны».** `compileProfiles()` уже разрешает axes per assignment; deepest/exact/names rules разделяют поведения. Проблема composite deletion evidence и legacy full-content ambiguity остаётся. V6 должен сохранить модель override, а не заменить её одним profile на connection.
3. **Rate limit не равен permanent global block.** Текущий Drive network/429 классифицируется retryable; глобальный `autoBlockedReason` опасен для permanent session/auth проблем, но утверждение про любой Yandex rate-limit как «всегда блокирует Git» не подтверждается.
4. **Число source instances сейчас не 1.** Есть composite и N child instances на session. Новый подход меняет lifetime, а не превращает 1 provider instance в N.
5. **Path ownership нельзя проверить расширением существующих файлов.** Будущие пути, default complements, nested overrides, names filters, remotePath, mapping, alias и rename targets требуют символического resolver. Родительская область и более точное вложенное назначение — не обязательно конфликт; это текущая допустимая семантика.
6. **«Exactly one default» противоречит §8.4 и режиму «только назначения».** Разрешить 0 или 1. Disable default job не должен молча отдавать его пути другому job.
7. **Локальные disjoint scopes не гарантируют disjoint Drive mutations.** Два connections могут указывать на один root/file ID. Нужны проверка writable remote scope overlap и remote resource leases; account grants могут быть разными для одного shared объекта.
8. **Concurrent writes не доказаны одним DataAdapter.** Case/NFC aliases, file-versus-directory ancestors, runtime plugin packages и retired pending targets нарушают простую модель. DirLock сейчас per-instance. Общий parent/package/physical mutation authority обязателен.
9. **Recovery content-addressed не заменяет reference/pin protocol.** Один shared экземпляр сериализует saves, но GC использует заранее собранные refs. Reuse старого deduplicated payload и конкурентная publication могут пересечь GC. Нужны live pins и согласованный снимок всех retained journals, включая disabled/retired jobs.
10. **Persistent provider нельзя приравнять к persistent snapshot.** `GDriveOAuthSource.inventorySnapshot ??=` + dispose только files map при прямом переносе lifetime закэширует дерево навсегда. ZIP `getManifest()` сейчас специально вызывает `forceDispose()` для fresh listing. Вечный ZIP reader или ETag cache не даёт неизменяемость нового run.
11. **reloadJob небезопасен.** В примере нет cancel/join активного run, epoch/fence, проверки ownership перед cutover; после dispose может ещё прийти old write. В load timers запускаются до общей validation. Строить jobs inert, валидировать, восстанавливать ownership, затем активировать schedules.
12. **auto-keepCurrent для blocked recovery неприемлем.** `recover()` уже закрывает доказанные applied/not-applied случаи. Blocked означает неизвестные текущие bytes. Автоматическое «оставить» без решения может разрешить следующему plan уничтожить именно новые пользовательские правки.
13. **Один migratedV6 flag и атомарные отдельные rename не образуют атомарную миграцию.** Нужны verified state partition, receipts, settings acknowledgement, active-generation switch, rollback fences и readers старых pending records. DriveState migration в примере вообще пропущена.
14. **V6 снова дублирует authority.** `source.auto` и `job.schedule`, `Profile.coverage/selectedFolders` и assignments competing scope. Это противоречит ранее принятому streamline plan. JobRuntime должен быть производной от Connections + compiled vault assignments, а не вторым редактором тех же правил.
15. **`sources:[jobId]` не backward compatible.** Сейчас журнал пишет display names в sources, а не стабильные IDs. Нужны additive поля; не заменять имя ID без версии/reader conversion.
16. **Удаление RoutedSource слишком раннее.** Оно включает routing/locator/projection/inverse mappings, не только orchestration. Сначала перенести и доказать эти обязанности, включая будущие пути и plugin names filters; удаление файла само по себе не завершает шаг.
17. **Раздельные квоты не решают storage shortage.** Shared recovery и filesystem остаются общими. Per-job 10k history при N jobs увеличивает общую историю; global storage budget и pin-aware retention по-прежнему нужны.
18. **Оценки «fixed completely», instant prepare и 14/26 дней не доказаны.** Root auth, full inventory, recovery validation и host writes остаются дорогими; persistent caches занимают RAM, а не только диск. Срок следует оценивать по проверенной вертикальной интеграции, не по числу новых классов.
19. **`inherit` не разрешается в migration snippet.** `connection.auto ?? settings.autoSyncInterval` оставляет строку `inherit`, которая не является SchedulerInterval. Проверенный вызов текущего Scheduler с таким невалидным результатом создаёт periodic delay NaN. Типизированная реализация должна отклонить его; если пропустить его через cast/unvalidated config, таймер может превратиться в частый цикл. Нужен canonical schedule resolver, сохраняющий inherited режим как input и вычисляющий действующий interval.
20. **В новом JobManager не представлены DriveCoordinator и DriveState.** Обычный read SyncSource + legacy Coordinator не реализует bidirectional planner/trash/proposals. Также GDrive «100 MB» в вводной таблице V6 не является текущим configured cap или общим API-пределом: текущий desktop cap по умолчанию 64 MiB, настройка 4–256 MiB. Job executor должен выбирать provider/direction capabilities по compiled paths, а не просто создать N pull coordinators.

## 6. Соответствие будущему overhaul

| Принятый этап / инвариант | Как интегрировать jobs |
|---|---|
| 2а immutable plan, guards, recovery | RunContext + mutation authority сохраняют preconditions и recorded semantics. Сбой одной file dependency block не снимается ради throughput |
| 2б.1 deltas/compaction | Применить этот подход к Drive item state; отдельно ограничить retained generations. Split store после протокола migration, а не вместо него |
| 2б source identity, namespace, staging | Здесь место pair generations, ownership registry, RunSnapshot и per-job queue. Job UUID и data generation различны |
| Profile streamline | Один compiler scope/behavior/direction/routing; legacy axes как совместимый input. Jobs не вводят новый profile.coverage authority |
| Unified runner всех триггеров | Один JobManager orchestrates trigger events; provider-specific planner/evidence, общий executor protocol. Нельзя копировать singleton main-state N раз |
| Auto/UX | Per-job status, bounded finishing pass, persistent decisions, due-path retry и full bidirectional preview. Auto не выбирает конфликтную версию за пользователя |
| Миграция | Dual-reader/verified cutover, baseline ownership не расширяется, новые uploads/trash не включаются старым пользователям автоматически |
| Provider contracts | Git immutable tree, ZIP leased snapshot, Yandex/WebDAV unstable enumeration и Drive object IDs требуют разной evidence, даже внутри общего runner |
| Drive concurrency | Сохранить согласованный gate: existing-ID content update выключен, спорное содержимое публикуется копией. Jobs не отменяют этот gate |

Нельзя реализовать V6 «как foundation для V5» простым переносом constructor dependencies. Foundation — это ownership/effect/recovery contracts. Jobs дают независимое исполнение **поверх** этих contracts.

## 7. Проверки и пределы выводов

20 изолированных probes сохранены в [drive-jobs-probes.json](drive-jobs-probes.json). Воспроизвести на этой ветке:

```sh
node scripts/audit-drive-jobs.mjs
```

Скрипт использует реальные provider/planner/policy/state/mutation классы и fake API/vault из тестов; временная bundle удаляется. Он не читает настоящий vault, не запрашивает grant, не обращается к Google и не выполняет migration из вложения. Это architectural probes: некоторые результаты специально показывают дефекты, поэтому они не являются набором regression tests с утверждением корректности этих дефектов.

Повторный `npm run verify` на проверяемой версии завершился успешно: **390/390 regression tests**, TypeScript, CSS и production build. Проходящие тесты не отменяют приведённых негативных воспроизведений. Multi-device conflict artifacts, настоящий Drive folder IDs/pagination, permission loss, trash и гонки с внешним клиентом требуют отдельных live checks. Для пользовательского collision пока подтверждена точка отказа и воспроизводимые классы причин, но не фактические IDs его объектов.

Официальные contract references: [File resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [quota model](https://developers.google.com/workspace/drive/api/guides/limits), [custom properties](https://developers.google.com/workspace/drive/api/guides/properties), [uploads / reserved IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads). Для lineage следует учитывать private visibility `appProperties` и предел размера metadata; отдельные OAuth apps не обязаны видеть одинаковый private metadata namespace. Имена пользовательских файлов не являются надёжной идентичностью артефакта.
