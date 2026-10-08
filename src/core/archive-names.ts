// src/core/archive-names.ts — декодирование имён записей zip-архива
// (фаза 5, задача 5-ab; дизайн §7.4).
//
// Критично для русскоязычных пользователей: Windows-инструменты кодируют
// кириллические имена в CP866 БЕЗ UTF-флага (bit 11) — наивное UTF-8-чтение
// ломает такие имена. Декодированное имя — ключ кэша манифеста, поэтому
// правила детерминированы: один и тот же архив всегда даёт одни и те же
// ключи (инкрементальность, §7.4).
//
// Модуль ядра: НЕ импортирует obsidian/node и не имеет зависимостей —
// только TextDecoder (WHATWG Encoding Standard; метки 'utf-8' и 'ibm866'
// доступны и в Node ≥ 18 full-ICU, и в Electron/Obsidian на всех платформах).

/** Ленивые синглтоны декодеров: архив может содержать десятки тысяч
 *  записей (фикстура zip64 — 65540), создавать декодер на каждое имя
 *  расточительно. */
let lossyUtf8: TextDecoder | null = null;
let strictUtf8: TextDecoder | null = null;
let cp866: TextDecoder | null = null;

/**
 * Декодирование имени файла из zip-записи (дизайн §7.4).
 * Каскад: utf8Flag → UTF-8 (lossy); иначе строгий UTF-8 (fatal);
 * иначе CP866 (ibm866); иначе (теоретически недостижимо) UTF-8 lossy.
 */
export function decodeZipName(raw: Uint8Array, utf8Flag: boolean): string {
	// Ветка 1: явный флаг bit 11 — имя объявлено как UTF-8. Декодируем
	// lossy: битые байты → U+FFFD, БЕЗ исключения — повреждённое имя
	// лучше, чем упавший парсинг всего архива.
	if (utf8Flag) {
		if (lossyUtf8 === null) lossyUtf8 = new TextDecoder('utf-8');
		return lossyUtf8.decode(raw);
	}
	// Ветка 2: флага нет — пробуем СТРОГИЙ UTF-8 (fatal): ASCII-имена и
	// честные UTF-8-имена без флага (часть инструментов его не ставит)
	// проходят здесь.
	if (strictUtf8 === null) strictUtf8 = new TextDecoder('utf-8', { fatal: true });
	try {
		return strictUtf8.decode(raw);
	} catch {
		// не UTF-8 → следующая ветка каскада
	}
	// Ветка 3: CP866 ('ibm866' — стандартная метка WHATWG). Кодировка
	// DOS-инструментов Windows для кириллицы; отображает все 256 байт,
	// поэтому декодирование по байтам упасть не может.
	if (cp866 === null) cp866 = new TextDecoder('ibm866');
	try {
		return cp866.decode(raw);
	} catch {
		// Ветка 4: теоретически недостижимо (fatal-режим для ibm866
		// не включён; исключение возможно только на неподдерживаемой
		// метке в экзотической сборке рантайма). Фолбэк-lossy, чтобы
		// декодер имени НЕ бросал никогда.
	}
	if (lossyUtf8 === null) lossyUtf8 = new TextDecoder('utf-8');
	return lossyUtf8.decode(raw);
}
