# Аудит desktop ZIP HTTP resume — 2026-10-17

Ограниченный этап B43/R11.7 после ZIP lifecycle. Перед изменениями проверены downloader и отдельный diagnostic range path. Полный B43 и W1–W4 не закрыты.

## Реальное состояние до изменений

Downloader дописывал любой 206 к существующему tmp: не отправлял If-Range, не сверял диапазон, total и ETag. Fresh download принимал произвольный 2xx. Уведомление request.error могло завершить попытку до закрытия файлового потока; out.finish считался достаточным. При синхронном исключении get оставался header timer с обращением к ещё не инициализированному req. Реальный mid-body abort давал нетипизированную ошибку и часто вообще не повторялся.

Отдельное воспроизведение HTTP-22 с управляемым ECONNRESET подтвердило выдачу reader со смещённым диапазоном: baseline провалился с `Missing expected rejection`, хотя Content-Length совпадал. Большинство loopback resume проверок baseline останавливались раньше на неверной классификации body abort; их нельзя выдавать за независимое воспроизведение каждой ошибки append.

## Изменения

Resume разрешён только при strong ETag + известной длине + том же URL; отправляются If-Range и Accept-Encoding: identity. 206 проходит строгую проверку offset/end/total/ETag/length до append. Без validator происходит restart; ответ 200 на resume обнуляет partial file. Redirect всегда restart без передачи validator. Неожиданные 2xx и encoded representation отклоняются.

Pipeline удерживает ownership файла до close на успехе и ошибке. Abort/request error/timeout не открывают следующую попытку поверх старой записи. Setup throw снимает таймер. Retry больше не выводится из message: используются HTTP status и Node code. Подробный контракт и совместимость серверов: [уточнение 16](../../overhaul-vnext2/16-archive-http-resume.md).

## Доказательства и воспроизведение

Окончательный fixture: `tests/archive-resume.test.ts`; registry: `scripts/archive-resume-cases.json`.

- Baseline `ff70d14ba44d31ccf7b1b5220cb66b0bca6900c8`: **20 fail / 2 pass**, complete=true.
- Candidate: **22/22 pass**, complete=true.
- Полная проверка: **666/666**, TypeScript, styles, production build.
- 19 случаев используют настоящий loopback HTTP; остальные проверяют setup timer, классификацию ошибки или контролируемый reset через injected transport. Никаких live credentials/remote providers.
- Проверены close предыдущего stream перед новым, close всех streams до rejection и удаление normal tmp после исчерпания attempts. Это не тест failed unlink или crash recovery.
- Baseline replay подменяет только `archive-downloader.ts`; fixture и остальная кодовая база текущие. Не является полной сборкой старого commit.
- Runner проверяет точный набор cases/TAP summary, отсутствие skipped/cancelled/todo, имеет watchdog и output cap. Сохранены source/fixture/TAP hashes. В опубликованных TAP удалены trailing spaces; hash пересчитан и normalization указана в JSON.
- В ходе подготовки исправлены optional dispose в тестовом helper и утечка baseline timer из отдельного classification fixture; окончательные результаты сняты с одинаковым исправленным fixture. Первичные прогоны не подменяют final evidence.

```sh
node scripts/audit-archive-resume.mjs /tmp/archive-after.json
# Baseline replay требует локальной Git history предыдущего этапа:
node scripts/audit-archive-resume.mjs /tmp/archive-before.json ff70d14ba44d31ccf7b1b5220cb66b0bca6900c8
npm run verify
```

Build tag: `overhaul-vnext2-archive-resume-2026-10-17`. Commit/bundle hash — в ARCHIVE-INFO итогового source ZIP. История исходного проекта отсутствовала в upload: baseline Git создан локально из исходного ZIP.

## Следующий последовательный check

Diagnostic `RemoteRangeReader` пока доверяет status/body length без проверки позиции, total и validator; `NodeZipRangeTransport.drainBody` не ограничивает буфер при проигнорированном Range. Следующий этап — сначала воспроизведения этих расхождений, затем единый контракт diagnostic ranges и bounded fallback.

Открыты также durable receipt после restart, общий RetryBudget/Retry-After, account limits, transfer deadlines, disk budgets и failed-cleanup accounting: существующие unlink catch подавляют ошибки удаления, отличные от ENOENT. Live ZIP/CDN/Obsidian и mobile buffered path не проверены. Existing-ID Drive overwrite gate, VAM и concurrency файловых effects этим этапом не менялись.
