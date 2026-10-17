# Продолжение overhaul: bounded Yandex observation и evidence

Дата: 2026-10-17. Baseline: локальный commit `e8335eb2798ccabfc4156cf920bf8c6c299a5c0c` предыдущего safety-этапа. Полный overhaul не завершён.

## Поправки к спецификации

Добавлен [документ 14](../../overhaul-vnext2/14-execution-evidence-and-observation-clarifications.md): проверять полный набор terminal evidence, считать root/директории/повторные observations до добавления в очередь, не выдавать cycle/duplicate/partial listing за complete, публиковать карту provider paths только после успешного traversal. Одновременные getManifest на одном adapter пока явно отвергаются, а не изображаются поддержкой concurrent ProviderRuns.

Там же зафиксирована критика порядка волн: зависимости leases/pins/identity важнее номера W; девять outcomes нельзя внедрять заменой enum без receipts и scheduler/journal/UI; path grammar требует migration, а изменение memory default не доказывает реальный resident budget.

## Check до имплементации

`YandexSource.getManifest` создавал visited, но не заполнял его. Ограничение files проверялось только в цикле folders, поэтому root без подпапок обходил его. Directory-only cycle не достигал file limit. apiPaths менялся по мере чтения страниц; при отказе оставалась частичная карта. getManifest не очищал старые href. Любой 400/403/404 листинга, включая nested, превращался в сообщение «public link invalid» без typed status. Конкурирующие observations делили mutable state.

Отдельные проверки циклов на старом коде ограничены fake transport после 20 запросов: тест не зависает и не выдаёт watchdog за корректный production bound. Oracle требует `inventory-unstable` после 1–2 вызовов. Проверки бюджета используют небольшие explicit limits через настоящий constructor, а не mock самого traversal.

## Реализация

- `InventoryTraversal` учитывает root и все listing rows; unique API paths хранятся в Set. Лимиты до enqueue/index: 100000 nodes, 200000 observations и дополнительный provider cap 10000 folders. Overrides — положительные safe integers. Общий schema/UI ConfigDefaults ещё не внедрён.
- Cycle, повторный API path и local-path duplicate дают `inventory-unstable`; произвольного winner/skip нет. Array-only adapter отвергает snapshot целиком: progressive partial browse здесь не реализован.
- Валидируются integer total, его стабильность, page size, advertised offset/limit, отсутствие пустого продолжения/превышения total. Для offset += 200 непоследняя страница должна содержать 200 элементов; иначе безопасный отказ. Это консервативный контракт до live-проверки provider pagination.
- Очередь обходится индексом, без repeated shift. Карта paths строится локально и становится доступной fetch только после полного успеха. Отмена, failed refresh и disposal не публикуют частичную/позднюю карту. Новая observation сбрасывает href cache.
- `observation-busy` не меняет состояние уже выполняемой observation. После завершения/ошибки следующий обход разрешён. Dispose invalidates publication generation; это не claim физической отмены сетевого запроса.
- Root ошибки имеют `public-link-invalid`, nested — `inventory-unavailable`; HTTP status сохраняется. Existing issue projection получает typed message через текущий механизм. Новый централизованный i18n registry этим этапом не реализован.
- Download требует актуального complete manifest. Coordinator regression подтверждает отсутствие local effects и сохранность original при cyclic tree.

## Evidence runner

`scripts/audit-yandex-observation.mjs OUTPUT.json [BASELINE_GIT_REF]` использует фиксированный registry из 33 уникальных scenario IDs/names. Parent проверяет flat TAP plan, точное множество и нумерацию результатов, pass/fail totals, отсутствие cancelled/skipped/todo и exit status. Watchdog 30 s удерживает ожидание, stdout/stderr ограничены 2 MiB. До setup отчёт переводится в incomplete, чтобы не принять stale pass после setup failure. После записи JSON выполняется readback.

Старый исторический runner не переписан. Новая проверка применима именно к текущей flat suite; не объявляется универсальным TAP parser для произвольных nested tests.

Шесть unit-тестов валидатора: complete set, truncated/missing output при exit 0, duplicates/unregistered scenarios, failed-but-complete evidence, skip/cancel/todo/nonzero exit, duplicate plans/summaries/IDs. `scripts/test.mjs` теперь включает также `.test.mjs`, поэтому эти проверки входят в обычный `npm test`.

## Проверка

- На старом provider с **тем же окончательным fixture**: **31 fail / 2 pass**, evidence complete=true/status=fail. Это не 31 независимый дефект, а assertions нескольких нарушенных контрактов и typed diagnostics.
- На новом provider: **33/33 pass**, complete=true/status=pass.
- Положительные старые случаи: нормальный paginated BFS и отмена во время чтения. Остальные четыре позднее добавленных lifecycle regressions также перепроверены на старом provider.
- Итоговый `npm run verify`: **628/628**, TypeScript, styles, production bundle. Предыдущие 589 тестов включены.
- Setup failure smoke: несуществующий baseline ref → nonzero exit и incomplete JSON; устаревший pass не сохраняется.
- `git diff --check` чистый. В поставляемых TAP удалены пробелы в конце строк; это отмечено в JSON, tapSha256 вычислен по поставляемому файлу. Scenario results не менялись.
- Build tag: `overhaul-vnext2-yandex-observation-2026-10-17`.
- `main.js` SHA-256: `aa7149d23a256757eea15389583fd662c7b7b7360261b7492c4a20e66d6e2246`.

Baseline mode подменяет только `src/sources/yandex-source.ts` через esbuild onLoad. Остальной harness/core — текущий checkout. Это component regression через production provider и Coordinator seam, не полная сборка старого commit. JSON хранит provider/fixture/TAP SHA-256 и Node version. В Source ZIP нет git history; для baseline replay нужен checkout указанного commit. Текущий runner без baseline работает из Source ZIP после npm ci.

```sh
node scripts/audit-yandex-observation.mjs /tmp/yandex-current.json
npm run verify
```

## Открытые границы

R11.7/B44 покрыт частично: traversal, pagination, snapshot publication, root/nested diagnostics и Coordinator no-effects. Обновление expired href с проверкой той же remote identity, source configuration epoch, параллельные fetch/refresh, UI callbacks старой эпохи, физическая остановка transport и полная file-link ZIP lifecycle требуют отдельных tests/реализации. Одновременные runs одного adapter не заявлены. Digest validation/portable path projection остаются общими открытыми контрактами.

Live Яндекс/Google/Obsidian и performance acceptance не запускались. Mandatory VAM, existing-ID overwrite gate, formats/migrations и concurrency effects не менялись. Полные W1–W4 остаются открытыми; следующим независимым bounded provider slice может быть ZIP singleflight, после проверки epoch/dispose/loser cleanup. W1 outcomes/receipt reconstruction остаётся более крупной отдельной задачей.
