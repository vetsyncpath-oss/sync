# UI, профили и Drive: проверка реализации и изменения

Дата: 2026-10-17. Проверено против vNext-2 R10.7, R11, R12 и UI-spec. Это состояние текущего overhaul, не заявление о полном завершении всех W1–W4.

## Проверено в коде до изменений

| Область | Реальное состояние |
|---|---|
| UI workspace | Уже реализованы локальное дерево без сети, drafts, назначения из дерева, scope presets, отдельные jobs/cards, preview/recovery, opaque keys raw Drive browse, ID diagnostics и paginated operation table. Проверки: profile-ui, ui-overhaul, pipeline-ui, drive-lifecycle-ui, job-runtime |
| Профили | Уже есть preserve/create/update/changes/remote и OAuth Drive bidirectional, sparse assignments, precedence, exact basename selectors, защита preserve, inherited source bindings и validation. Один дефект: глобальный incoming перехватывал remote/full и мог оставить локальную версию вместо enforce-source |
| Drive | Уже есть PKCE desktop OAuth, guarded root, ID browse, bounded inventory, strong checksum checks, reserved upload IDs/resume receipts, proposals/peer copies, unknown lifecycle, tombstones, recovery и per-source dispatch. Existing-ID overwrite закрыт |
| R10.7 proposal semantics | Не реализована новая целевая семантика: publication автоматически заменяла local primary на remote. Bootstrap divergence также принимал remote автоматически, а delete/edit удалял survivor после копирования |
| Proposal UI | История показывала unknown/tombstone, но не самостоятельные proposals, если у них не было inbox entry. Поэтому сохранённое предложение не имело собственного ряда |
| Полный target architecture | Persistent JobManager/AccountContext, весь unified compiler/plan и settings migration, ID-specific assignments/collision isolation, полный proposal decision inbox, Changes API, общий account/memory budget и live gates остаются отдельными незавершёнными требованиями |

## Исправлено

1. Pull remote/full теперь имеет приоритет над global incoming. EffectiveBehavior и ConflictResolver согласованы; локальная версия сохраняется в recovery/copy перед replacement. End-to-end тест проверяет фактические bytes через Coordinator.
2. Обычный Drive conflict/gated edit публикует предложение и сохраняет исходные canonical L/R. Прежний applied baseline не подменяется; при bootstrap divergence baseline не придумывается. Результат pending/needs-attention, downloaded не увеличивается за публикацию.
3. Delete/edit сохраняет survivor и обе проверенные копии, но не удаляет survivor автоматически. Confirmed unchanged tracked deletion по-прежнему использует trash и tombstone.
4. Proposal-only lineage теперь участвует в проверке исходного ID и защите от download по новому имени после rename. Удалённый/перемещённый объект не превращается в bootstrap по имени.
5. Manual Ask применяется и к gated local edit. Согласие на remote привязано к exact local version, remote ID/version и path. Оно существует только в текущем вызове; restart не оживляет старое согласие. Повторные checks/recovery/CAS сохраняются. После явного принятия конкретное предложение больше не требует решения, копия не удаляется.
6. История Drive показывает proposal-only rows с origin/copy IDs, путём local copy и pending semantics. Существующий лимит страницы 100 распространяется на предложения. Search включает copy path/ID; DOM вставляет строки как текст. Открытие/закрытие истории не принимает proposal и не запускает effects.
7. Profile editor объясняет proposals, сохранение local primary и закрытый existing-ID overwrite. Для выбора remote используется существующий ручной Ask; прямые acknowledge/decline/rebind/publish-new/detach из истории ещё не реализованы.

Изменение tests старого поведения намеренно: ожидания automatic replacement/trash заменены на новый R10.7. Тесты conditional replacement теперь вызывают явный Ask, сохраняя проверки CAS, отказа и восстановления. Исторические audit snapshots не перезаписаны.

## Доказательства

- На окончательных одинаковых fixtures: baseline `a36316336ff31d377583d5cc4f9ab39a6234f972` — **102 pass / 19 fail**, complete=true; candidate — **121/121 pass**, complete=true.
- Baseline replay подменяет шесть изменённых production components; остальные модули и fixtures текущие. Это component regression, не полная сборка старого commit.
- Полный `npm run verify`: **677/677**, TypeScript, styles, production build; без skipped/cancelled/todo.
- Новый coverage: bootstrap/gated edits, оба delete/edit направления, restart, dedup, потерянный upload response, legacy pending migration, rename при proposal-only lineage, exact manual consent, UI text safety и отсутствие implicit actions.
- Проверки используют actual coordinator/host dispatch с fake Drive/FS/DOM. Live Google/настоящий Obsidian, визуальная доступность и мобильный host не проверялись. Нельзя выводить live готовность из этих результатов.

```sh
node scripts/audit-ui-profiles-drive.mjs /tmp/current.json
node scripts/audit-ui-profiles-drive.mjs /tmp/before.json a36316336ff31d377583d5cc4f9ab39a6234f972
npm run verify
```

Registry фиксирует 121 case IDs. Runner проверяет TAP plan/counts/status, имеет watchdog/output limit и hashes шести компонентов/fixtures. Для сохранённых TAP trailing spaces удалены, hash пересчитан с явной normalization в JSON.

## Состав общего pull request

GitHub main проверен на `64c70e249b03bcd66439007528376d94594a7493`, tree `00ca99e866e3ea387c6e6bf3c64e111890ebfa94`. Дерево полностью реконструировано и сверено по Git tree SHA, включая 24 файла, отличавшихся от исходного ZIP. Main содержит более ранний этап. PR строится поверх этого main и включает полный текущий tracked source snapshot: W1 из upload, safety, Yandex observation/evidence, ZIP lifecycle, ZIP HTTP resume, настоящий UI/profile/Drive этап, тесты и спецификации. Существующий GitHub workflow сохранён. Открытый PR #7 (W1, base overhaul/s0-drive-id-browse) не изменяется; этот cumulative PR включает его функциональный этап и последующие fixes.

`main.js`, node_modules и временные файлы не включаются: CI собирает bundle из закреплённых зависимостей. В исходном проекте нет manifest.json; его ID/minimum Obsidian version не выдумываются. PR — исходники для review, не готовый установочный ZIP. BUILD_TAG: `overhaul-vnext2-ui-profiles-drive-2026-10-17`.

## Остающиеся gates

Полный W1–W4, existing-ID Drive overwrite, advanced proposal actions, durable settings migration, mixed-profile unified plan, quotas/resources, Changes, live OAuth/Drive/Obsidian acceptance не закрыты. Предыдущий следующий ZIP check (diagnostic RangeReader и bounded buffer) отложен по запросу пользователя проверить UI/Drive; HTTP downloader resume исправлен, diagnostic reader ещё требует работы. VAM и существующие ограничения capabilities сохранены.

Проверенный production bundle SHA-256: `e6bd6724202787ea88d4602c81c0737bc705b432226311142224408bf53b01bc`.
