# ZIP lifecycle: следующий этап overhaul

Дата: 2026-10-17. Baseline — локальный commit `f082f45ac877aaaa9de2ab6c9d8de5b271abd71f` (Yandex observation stage). W1–W4 не закрыты.

## Проверенный факт → изменение

В ensureSession не было pending acquisition: два cold fetch скачивали два архива и перезаписывали общий reader. forceDispose обнулял опубликованные поля, но не учитывал pending download; позднее завершение вновь публиковало reader. URL не сверялся с cached snapshot; fetch проверял размер результата, но не CRC requested manifest. Исключение classify/read оставляло downloaded reader без cleanup. ForceDispose мог закрыть reader во время extraction.

Исправлено:
- Один shared opener на URL/generation; отдельные waiters и cancellation/deadline. Отмена одного не ломает остальных.
- Cancelled physical opener удерживается до settlement; новый запрос не создаёт неограниченные replacements. Default waiter elapsed deadline 30 min, test override 5 ms.
- Busy outcome для concurrent manifest и blocked cleanup; новый manifest не использует TTL как freshness proof.
- Generation/URL checks до публикации, после extraction и в микротасковом окне до физического открытия.
- Проверка CRC32/size/hashAlg против requested entry; одинаковый размер не считается одинаковой версией.
- Per-reader leases: invalidation сразу, физический cleanup после последнего читателя. Cleanup сериализован; failed cleanup остаётся accounted и повторяется explicit dispose.
- Ошибки классификации/central-directory parsing закрывают непубликованный reader. Late progress старого opener не обновляет новый observer.

Уточнение целевого контракта: [документ 15](../../overhaul-vnext2/15-zip-session-lifecycle.md).

## Доказательства

Окончательные fixtures: `tests/zip-lifecycle.test.ts`, registry 16 case IDs в `scripts/zip-lifecycle-cases.json`.

- Baseline provider с тем же окончательным fixture: **14 fail / 2 pass**, complete=true. Positive cases — retry failed opening и concurrent forceDispose cleanup; они не обязаны падать до изменения.
- Candidate provider: **16/16 pass**, complete=true.
- Полный verify: **644/644**, TypeScript, styles, production build.
- Первоначальная версия test reader ошибочно вызывала отсутствующий `BufferArchiveReader.dispose`; fixture исправлен до финальных доказательств. Финальный baseline replay повторён с исправленным fixture; ошибочные ранние результаты не считаются evidence.
- Regression timeout fixture имеет собственный fallback release, поэтому старый код даёт завершённый assertion fail, а не вечный pending/ложный green.
- Runner проверяет точный набор case IDs, TAP plan/counts/status и отсутствие skipped/cancelled/todo; использует валидатор предыдущего этапа и referenced watchdog.

Воспроизведение:

```sh
node scripts/audit-zip-lifecycle.mjs /tmp/zip-current.json
# При наличии локальной истории предыдущего этапа:
node scripts/audit-zip-lifecycle.mjs /tmp/zip-before.json f082f45ac877aaaa9de2ab6c9d8de5b271abd71f
npm run verify
```

Baseline mode подменяет только production `zip-url-source.ts`, остальные core/harness текущие. Это targeted component regression, не полная сборка старого commit. Сохранены provider/fixture/TAP hashes. В поставляемых TAP удаляются trailing spaces, hash пересчитывается с явной отметкой normalization в JSON. Upstream history не содержалась в исходном ZIP.

Build tag: `overhaul-vnext2-zip-lifecycle-2026-10-17`. Bundle hash и commit помещены в ARCHIVE-INFO итогового source archive.

## Ограничения и следующий check

B43 покрыт частично. HTTP Range/If-Range/validator/resume не изменялись и требуют отдельного аудита downloader. CRC32 не равен cryptographic identity. Host reader.read/dispose, игнорирующий завершение, может удерживать ресурсы: гарантируется отсутствие преждевременной выдачи/закрытия и замещающих загрузок, не физическая остановка или timeout всех cleanup calls. Это открытая часть R11.3.

Shared opener может хранить reader до explicit dispose/TTL, как и раньше. Cross-process resource limits, persisted snapshot identity, полный ProviderRun и изменение connection credentials без смены URL этим этапом не реализованы. Live ZIP providers/Obsidian не проверены. Mandatory VAM, existing-ID Drive gate, storage schemas и параллелизм файловых effects не изменялись.

Следующий последовательный check — actual HTTP Range/Content-Range и validator handling в ZIP downloader, затем отдельные fixtures changed-resource/restart/truncated-range. Не открывать широкую concurrency или existing-ID writes на основании этих тестов.
