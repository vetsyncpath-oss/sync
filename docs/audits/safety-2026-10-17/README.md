# Аудит и ограниченный этап overhaul — 2026-10-17

## Результат и границы

Проверен загруженный `sync-overhaul-43b00ea.zip`. Выполнен ограниченный этап исправлений трёх подтверждённых дефектов. Это не завершение W1–W4 и не полный security-аудит всех модулей. Новые требования не объявляются реализованными по наличию класса или зелёной сборке.

Документы архива рассматриваются как спецификации и исторические свидетельства, а не отдельные команды пользователя. Упоминание прежнего согласования VAM в документах не является новым согласием в этой беседе; существующее поведение VAM и закрытый existing-ID overwrite gate сохранены. Live-вызовов Google Drive, доступа к пользовательскому vault, публикации и удалённых записей не было.

Исходный ZIP SHA-256: `8522653c8c4248af6de09bc805db265ec58145efa49f7bee1dc902d38ec8b851`.
Локальный baseline commit: `b691e56ab62ccc6e6e195b637ba07aa96ae59478` — создан из архива для diff, НЕ upstream commit. История upstream в ZIP отсутствует, суффикс имени архива не доказывает её содержимое.
Node 24.19.0 / npm 11.9.0. Lockfile сохранён. Установка `npm ci --ignore-scripts`, затем повторная установка из заполненного локального кэша. Полный verify запускается с разрешением сетевых операций для локальных HTTP fixtures; внешние provider credentials не использовались.

## Check → изменение → проверка

| Находка | Факт до изменения | Исправление | Доказательство и предел |
|---|---|---|---|
| Высокая: N5 / B19 / INV-18 | `DurableMutations.delete(..., true)` при отсутствии trash вызывает remove. То же в fallback Coordinator без журнала. Recovery bytes остаются, поэтому это не доказательство безвозвратной потери bytes | Проверка capability до intent/копирования; typed `trash-unavailable`; no fallback. Существующая корзина вызывается с правильным receiver. Отсутствующий файл не требует capability | Тест прямого вызова и оба пути Coordinator. Оригинал/кэш сохранены, deleted=0, failure явный. Проверены recovery до trash, ошибка trash, explicit remove, missing target. B19 подтверждён на component/Coordinator fake ports; настоящий Obsidian не проверен |
| Средняя: P8 / B13 / R10.6 | Внутренний `{}` возвращает унаследованные свойства как записи; setter/snapshot теряет `__proto__`, в том числе после чтения валидного JSON | Null-prototype внутренний словарь при создании/load/reset/restore; snapshot сохраняет обычный Object prototype, но создаёт own properties без вызова setter | Fresh/load/reset, set/get/snapshot isolation, flush/reopen, delete, backup/restore и исторический JSON. Это исправление ManifestCache, не аудит всех dictionary/import/merge во всём приложении; B13 целиком не закрыт |
| Средняя: N3 / часть B61 / R12.2 | blockReason(a/b) видит reservation, a//b и /a/b — нет; policy нормализует эти пути иначе | Один blockKey для построения индекса и lookup: trim, существующая normalization, NFC/casefold; ancestor/descendant используют тот же ключ | Проверки separator/case/leading slash/backslash aliases, snapshot, нормализованные declarations и независимые siblings. Это защитная проверка aliases, не разрешение unsafe raw paths. Не доказан end-to-end exploit исходного дефекта; полный PhysicalTargetKey protocol ещё не внедрён |

Build tag: `overhaul-vnext2-safety-audit-2026-10-17`.

## Проверки

- Исходный `npm run verify`: **575/575**, TypeScript, styles, production build.
- Новые 14 тестов на исходном runtime: **11 fail / 3 pass**. Все 11 падений — ожидаемые assertions поведения; три pass — positive assurance, они не обязаны быть red-before.
- После исправлений: **14/14** targeted tests.
- Итоговый `npm run verify`: **589/589**, TypeScript, styles, production build.
- `git diff --check`: чисто.
- При первом candidate verify TypeScript обнаружил `Object.hasOwn` в новых тестах: lib проекта ES2021. Тесты переведены на `Object.prototype.hasOwnProperty.call`, target проекта не повышался. Итоговый лог отражает успешный повтор.
- Bundle `main.js` SHA-256: `ba24bb2c9e2842394a567d474f7579e8709d820363904b3b42fc8a0ddaaf32ea`.

Воспроизведение targeted:

```sh
node --input-type=module - <<'JS'
import {build} from 'esbuild';
await build({entryPoints:['tests/audit-safety.test.ts'],outfile:'/tmp/sync-audit-safety.cjs',bundle:true,platform:'node',format:'cjs',target:'node18'});
JS
node /tmp/sync-audit-safety.cjs
npm run verify
```

Red-before лог получен с исходной версией тестов, использующей Object.hasOwn в двух assertions; замена на ES2021-эквивалент не меняет oracle. Прямой запуск bundled node:test использован после отдельного `node --test` запуска без полезной диагностики в sandbox.

## Сверка прежних заявлений

- Исторические N1–N5 повторены до исправлений: `baseline-N.json`. N1 (overbroad `..` и неполная portability validation), N2 (hardcoded .obsidian), N4 (broad conflict-name) остаются открытыми. N3/N5 исправлены в указанном scope.
- Заявленные 575 тестов предыдущего этапа воспроизведены. Числа 534/546/557 в старых отчётах относятся к предыдущим версиям, не являются текущей готовностью.
- `migrateLegacyShas` по-прежнему только definition/comments, вызова нет. Возвращать его вызов без Git provenance нельзя; это подтверждает открытый R12.4, а не повод к механическому включению.
- `SendBudget`/upload sendAttempts присутствуют. Это не единый durable registry cycle/job/pair/intent/step и не доказательство scheduler-wide R10.8.
- Старый `reproduce-cross-audit-2026-10-15.mjs` в этом запуске вернул exit 0 после части работы, но **не создал results.json**. Лог сохранён. Этот запуск имеет статус **incomplete**, а не pass; причины завершения runner отдельно не локализованы. Его исторические P1–P15 не объявляются заново подтверждёнными данным запуском.
- Сравнение с Sync Engine не запускалось: donor checkout отсутствует. Старые сравнительные цифры не являются измерениями текущего candidate.

## Приоритеты продолжения

| Очередь | Подтверждённое состояние / работа | Gate перед реализацией |
|---|---|---|
| 1 — W1 результаты | Частичные session results и pending journal уже есть; девять outcomes, effect certainty, receipt→run reconstruction не завершены | Production-seam tests: effect→crash→restart без повторного эффекта; отдельные admission/execution/accounting outcomes; не менять формат одним enum |
| 2 — W1 budgets/lifecycle | Persisted upload step budgets есть; общего cycle registry нет | Continuation/restart/401/finishing должны использовать один budget; сохранить старые attempts, unknown не повторять вслепую |
| 3 — W2 provider lifecycle | Статически `YandexSource.getManifest` создаёт visited, но не добавляет пути; directory-only cycle не ограничен этим set. ZIP ensureSession не имеет singleflight вокруг await download | Отдельно воспроизвести bounded cyclic-directory fixture и concurrent ZIP acquire/config change; reject неполной inventory, cleanup loser resources |
| 4 — W3 пути и identity | N1/N2/N4 открыты; исправлена только проверка reservations. Изменение грамматики conflict-копий может включить исторические copies в sync | Raw/provider boundary, custom configDir hard guards, collision projection, migration preview/provenance до расширения участия |
| 5 — W2 performance/resources | В Coordinator остаётся default 256 MiB; спецификация требует 128 desktop / 32 mobile и общий accounting buffers | Сначала измерение resident allocations, adapter capabilities и gates; замена числа сама по себе не доказывает budget |
| 6 — W3/W4 | Единый plan/leases/GC/cutover/release ещё не закрыты предыдущими документами или этими тестами | Concurrent reservation/crash tests до расширения parallelism; pin-aware GC; install manifest только после host acceptance |

Широкий overhaul остаётся многоэтапной работой. Этот patch не меняет format version хранилищ и не выполняет автоматической миграции участия файлов. Нельзя восстанавливать уже потерянный `__proto__` из отсутствующих данных: исправление предотвращает дальнейшую потерю и сохраняет записи из валидных существующих JSON.

## Поставка

Исходный архив включает код, тесты, документацию и доказательства этого этапа; node_modules/.git не включаются. Отдельный patch применяется к исходному ZIP. Это **source artifact**, не install ZIP: manifest.json в исходнике отсутствует, минимальная версия Obsidian не проверена. Production bundle проверен и хеширован, но этим не доказана установка или live compatibility.
