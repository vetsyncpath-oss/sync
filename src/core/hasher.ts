// src/core/hasher.ts — контрольные суммы содержимого файлов (фаза 3-2).
// Модуль ядра: НЕ импортирует obsidian/node — только WebCrypto
// (globalThis.crypto, доступен в Node >= 18 и в Electron/Obsidian)
// и собственную таблицу CRC32 (решение В5-1, design §3.2).
//
// АУДИТ Б-06: прежний «вероятностный» SHA-кэш (ключ = размер +
// первые/последние 64 байта) давал ложные «Up to date» и пропускал
// реальные обновления. Кэш уничтожен и ЗДЕСЬ НЕ ВОССОЗДАЁТСЯ:
// каждая контрольная сумма считается честно по полным данным.

/** Таблица CRC32 (256 записей), полином 0xEDB88320 (reflected). */
let crc32Table: Uint32Array | null = null;

/** Ленивая инициализация таблицы при первом вызове crc32Hex. */
function getCrc32Table(): Uint32Array {
	if (crc32Table === null) {
		const table = new Uint32Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let k = 0; k < 8; k++) {
				c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			}
			table[i] = c >>> 0;
		}
		crc32Table = table;
	}
	return crc32Table;
}

/**
 * CRC32 (PKZIP/zlib-вариант: полином 0xEDB88320 reflected,
 * init 0xFFFFFFFF, финальный XOR 0xFFFFFFFF).
 * hex, нижний регистр, ровно 8 символов. Синхронная.
 */
export function crc32Hex(data: ArrayBuffer): string {
	const table = getCrc32Table();
	const bytes = new Uint8Array(data);
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	crc = (crc ^ 0xffffffff) >>> 0;
	return crc.toString(16).padStart(8, '0');
}

/** SHA-256 через WebCrypto. hex, нижний регистр. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		new Uint8Array(data),
	);
	const bytes = new Uint8Array(digest);
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, '0');
	}
	return hex;
}

/**
 * Git-blob SHA-1: SHA-1 от "blob <size>\0<content>" — хэш, которым GitHub
 * адресует содержимое файлов в git trees. Используется git-источником для
 * сравнения локального содержимого с remote (3-7). БЕЗ кэша (аудит Б-06).
 */
export async function gitBlobSha1Hex(data: ArrayBuffer): Promise<string> {
		const view = new Uint8Array(data);
		const size = data.byteLength;
		const header = new TextEncoder().encode(`blob ${size}\0`);
		const combined = new Uint8Array(header.byteLength + size);
		combined.set(header, 0);
		combined.set(view, header.byteLength);
		const digest = await globalThis.crypto.subtle.digest('SHA-1', combined);
		const bytes = new Uint8Array(digest);
		let hex = '';
		for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
		return hex;
}
