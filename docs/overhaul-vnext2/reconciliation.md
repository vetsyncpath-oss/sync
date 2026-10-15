# Сопоставление четырёх новых документов

Дата: 2026-10-15. Baseline runtime `a5a4d16`. Это дополнение к [первому cross-audit](../audits/cross-audit-2026-10-15.md) и [сравнению Sync Engine](../audits/sync-engine-cross-comparison-2026-10-15.md), не переписывание их результатов.

## 1. Источники и доверие

| Обозначение | Документ | Использование |
|---|---|---|
| A | Загруженный `audit-report (3).md` | H-1…H-4, M-1…M-10 с M-4a/M-7a, L-1…L-12; анализ clone.zip, не идентичность полного distribution |
| X | `docs-vs-code-crosscheck.md` | D-1…D-15, матрицы по коду; автор явно не запускал fixtures |
| R | `audit-reconciliation.md` | Объединение E/V/S/A/X, приоритеты и предложения, а не независимые воспроизведения P1–P15 |
| P | `README (1).md` | Каркас vNext-2 и ссылки на отсутствующие 10–13; не полный комплект готовых specs |
| E/V/S | Предыдущие внешние/наши аудиты | 71 внешний finding + 2 positive assurance, 15 инструментированных probes, 5 Sync Engine comparisons; доступны в docs/audits |

Архив A содержит 153 файла, E описывал 140; полный выданный source ZIP — 191. Совпадение build tag не доказывает идентичность набора. В нашем checkout есть package/config/tests/scripts/licenses; manifest.json отсутствует. Нельзя объявлять все отсутствующие в clone.zip файлы отсутствующими в репозитории. 32 файла tests в ZIP — не «32 теста»; исторический suite имел 534 cases.

Утверждения attachments рассматриваются как evidence/proposals. Рекомендация «вернуть вызов», «включить overwrite» или «сделать VAM опциональным» не является пользовательским разрешением на такое изменение. Пользователь отдельно подтвердил обязательность VAM. Existing-ID gate и trash default сохранены.

## 2. Новые подтверждения и важные поправки

- H-4/D-14 подтверждены статически: у `migrateLegacyShas` есть definition/comments, нет call. Но body импортирует global lastSyncShas в текущий cache; вернуть вызов без verified Git provenance опасно. Требуется importer R12.4.
- N1: Wait...md/v1..2.md и literal `%2e%2e.md` отклоняются isPathSafe; `a?.md`, trailing dot/space допускаются. Пример аудита `a:b.md` **уже отклоняется** drive-letter regex; общий colon gap остаётся для имён, не похожих на drive prefix. Это не полный Windows validator.
- N2: config-only отклоняет `.custom/app.json`; runtime не получает configDir в PathPolicy. Не все 32 литерала `.obsidian` являются багом: часть — examples/defaults. Исправляется host contract, не blanket replace.
- N3: blockReason(a/b) знает reservation, blockReason(a//b) и blockReason(/a/b) нет. Это inconsistency компонента; полный exploit effect path не доказывается этим probe, потому что другие guards могут отвергнуть input.
- N4: `notes.conflict-resolution.md` исключается как conflict copy. Нужны provenance/exact grammar, не broad substring.
- N5: durable delete(useTrash=true) при adapter без trash вызывает remove и убирает original, **но сохраняет recovery blob**. Нарушение trash semantics подтверждено; безвозвратная потеря bytes этим probe не доказана. Current host normally supplies trash; defect остаётся на adapter boundary.
- M-3/D-15: MIME octet-stream в create подтверждён кодом. Конкретные последствия для previews/icon разных типов нужно проверять live; недопустимо объявлять любой preview обязательно сломанным.
- M-1: Git403 secondary Retry-After не учитывается текущими classifiers. `token` PAT не объявляется заведомо неработоспособным; современные headers — compatibility improvement, не доказанный auth outage.
- D-4: current JobOutcome содержит 6 значений, accounting-required отсутствует; это реальный контрактный пробел, независимо от того, как называется класс.
- A M-9: parseFile уже проверяет binary size/finite safe integer; native types фильтруются. Direct-call native NaN risk не доказательство штатной загрузки native документа. Redirect/live/rate-code coverage остаются отдельными gates.

## 3. A: disposition каждого пункта

| ID | Вердикт / поправка | Спецификация |
|---|---|---|
| H-1 | Dead root files не bundle; live softMode branch — убрать, но active 10-click backdoor не доказан | R13.2 |
| H-2 | Обязательный VAM — подтверждённое продуктовое решение, не дефект сам по себе; missing dependency UX/lifecycle требуют исправления | R13.2, R10.4–5 |
| H-3 | Для неполного clone.zip верно; для нашего полного source artifact неверно кроме manifest. MIT notice уже в main.js | R13.3 |
| H-4 | Definition без call подтверждена; automatic call предложенного body отвергнут без source attribution | R12.4 |
| M-1 | Secondary Git403 quota подтверждено кодом; auth scheme/header modernization без claim о неработоспособности PAT | R11.5, R11.7 |
| M-2 | Symlink blob/submodule не имеют явной capability; выбрать visible unsupported default, не следовать за symlink молча | R11.7 |
| M-3 | Octet-stream подтверждено; MIME mapping target, реальные preview эффекты отдельно | R11.4 |
| M-4 | Closed overwrite gate намеренный; misleading bidir UI и изменение local canonical — реальные UX/semantics пробелы | R10.7, R12.7–8 |
| M-4a | Backlog в основном верен, но «нет GC вообще» и «rename всегда delete+create» слишком сильны: guarded relocation может блокировать, compaction уже есть | R11.5, R12.4–7 |
| M-5 | N1 подтверждает false rejects/Windows gaps; a:b уже rejected; portability policy решает CON на non-Windows явно | R12.2 |
| M-6 | N2 подтверждает custom configDir defect; число литералов не число независимых багов | R12.2 |
| M-7 | N3/N4 подтверждают normalization inconsistency/false conflict-name exclusion; полный guard bypass не заявлен | R12.2 |
| M-7a | Hardcoded extensions есть; расширение участия требует explicit policy/migration, не снятия всех guards | R12.2 |
| M-8 | N5 воспроизведён; recovery сохранена, current host provides trash; silent fallback всё равно запрещён | R10.7 |
| M-9 | Составной риск: live redirects не проверены, binary parse size уже guarded, quota reasons/durable URLs/offset writes требуют контрактов | R11.3–5, R12.6 |
| M-10 | Full scopes intentional; revoke/local deletion/pool lifecycle требуют доработки; Desktop client_secret не refresh secret | R11.6 |
| L-1 | return/tsc style не доказывает runtime bug при boolean-or-void контракте; проверить фактические build options/command semantics | R13.3 |
| L-2 | Inline RU/EN локализация — долг поддержки; точное число 425 не пересчитывалось | R12.8 |
| L-3 | Accessibility labels нужны в активном UI; dead vault-tree references не считаются runtime path | R12.8, R13.3 |
| L-4 | Heartbeat до try — потенциальный cleanup gap; утечка требует throw fixture, не объявляется воспроизведённой | R10.9 |
| L-5 | files.find на activity — потенциальный UI cost, измерять на реальном active наборе; индексировать lookup | R12.8, R13.4 |
| L-6 | Unsafe raw node присутствует для browse; blocking entire manifest — gap isolation, а не доказательство unsafe write | R11.1, R12.2 |
| L-7 | Sequential BFS и repeated inspections подтверждены S probes; перенос общих запросов из донора ограничен scope | R11.2 |
| L-8 | exists() по контракту boolean; Error как успешное значение нарушает adapter contract, не самостоятельный штатный баг | R10.3, R11.1 |
| L-9 | setInterval сам по себе допустим при dispose; lifecycle test обязателен, отсутствие registerInterval не доказательство leak | R13.2 |
| L-10 | Console logs без verbose — hygiene/redaction; не всё техническое logging является privacy leak | R12.8, R13.3 |
| L-11 | HTTP Basic needs explicit policy; live insecure endpoint не тестировался. Default запрет, migration UX | R11.7 |
| L-12 | Положительное заключение по loopback/PKCE сохраняется; реальный browser/host acceptance отдельно | R11.6, B38 |

## 4. X: D-1…D-15 и ложные зелёные оценки

| ID | Итог | Spec / приёмка |
|---|---|---|
| D-1 | Совпадает с пилотной документацией, но опасный UX. Новая целевая семантика оставляет local primary до explicit decision | R10.7/B17 |
| D-2 | Три набора backoff действительно расходятся. Нужны step/cycle budgets, не просто выбрать одну константу | R10.8/B24–25 |
| D-3 | Regex classifier подтверждён предыдущим P7 | R10.3/B06–09 |
| D-4 | Missing accounting outcome подтверждён | R10.1–2, R10.6/B05/B12 |
| D-5 | Разные diagnostic names — schema compatibility; не переименовывать без reader mapping | R11.1/B30/B69 |
| D-6 | partial snapshot отсутствует; list throw не равен per-object unknown handling | R11.1/B29 |
| D-7 | configDir gap воспроизведён N2 | R12.2/B62 |
| D-8 | 256 current buffer vs 128 target подтверждён; memory ×4 и mobile capabilities учтены, не просто поменять число | R11.3/B36 |
| D-9 | empty secret≠delete/revoke, API capability version-dependent | R11.6/B40 |
| D-10 | 200 соответствует target; stale comment исправить, не уменьшать до 50 | R10.6/B69 |
| D-11 | Разные test counts — исторические stages; не доказательство фиктивных тестов. Full source package их содержит | R13.1/B67/B69 |
| D-12 | Mandatory VAM подтверждён пользователем; документировать и исправить lifecycle/hidden bypass, не делать optional | R13.2/B65–66 |
| D-13 | Builtin profiles есть, старый текст устарел; presence не доказывает все комбинации | R12.9/B16/B69 |
| D-14 | H-4 static confirmed; importer с provenance вместо прямого вызова | R12.4/B51 |
| D-15 | MIME mapping missing | R11.4/B37 |

Дополнительные поправки к зелёным клеткам X:
- S0/A01–A10 нельзя считать закрытыми: source-wide collisions и ManifestCache dictionary defect остаются.
- Наличие констант startup/retry не доказывает continuation: P3/P4/P14 обнаружили host contradictions.
- `JobManager` отсутствует как имя — не самостоятельное доказательство отсутствия контракта; P2/P6 доказывают конкретный общий admission/transfer lock.
- Наличие `.trash`/`.git` checks не закрывает host paths при custom configDir.
- «404 / неполный листинг → unknown ✅» смешивает object-level path и ошибку inventory до построения snapshot.
- Current OperationStore/DriveState compaction существует; target per-job delta backend отсутствует. Эти утверждения совместимы.
- Частичный raw browse/current picker improvements не равны единому immutable plan для всех entrypoints.

## 5. Изменения к предложению README и reconciliation

1. Каркас 10–13 принят; полный текст создан заново. Нумерация R10–R13, INV-13…17 сохранена; добавлены INV-18…20 и B01…B80 вместо обещанных, но не приложенных B01…B52.
2. Девять outcomes допустимы, но rejected/deferred admission не смешиваются с activity/effect certainty; accounting-required хранит underlying executionOutcome.
3. «Любое ожидание ограничено» не означает физическое прерывание request или release lease при timeout. Добавлены orphan limits и bounded admission.
4. Бюджет ≤5 не должен ограничивать количество успешных chunks/pages; добавлены explicit step IDs и durable shared retry accounting.
5. Автоматическое возвращение local canonical к remote при закрытом overwrite gate заменено явным решением; это отмечено в override table.
6. Перед broad parallel effects требуются atomic reservations из W3; throughput optimization observation можно реализовать раньше без weakening safety.
7. 128 MiB desktop staging выбран как прежний spec default, mobile 32 MiB и adapter-aware effective limits явно выделены; не требуется новая пользовательская развилка для reversible tuning defaults.
8. VAM decision закрыто пользователем: обязательный. Overwrite gate остаётся закрыт; Changes API — новая реализация, не заимствование.
9. Правило «каждая P-проба должна упасть до исправления» отвергнуто в общем виде: P12 опровергал баг и уже проходил, некоторые probes измеряют ограничения. Red→green только для настоящей regression assertion.
10. R states 71 E findings объединяются с предыдущим V disposition, не объявляются все подтверждёнными. Таблица traceability сохраняет deferred/latent/opposed conclusions.

## 6. Новые probes и пределы

[N1–N5 JSON](new-audit-evidence.json) и [runner](reproduce-new-audit.mjs) исполняют текущие PathPolicy/DurableMutations с repository fixtures; нет реального vault/Drive. Source baseline immutable. Запуск проверяет old observations, не исправляет их. Полный npm verify здесь не повторялся, поскольку runtime не менялся. Live redirects/Shared Drives/mobile/VAM-manager version compatibility остаются acceptance gates.
