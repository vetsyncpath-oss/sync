# Статус реализации Overhaul vNext

Дата: 2026-10-14, Europe/Moscow. Сборка: `overhaul-s0-id-browse-2026-10-14`.

Реализован **первый вертикальный участок S0a**, без включения JobManager, изменения профилей/settings schema или переноса durable stores. Остальные требования [полной спецификации](README.md) остаются target contracts. Drive checkpoint сохраняет формат v1; новая generation и uploads/deletions при upgrade не выводятся из пустого состояния.

## Сделано

| Область / сценарии | Реализация и доказательство |
|---|---|
| Raw browse, A01–A04 (частично), A54 | Отдельный `getBrowseSnapshot`; ID/parent graph, duplicate folder branches, unsafe names, unsupported objects и empty folders видимы. Реальный workspace и source-path picker используют opaque row keys |
| Repeated IDs, A02 | Идентичные наблюдения объединяются с diagnostic; разные metadata/parents дают unstable snapshot и запрещают execution. Произвольная версия не выбирается |
| Inventory bounds / object identity | Global observation budget 200,000 учитывает повторы, не только unique IDs. Inspect/metadata/mkdir проверяют returned ID; `root` alias разрешается только при чтении |
| Unsupported duplicate, A06 | Native object остаётся в browse; supported execution фильтруется до проверки duplicate paths. Native duplicate не блокирует единственный binary файл |
| Execution protection, A04/A05 (частично) | Source manifest остаётся строгим. Разные supported IDs/aliases блокируются с IDs и parents; literal slash/unsafe name не преобразуется в новый local path |
| Metadata keys/checksums, A10 | Own-key getters, null-prototype Drive dictionaries и legacy directory-map защита; `constructor`, `toString`, `__proto__` проходят sync и checkpoint reload. API checksums нормализуются к lowercase |
| Warm state IO, A66/A75 (частично) | По неизменённым файлам нет baseline save; runner читает отдельные entries, без полного snapshot clone на файл. Проверены 80 файлов в regression и 1/20/100 в probes |
| Review counters, A09 (частично) | Один pending conflict path считается один раз, включая новое review на том же пути |
| Fresh conflict decisions, A45 | До вопроса inspect actual ID; после ответа fresh local/remote comparison. Stale consent остаётся pending. Unsupported choice rejected, следующие независимые questions продолжаются |
| Provider lifetime, A43 (частично) | Dispose очищает run inventory; повторное использование получает новый snapshot |
| Picker, A56 | History меняется после successful load; breadcrumbs/duplicate-folder IDs, retry, return-current и cancel во время loading |

Проверки используют actual `GDriveOAuthSource → SourceInventories → workspace/tree` и host dispatch с fake API/FS. Fixtures обновлены до нового inventory DTO; production fallback на отсутствующие поля не добавлен. SHA/MD5 checksums нормализуются для проверки content, но исходный opaque MD5 token pull manifest сохранён отдельно: upgrade не создаёт ложный source change. Google live account/настоящий Obsidian host этим этапом не проверены.

## Измеренные изменения

[Новые 20 probes](../audits/overhaul-s0-probes.json) сравниваются с [историческими](../audits/drive-jobs-probes.json); старый snapshot не перезаписан. Скрипт разделяет browse и execution outcomes, чтобы успешный raw browse не выдавать за разрешённую запись.

| Probe | До | После |
|---|---|---|
| Один ID повторён на странице | `Drive path collision` | Один object, `repeated-object`, execution manifest 1 |
| Разные IDs, одинаковое имя | Всё перечисление падает | Browse 2, execution blocked с двумя IDs |
| Binary + native Doc, одинаковое имя | Всё перечисление падает | Browse 2, native excluded, binary manifest 1 |
| Warm 1 файл | 1 checkpoint / 403 bytes | 0 / 0 |
| Warm 20 файлов | 20 checkpoint / 104,820 bytes | 0 / 0 |
| Warm 100 файлов | 100 checkpoint / 2,572,200 bytes | 0 / 0 |
| `constructor` + независимый файл | Session IO failure, второй файл не скачан | 0 failures, второй файл скачан |
| Новый edit существующего review | Pending counter 2 на один path | Counter 1 |

Это metadata/fixture measurements, не замеры real Drive. Cold adoption/реальные changes всё ещё публикуют полный checkpoint per acknowledged effect; delta backend — S4 gate.

## Что пока не включено

- Versioned proposals/history/content dedup, artifact lineage и получение copies вторым vault. `first → second → first` всё ещё создаёт 3 copies; исправлен только counter. Глобальный `.conflict-*` фильтр ещё не снят.
- Persisted unknown/conflict inbox и guarded 404 resolution; deletion/tombstone lifecycle остаётся пилотным.
- ID anchors/object-specific exclusions в saved policy. Duplicate rows можно осмотреть, но path-only binding для них disabled; произвольный ID не выбирается.
- Post-policy collision isolation и independent per-job execution. Combined inventory failure по-прежнему останавливает writes выбранного общего запуска; broad collisions ещё не обходятся через exclusions.
- Pair-specific namespace reconcile, settings writer fence, shared symbolic authority и verified per-job migration.
- Pin-aware GC и cleanup retired manifest namespaces. Zero warm writes не означают, что исторические `sync-operations-v3-*`/`.previous` уже безопасно очищены.
- Полное startup-cycle/status/finishing решение, Changes, rename identity, empty-directory sync, streaming и existing-ID content CAS.

Существующие Drive IDs, guarded tracked trash, старые профили и mandatory local recovery сохраняются. Existing-ID overwrite не включён. Точный исходный collision пользователя не подтверждён API данными; покрыты plugin-file path и repeated-page воспроизведения.

## Следующий участок

S0b: versioned Drive reader/writer fence, stable proposals и peer artifact routing через реальную policy; затем durable unknown inbox. После этого S1 authority compiler и S2 independent jobs, с общим ledger и serial apply. Persistent runners/раздельные stores требуют передачи routing и recovery reservations.

## Верификация

`npm run verify`: **415/415** тестов, TypeScript, styles и production build прошли. Добавлены 25 regression cases к предыдущим 390. Проверены `git diff --check`, relative links и BUILD_TAG/MIT notice в bundle. 20 architectural probes повторены; current snapshot опубликован отдельно. Отрицательные результаты по ещё не включённым contracts остаются видимыми.
