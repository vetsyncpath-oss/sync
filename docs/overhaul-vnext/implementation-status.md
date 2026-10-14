# Статус реализации Overhaul vNext

Дата: 2026-10-14, Europe/Moscow. Сборка: `overhaul-s0-lifecycle-2026-10-14`.

Реализованы **S0a и основные участки S0b/S0c**, без включения JobManager, изменения профилей/settings schema или переноса durable stores. Остальные требования [полной спецификации](README.md) остаются target contracts. Drive checkpoint теперь v3 с verified v1/v2 import и writer fence до effects; namespace fingerprint не изменён. Полный протокол и ограничения описаны в [S0b proposal contract](07-s0b-proposals.md) и [S0c lifecycle amendment](08-s0c-lifecycle.md).

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
| Stable proposals, A08/A09 | Несколько proposals сохраняются по ID; key включает namespace, origin ID/version/hash, payload hash и kind. `first → second → first` на неизменном base даёт две copies. Attempt mutation IDs отдельны от publication ID |
| Peer copies, A07/A31/A33 (fixture evidence) | Public portable marker, fresh root/parent/origin/digest guards; actual host dispatch доставляет copy через named mount. Copy не попадает в canonical/pull manifest и не создаёт copy of copy |
| Copy lifecycle | Local edit/missing, remote edit/trash/404/marker change сохраняют pending receipt и пользовательские байты. Нет automatic overwrite/trash/recreation полученной копии; scan может восстановить проверенные missing bytes |
| Version fence/import, A65/A69–A71 (частично) | Immutable checksum backup retained v1 generations до first v2; pending IDs, URL/offset, bytes/copy/directory refs сохранены. Future/corrupt backup и loss active checkpoint блокируют writes. All-generation GC roots включают proposal payloads и migration backup |
| Canonical unknown, A26/A30 (частично) | Stable durable ID/revision, HTTP 404/permission 403, relocation/role/identity replacement; local deletion/restart не теряют ID. Одинаковое evidence — zero writes |
| Tracked lifecycle, A28/A34 (частично) | Tombstone вместо clear baseline, ID/digests/receipt/survivor ref. Crash после trash сохраняет lineage; offline 100 дней/local recreation не создают new ID |
| Guarded restore, A45/A47 (частично) | Recovery/command inbox: read-only probe, exact namespace/version/local consent, same-ID untrash/download. Lost response сохраняет intent; weak digest, permissions, dirty/stale target blocked |
| V2 upgrade / GC | Immutable v2 backup, v1/v2→v3 без потери proposals/receipts/reserved IDs. Tombstone payloads/backup-only refs проходят GC test; schema regression blocked |
| Scope/current policy | Origin remote/local и outgoing-copy excludes проверяются до effects; hard control paths не обходятся marker. Prepared trash заблокирован при текущем `keep` или surviving unsaved editor |
| Fresh conflict decisions, A45 | До вопроса inspect actual ID; после ответа fresh local/remote comparison. Stale consent остаётся pending. Unsupported choice rejected, следующие независимые questions продолжаются |
| Provider lifetime, A43 (частично) | Dispose очищает run inventory; повторное использование получает новый snapshot |
| Picker, A56 | History меняется после successful load; breadcrumbs/duplicate-folder IDs, retry, return-current и cancel во время loading |

Проверки используют actual `GDriveOAuthSource → SourceInventories → workspace/tree` и host dispatch с fake API/FS. Fixtures обновлены до нового inventory DTO; production fallback на отсутствующие поля не добавлен. SHA/MD5 checksums нормализуются для проверки content, но исходный opaque MD5 token pull manifest сохранён отдельно: upgrade не создаёт ложный source change. Google live account/настоящий Obsidian host этим этапом не проверены.

## Измеренные изменения

[S0a probes](../audits/overhaul-s0-probes.json) и [S0b probes](../audits/overhaul-s0b-probes.json) и [текущие S0c probes](../audits/overhaul-s0c-probes.json) сравниваются с [историческими](../audits/drive-jobs-probes.json); прежние snapshots не перезаписаны. Скрипт разделяет browse и execution outcomes, чтобы успешный raw browse не выдавать за разрешённую запись. Name-only probe по-прежнему исключает unmarked copy; получение portable artifact доказано отдельными actual host tests.

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
| `first → second → first` | 3 copies; одна review pointer | 2 copies, 2 retained proposals; unique pending path 1 |

Это metadata/fixture measurements, не замеры real Drive. Cold adoption/реальные changes всё ещё публикуют полный checkpoint per acknowledged effect; delta backend — S4 gate.

## Что пока не включено

- Полный proposal/artifact-unknown inbox с acknowledge/decline/rebind/publish-new/detach actions. Canonical inbox и ограниченный same-ID restore реализованы. Artifact issues уже durable по ID, но edited artifacts не публикуются обратно; old unmarked copies автоматически не импортируются. Старый name-only фильтр сохранён для pull/legacy copies; новый receiver допускает только проверенные artifacts.
- Полный canonical 404 resolution: есть read-only probe/retained blocker, но publish-new/rebind/detach требуют ownership receipts. Tombstones реализованы для новых tracked deletions; уже стёртые до upgrade baselines не восстанавливаются из имени. Compact retention/event backend — S4.
- ID anchors/object-specific exclusions в saved policy. Duplicate rows можно осмотреть, но path-only binding для них disabled; произвольный ID не выбирается.
- Post-policy collision isolation и independent per-job execution. Combined inventory failure по-прежнему останавливает writes выбранного общего запуска; broad collisions ещё не обходятся через exclusions.
- Pair-specific namespace reconcile, settings writer fence, shared symbolic authority и verified per-job migration.
- Pin-aware GC и cleanup retired manifest namespaces. Zero warm writes не означают, что исторические `sync-operations-v3-*`/`.previous` уже безопасно очищены.
- Полное startup-cycle/status/finishing решение, Changes, rename identity, empty-directory sync, streaming и existing-ID content CAS.

Существующие Drive IDs, guarded tracked trash, старые профили и mandatory local recovery сохраняются. Existing-ID overwrite не включён. Точный исходный collision пользователя не подтверждён API данными; покрыты plugin-file path и repeated-page воспроизведения.

## Следующий участок

S1 authority compiler и S2 independent jobs, с общим ledger и serial apply. Persistent runners/раздельные stores требуют передачи routing и recovery reservations. Proposal acknowledge/retention и versioned publication edited peer artifacts — отдельные actions; существующие копии не перезаписываются автоматически. Advanced-legacy-after-backup требует verified reconciliation до activation, не blind backup overwrite.

## Верификация

`npm run verify`: **490/490** тестов, TypeScript, styles и production build прошли. S0b добавил 38 cases к 415; S0c — ещё 37, включая реальные policy/routing/host seams с fake Drive и два vaults. Проверены `git diff --check`, relative links и BUILD_TAG/MIT notice в bundle. 25 architectural probes повторены; S0c snapshot опубликован отдельно, прежние snapshots сохранены. Это не live Google/Obsidian acceptance A80–A87. Отрицательные результаты по ещё не включённым contracts остаются видимыми.
