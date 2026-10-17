# 14. Уточнения доказательств и provider observation

Дата: 2026-10-17. Дополнение к R11.1/R11.7/R13.1. Это критерии реализации, не утверждение о пройденной приёмке. Основание: аудит `safety-2026-10-17` и повторное чтение production-кода.

## R13.1a — Полнота доказательства

Exit 0 необходим, но недостаточен. Runner обязан дождаться завершения заявленного набора, записать parseable result artifact и проверить точное множество уникальных scenario IDs, terminal status каждого, отсутствие неожиданных пропусков и pending promises. Timeout, missing artifact, отсутствующий scenario или premature exit — runner failure/incomplete, никогда pass. Watchdog должен удерживать процесс до settlement; устаревший artifact не принимается как новый результат. Parent проверяет artifact независимо от кода возврата child.

Разделять regression (red-before/green-after), positive assurance, static finding и live acceptance. Исторический JSON сохраняется неизменным. Применимость старого runner к новой внутренней API требует отдельной проверки: адаптация fixture не должна подменять production behavior. Для отчёта без git history указывать hash загруженного source artifact; локальный baseline commit явно synthetic.

## R11.7a — Ограниченный обход дерева Яндекса

1. Бюджет observation включает root, папки и файлы; отдельный счётчик observations включает повторные строки. Лимиты проверяются **до** добавления в очередь/индекс. Одного ограничения числа файлов недостаточно для directory-only tree. Provider не может выделить безграничную очередь перед проверкой budget.
2. Defaults из vNext-2: максимум 100000 unique nodes / 200000 observed nodes. Дополнительный существующий provider ceiling — 10000 папок включая root. Более строгий предел допустим и явно сообщается. Overrides валидируются как положительные safe integers; это provider boundary, не claim завершённого общего ConfigDefaults/UI registry.
3. Одинаковый provider path, встреченный повторно в данном traversal, не выбирается произвольным winner. Для текущего array-only adapter повтор/цикл заканчивает observation typed `inventory-unstable`, без успешного частичного manifest. Нельзя просто `continue` и считать coverage полной. Будущий coverage adapter может представить partial/unstable явно по R11.1.
4. Проверяются конечный целый total, согласованность total между страницами, page size (непоследняя страница должна быть полной при offset += requested limit), отсутствие превышения total и пустой страницы до его достижения. Если provider прислал offset/limit, они должны совпасть с запросом. Исчерпание budget — `inventory-limit`, не empty manifest. Cancellation проверяется во время CPU traversal, до следующего запроса и перед публикацией.
5. Карта local path → provider path строится локально и публикуется только после полного успешного traversal. При новой попытке старые download href и предыдущий manifest перестают быть authority; после отказа новая частичная карта недоступна fetch. Запрет на fetch без актуального manifest явный. Повторная observation после ошибки начинает новый bounded traversal.
6. Один экземпляр adapter поддерживает одну observation одновременно. Конкурирующий getManifest отвергается явной typed ошибкой без инвалидирования первой попытки. Это консервативный transitional contract, не заявленная поддержка concurrent ProviderRuns.
7. Отзыв root и ошибка вложенной папки различаются кодом; HTTP status сохраняется. Недоступная nested папка не доказывает, что root public link недействителен. Ни одна из ошибок не разрешает absence-based deletion.

Эта slice не закрывает остальные части B44: identity-preserving обновление expired href, полный ProviderRun/epoch при изменении connection, cancellation неотменяемого физического transport и live Яндекс acceptance остаются отдельными gates. Общий observation deadline у JobBatch не заменяет внутренний bound adapter.

## Системная критика текущего плана

- В таблице волн область W2 пересекается с foundation W3. Реализовывать вертикальные slices по графу зависимостей; не включать parallel effects, пока leases не доказаны. Текущая serial apply остаётся допустимым промежуточным состоянием.
- Nine outcomes нельзя внедрять простой заменой enum: прежде нужны request/run/cycle identity, settlement receipts, journal compatibility, scheduler и UI projection. Иначе новое имя `accounting-required` маскирует старую потерю accounting.
- B13/B61/B44 — группы контрактов, а не один тест. Статус фиксируется по конкретному подслучаю и уровню U/H/F/L; «частично покрыто» не означает закрытую строку приёмки.
- Изменение path/conflict grammar расширяет участие файлов. Требуются migration preview/provenance; blanket regex cleanup не безопасный refactoring.
- Resource defaults — пределы политики, не доказательство реального memory accounting. Сначала instrumented allocation/physical orphan tests, затем настройка цифр.

Основные инварианты (сохранность оригиналов, mandatory VAM, closed existing-ID overwrite, no guessed deletion, no unverified migration) сохраняются.
