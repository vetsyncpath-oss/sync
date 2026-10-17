# 16. ZIP: проверка HTTP resume перед дописыванием файла

Дата: 2026-10-17. Уточнение R11.7/B43, локальной части R10.3/R10.9. Целевой durable receipt из R11.3 этим этапом не заменяется.

## Проверенный переходный контракт desktop downloader

- Частичный tmp-файл сам по себе не доказывает право продолжения. В рамках одного download нужны сильный ETag, известная целая безопасная длина и тот же URL; offset должен быть меньше total. Weak ETag, Last-Modified без strong ETag и неизвестная длина означают полный restart.
- Resume отправляет Range и If-Range. Accept-Encoding: identity обязателен; encoded representation отклоняется до записи. Сжатие внутри самого ZIP не является Content-Encoding и поддерживается как прежде.
- Ответ 206 принимается только на фактический resume: Content-Range.start равен offset, total равен зафиксированному total, end равен total−1, сильный ETag совпадает. Если есть Content-Length, он равен длине диапазона. Числа должны быть safe integers. Отсутствующий, неизвестный или противоречивый range/validator даёт archive-response без append и публикации reader.
- Это консервативная политика: сервер, не повторяющий ETag в 206, или возвращающий короткий валидный сегмент вместо всего остатка, будет отклонён. Такова граница поддерживаемой реализации, а не утверждение о нарушении HTTP сервером.
- 200 в ответ на resume означает полный restart с truncation. Новые metadata становятся основой следующих попыток. Fresh download допускает только 200; unsolicited 206, 204 и Content-Range на 200 не считаются полным архивом.
- Redirect всегда сбрасывает offset; If-Range не переносится на следующий URL. Это сознательная потеря оптимизации в пользу проверяемого restart, включая одинаковую цепочку redirects при повторе.
- Stream pipeline владеет временным файлом до закрытия. Только после settlement допустимы stat, retry, удаление или выдача reader. Request error, body error, cancel и timeout проходят через этот путь. Успешное событие finish само по себе недостаточно.
- Sync throw при создании request снимает header timer. Retry классифицируется по HTTP status/Node code, не по словам в message; собственный archive-timeout не повторяется. Число попыток/backoff пока остаются локальными прежними defaults.

## Границы доказательства

Регрессии используют реальные loopback HTTP streams и отдельно управляемый transport reset. Проверены корректное продолжение, подмена диапазона/ETag, restart, обрывы, close перед retry, normal unlink, cancel и setup failure. Fixtures не доказывают live совместимость CDN/Obsidian.

Открыты: diagnostic RemoteRangeReader/NodeZipRangeTransport (позиция/validator/buffer cap), persisted resume receipts, общий RetryBudget/Retry-After, глобальные disk/resident limits и унификация elapsed/inactivity deadlines. Ошибки unlink, отличные от ENOENT, пока подавляются существующим TempFileArchiveReader/downloader; normal unlink test не закрывает failed-cleanup accounting. Mobile buffered path этим этапом не меняется. B43 и W1–W4 целиком не закрываются.
