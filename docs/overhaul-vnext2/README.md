# Overhaul vNext-2 — согласованная спецификация

Дата: 2026-10-15 (Europe/Moscow). Статус: **целевая спецификация для реализации; не отчёт о готовности**. Проверенный runtime baseline: `a5a4d16bb55976aaa6a88727396c9ca54cc9d680`. Последующие audit commits не меняли runtime. Сравнение Sync Engine: `a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9`.

Текущее состояние реализации: [первый этап W1 — результаты и отмена](implementation-w1-results.md).

## 1. Состав и порядок чтения

1. [Сопоставление новых аудитов](reconciliation.md): вердикты, ограничения доказательств, новые воспроизведения.
2. [10 — Результаты, ошибки, отмена, профили и повторы](10-run-results-and-error-model.md).
3. [11 — Drive observation, transfers, OAuth и остальные источники](11-drive-observation-and-transfer.md).
4. [12 — Единый plan, identity, persistence, GC и UI](12-unified-plan-identity-and-persistence.md).
5. [13 — Приёмка, волны реализации и выпуск](13-conformance-and-release.md).
6. [Трассировка аудитов и требований](traceability.md).
7. [Новые результаты probes](new-audit-evidence.json) и [runner](reproduce-new-audit.mjs).

Приложенный пользователем README ссылался на документы 10–13, но сами файлы не были приложены. Здесь они составлены заново; отсутствующему тексту не приписывается содержание. Прежние [01–09](../overhaul-vnext/README.md) сохраняются как базовые контракты там, где новые требования не уточняют или явно не заменяют их. Исторические аудиты и результаты тестов остаются неизменными.

## 2. Решения и границы

- **VAM обязателен для этой сборки** — прямо подтверждено пользователем 2026-10-15. Отсутствие/отзыв допуска не переводятся в optional mode. Скрытых bypass/softMode нет.
- Google Drive двусторонний, выбирается произвольный root по ID; профили pull сохраняются. Удаления по умолчанию только через корзину.
- Существующие canonical Drive IDs сохраняются. Existing-ID content overwrite остаётся закрыт до отдельного live/concurrency gate; спорные изменения — proposals/conflict copies.
- Из Sync Engine берутся адаптированные механизмы; last-wins duplicate, size-only equality, blind PATCH, 404-as-success и cache-only destructive execution не принимаются.
- Новые спецификации **не открывают** автоматически Google Docs export, shortcut traversal, writable WebDAV/API-key, Shared Drives или mobile OAuth. Их capability остаётся unsupported/experimental до отдельной приёмки; сохранение видимости в tree обязательно.
- Runtime W1–W4 и дополнительные capabilities проверяются отдельно. Отсутствующая capability не изображается работающей и не является молчаливым skip.

## 3. Новые и уточнённые инварианты

INV-01…INV-12 сохраняются. Дополняются:

| ID | Контракт |
|---|---|
| INV-13 | Каждый запрос запуска и каждое задание имеют явный результат; null/undefined не outcome. Отказ и отмена не success |
| INV-14 | Scope/effect certainty/retry определяются структурированно; текст не управляет effects; unknown удерживает зависимые targets |
| INV-15 | Snapshot observation отделён от fresh effect guard; no-op не требует полного повторного обхода предков на файл |
| INV-16 | Любое ожидание имеет deadline и outcome. Логический timeout физического запроса не доказывает его остановку и не освобождает target reservation |
| INV-17 | Pair lineage не меняется от чужого mapping, имени подключения, token, расписания или unrelated profile |
| INV-18 | Requested trash никогда молча не превращается в remove/hard-delete; исходное содержание защищено проверенным recovery до локального destructive effect |
| INV-19 | Plan, preview, retry, force, UI decision и recovery используют один authority/policy/effect protocol |
| INV-20 | Тестовый pass, наличие класса и зелёная сборка не доказывают сквозную capability или live compatibility |

## 4. Явные поправки к прежним документам

| Прежний контракт | Уточнение vNext-2 |
|---|---|
| 02 §7: семь outcomes | Девять outcomes плюс отдельные activity/admission/accounting поля, R10.1–R10.3 |
| 02 §4: ≤5 transport/mutation attempts на item | R10.8: ≤5 отправок одного повторяемого request step за cycle; нормальные страницы/чанки — разные steps. Per-intent replay ограничен отдельно; finishing/transport/scheduler не сбрасывают счётчики |
| Несогласованные queue backoff/comments | Одна таблица defaults и единый RetryBudget, R10.8; старые persisted attempts мигрируются, не обнуляются |
| 02 §7: serial apply | Во время перехода serial apply допустим, но не считается окончательным per-job runtime. R12.3: независимые transfers/effects, короткий общий ledger commit и reservations; широкий параллелизм только после lease tests |
| 03 §2/§7: partial browse целевой, текущий throw | R11.1: complete/partial/unstable + coverage; partial нельзя считать complete-empty. Positive execution разрешён только в доказанно complete независимой partition |
| 03 §5 и пилот: local edit→proposal→replace local canonical remote | R10.7: default при закрытом overwrite gate сохраняет локальную авторскую версию основной до решения. Возврат canonical к remote — отдельное явное решение с preview. Это **изменение целевого поведения**, не описание текущего кода |
| README: 128 MiB, код: 256 MiB | Default глобального resident staging budget 128 MiB desktop / 32 MiB mobile; 256 desktop только явная настройка; R11.3 учитывает все buffers и streaming fallback |
| 03 OAuth revoke/delete | R11.6 различает local disconnect, deletion capability и подтверждённый revoke; setSecret('') не доказательство удаления |
| 01 host paths / legacy literals | R12.2: host configDir/pluginDir/state/recovery; decode только в provider URI boundary |
| 04 retention/GC | R12.6 уточняет live pins, reader leases, retired namespace, orphan/quarantine, epoch barrier и crash recovery |
| VAM как неуточнённый governance | R13.2: обязательный, fail-closed, явный UX и жизненный цикл |
| A01–A87 | Не перенумеровываются; B01–B80 уточняет покрытие. Для A23 явно меняется oracle закрытого Drive-profile: новая version оставляет L primary, существующий job получает migration preview/ack до активации; остальные профили сохраняют прежние разрешённые effects. Наличие B не означает прохождение A |

## 5. Общие defaults

Значения — начальная спецификация, не измеренный оптимум. Код и UI обязаны читать один schema-versioned ConfigDefaults; docs проверяются против него в CI.

| Параметр | Default / предел |
|---|---|
| Startup delay | 30 s после layout ready; готовность VAM/account отдельно, trigger не теряется |
| Startup transient window | 30 min от первого transient failure; не ограничивает длительность первоначального полезного sync |
| Finishing | ≤2 дополнительные прохода, delay 5 s, один pending trigger/job |
| Automatic retry runs | ≤4 сверх initial на cycle; ранее исчерпанный request/intent budget не сбрасывается |
| Request retry | ≤5 sends одного step/cycle; full jitter base 5 s, cap 15 min, server hint имеет приоритет |
| Admission deadline | 60 s; по истечении explicit deferred/rejected, без неограниченного ожидания promise |
| Metadata request | 60 s, включая тело; physical host orphan учитывается отдельно |
| Transfer | 60 s без прогресса; общий elapsed deadline 30 min на попытку, configurable; resume по durable receipt |
| Observation | 10 min; partial/stale browse и отдельный continuation, не пустая папка |
| Cancel UI wait | 10 s; после UI timeout unresolved targets остаются fenced |
| OAuth | 5 min interactive; exchange/refresh/userinfo 60 s в общем auth budget, не независимые бесконечные ожидания |
| Jobs / network | 2 observation jobs; 4 active transfer tasks globally; 4 metadata requests globally; общий account request cap 4, регулируемый в пределах проверенных возможностей |
| Resident staging | Desktop 128 MiB, mobile 32 MiB; не равняется max payload size или disk staging |
| File limit | 64 MiB по умолчанию при проверенном streaming/spooling; buffered fallback дополнительно ограничен доступной памятью |
| Journal | 200 terminal run records globally; progress events не занимают строку на каждый chunk |
| Compaction | 1000 событий или 4 MiB delta, что раньше; latest+previous verified snapshots |
| Tombstone | 90 дней подробной истории; затем компактный lineage без права повторного bootstrap |
| Tree / operations UI | Window/page 150 / 100; virtualization для больших наборов; stable keys |
| Inventory | 100000 unique nodes / 200000 observations; bounds расширяются только явно, повторные IDs считаются |

Квоты Google не выводятся из этих внутренних лимитов: серверные account/project cooldown и capability могут дополнительно уменьшать допуск. Увеличение лимитов не меняет safety contract.

## 6. Готовность и поставка

Все R10–R13 — требования к реализации; их текущее состояние **target**, если нет отдельного воспроизведения конкретной реализованной части. W1–W4 закрываются по [13](13-conformance-and-release.md), а не по числу тестов или файлов. Полная воспроизводимость текущего package проверяется по исходному commit, dependency lockfile и bundle hash. Заявление «534/534» остаётся историческим результатом предыдущего этапа.
