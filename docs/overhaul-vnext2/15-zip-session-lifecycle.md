# 15. ZIP: открытие снимка, ожидание и освобождение reader

Дата: 2026-10-17. Уточнение R11.7/B43/R11.3. Дополняет lifecycle, не заменяет HTTP Range/validator contract.

## Контракт переходного adapter

- Один экземпляр держит максимум одну физически незавершённую операцию открытия. Одновременные fetch одного URL/поколения используют один download + central directory parse.
- `getManifest` запрашивает свежий снимок. Два одновременных manifest и manifest во время чтения/открытия дают explicit `observation-busy`; это не поддержка нескольких concurrent ProviderRuns.
- Отмена одного waiter не отменяет остальных. Отмена последнего, dispose или timeout последнего посылает shared abort; физическое завершение этим не считается доказанным.
- Пока отменённый physical opener не settled, новый caller получает busy, а не запускает новый downloader. Поздний reader закрывается и не публикуется.
- Каждый waiter имеет elapsed deadline открытия (default 30 min, configurable provider port). Это соответствует whole-archive transfer bound; не следует использовать metadata timeout 60 s для всего большого архива. Inactivity/transport admission deadlines остаются отдельными требованиями.
- URL и generation проверяются перед публикацией и возвращением bytes. `getManifest` должен быть защищён и в окне до начала физического download. URL сравнивается losslessly: изменение signed URL консервативно требует нового manifest; автоматического доказательства эквивалентности нет.
- Fetch проверяет size + CRC32 записи против requested manifest до распаковки. CRC32 — ZIP integrity/version hint, не криптографическое доказательство identity и не замена ETag/If-Range/source generation.
- ForceDispose немедленно отзывает snapshot, но не закрывает reader под активным чтением. Last reader lease выполняет cleanup; old bytes после invalidation не выдаются caller.
- Cleanup одного reader сериализован. При неуспешной очистке ссылка удерживается, новые открытия блокируются; явный dispose может повторить cleanup. Нельзя молча терять ownership temp resource при ошибке удаления.
- Progress callbacks старой generation/URL/aborted opener игнорируются. TTL — только retention ресурсов: новый manifest всё равно должен быть свежим.

## Границы приёмки

Singleflight и byte leases проверяются через реальные ZipUrlSource/readCentralDirectory/extractEntry с controlled downloader/reader, включая read failure, поздний return, waiter cancel, dispose, failed cleanup и retry. Полный B43 также требует Range 206/Content-Range/total/validator/If-Range и restart/resume acceptance; эти проверки нельзя заменить успешным ZIP lifecycle тестом.

Глобальные account/resource limits и физические зависания host reader.read/dispose — отдельные R11.3 gates. Deadline waiter не доказывает bounded host cleanup. Полная модель ProviderRun с persisted snapshot identity и immutable settings ещё открыта.
