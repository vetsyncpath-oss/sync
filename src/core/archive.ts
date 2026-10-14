import { Inflate } from 'pako';
// src/core/archive.ts — чтение central directory zip-архива БЕЗ распаковки
// (фаза 5, задачи 5-ab + 5-c; дизайн §7.2/§7.3 + Приложение A/B — таблица
// форматов и смещений реализована дословно).
//
// Экономия режима Archive (§7.2): EOCD → (ZIP64-цепочка) → central
// directory → «сырой» манифест (имя, crc32, размеры, метод, смещение
// local header). Распаковка НЕ выполняется — дифф считается по CRC до
// декомпрессии. Извлечение ОТДЕЛЬНОЙ записи по требованию (local header →
// method 0/8 → сверка CRC32) — extractEntry ниже (задача 5-c, §7.3).
//
// Модуль ядра: НЕ импортирует obsidian; из замороженных контрактов —
// только type-only RandomAccessReader (sources/types, решение В5-1);
// из соседних модулей ядра — decodeZipName (каскад кодировок §7.4).
// Portable incremental raw DEFLATE with fixed output allocation and bounded chunks.
// Actual output is checked while inflating; cancellation is checked between chunks.
async function inflateRaw(data:Uint8Array,limit:number,signal?:AbortSignal):Promise<Uint8Array>{
        const inflater=new Inflate({raw:true,chunkSize:64*1024});const output=new Uint8Array(limit);let size=0;
        inflater.onData=value=>{const chunk=value as Uint8Array;if(size+chunk.length>limit)throw new Error('DEFLATE actual output exceeds the declared size');output.set(chunk,size);size+=chunk.length;};
        for(let offset=0;offset<data.length;offset+=64*1024){signal?.throwIfAborted();inflater.push(data.subarray(offset,offset+64*1024),offset+64*1024>=data.length);
                if(inflater.err)throw new Error(inflater.msg);if(offset+64*1024<data.length)await new Promise(resolve=>setTimeout(resolve,0));}
        if(size!==limit)throw Error('DEFLATE output size mismatch');return output;
}
import type { RandomAccessReader } from '../sources/types';
import { decodeZipName } from './archive-names';

export interface ZipEntry {
        name: string;               // декодированное имя
        rawName: Uint8Array;        // сырые байты имени (нужно будет 5-e)
        flags: number;              // general purpose flags
        method: number;             // 0 stored / 8 deflate (проверяется в extractEntry)
        crc32: number;              // unsigned 32-bit
        compressedSize: number;
        uncompressedSize: number;
        localHeaderOffset: number;
        isDir: boolean;             // имя оканчивается '/'
}

// ── Сигнатуры структур zip (Приложение A) ──
const SIG_LFH = 0x04034b50;    // local file header: 50 4B 03 04
const SIG_CDE = 0x02014b50;    // central directory entry: 50 4B 01 02
const SIG_EOCD = 0x06054b50;   // end of central directory: 50 4B 05 06
const SIG_EOCD64 = 0x06064b50; // ZIP64 end of central directory: 50 4B 06 06
const SIG_LOC64 = 0x07064b50;  // ZIP64 EOCD locator: 50 4B 06 07

/** Окно поиска EOCD от конца архива: 22 (сама запись) + 65535 (макс.
 *  комментарий) = 65557, плюс запас 22 по формулировке Приложения A
 *  («назад максимум 65 557 + 22 байта»). */
const EOCD_SCAN_WINDOW = 65557 + 22;

/** Заглушка ZIP64 в классических 32-битных полях. */
const ZIP64_PLACEHOLDER = 0xffffffff;

/** Заглушка ZIP64 в 16-битном счётчике записей EOCD. */
const ENTRIES16_PLACEHOLDER = 0xffff;

/** Минимальный размер записи ZIP64 EOCD (фиксированная часть). */
const EOCD64_MIN_SIZE = 56;

/** Размер ZIP64-локатора (полностью). */
const LOCATOR64_SIZE = 20;

/** u16 little-endian (DOS-порядок) по смещению o в буфере b. */
function rdU16(b: Uint8Array, o: number): number {
        return b[o] | (b[o + 1] << 8);
}

/** u32 little-endian, беззнаковый. */
function rdU32(b: Uint8Array, o: number): number {
        return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** u64 little-endian → number. Значения свыше 2^53-1 не помещаются в
 *  double и означают заведомо неисполнимый архив — явная ошибка. */
function rdU64(b: Uint8Array, o: number): number {
        const v = rdU32(b, o) + rdU32(b, o + 4) * 0x100000000;
        if (!Number.isSafeInteger(v)) {
                throw new Error('ZIP64-поле превышает Number.MAX_SAFE_INTEGER — архив не поддерживается');
        }
        return v;
}

/** hex-представление смещения для сообщений об ошибках. */
function hex(n: number): string {
        return '0x' + n.toString(16);
}

/** RandomAccessReader поверх ArrayBuffer в памяти (мобайл/тесты). */
export class BufferArchiveReader implements RandomAccessReader {
        private readonly buffer: ArrayBuffer;

        constructor(buffer: ArrayBuffer) {
                this.buffer = buffer;
        }

        size(): number {
                return this.buffer.byteLength;
        }

        async read(offset: number, length: number): Promise<Uint8Array> {
                if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0) {
                        throw new RangeError(
                                `BufferArchiveReader.read: некорректные аргументы offset=${offset}, length=${length}`,
                        );
                }
                if (offset + length > this.buffer.byteLength) {
                        throw new RangeError(
                                `BufferArchiveReader.read: выход за пределы буфера: offset=${offset} + length=${length} > size=${this.buffer.byteLength}`,
                        );
                }
                // Независимая копия: мутация результата не влияет ни на буфер,
                // ни на повторные чтения (контракт RandomAccessReader).
                return new Uint8Array(this.buffer, offset, length).slice();
        }
}

/** Чтение central directory: EOCD → (ZIP64-цепочка) → все записи. БЕЗ распаковки. */
export async function readCentralDirectory(reader: RandomAccessReader): Promise<ZipEntry[]> {
        const size = reader.size();
        if (size < 22) {
                throw new Error(`Архив слишком мал для EOCD: ${size} байт (минимум 22)`);
        }

        // ── 1. EOCD (Приложение A): сканирование хвоста НАЗАД от конца —
        // комментарий может содержать произвольные байты, поэтому берём
        // ПОСЛЕДНЮЮ подходящую сигнатуру, а не первую.
        const tailLen = Math.min(size, EOCD_SCAN_WINDOW);
        const tailStart = size - tailLen;
        const tail = await reader.read(tailStart, tailLen);
        // [5-review L1] Двухпроходный выбор кандидата: сигнатура EOCD может
        // встретиться ВНУТРИ комментария (байты произвольны). Приоритет —
        // кандидат с ТОЧНЫМ совпадением i+22+commentLen === size (настоящий
        // EOCD всегда заканчивается ровно в конце файла); точных нет —
        // последний умещающийся (хвост-мусор после EOCD).
        let eocdOff = -1;
        let fallbackOff = -1;
        for (let i = size - 22 - tailStart; i >= 0; i--) {
                if (rdU32(tail, i) !== SIG_EOCD) continue;
                const commentLen = rdU16(tail, i + 20);
                if (tailStart + i + 22 + commentLen > size) continue;
                if (tailStart + i + 22 + commentLen === size) {
                        eocdOff = tailStart + i;
                        break;
                }
                if (fallbackOff < 0) fallbackOff = tailStart + i;
        }
        if (eocdOff < 0) eocdOff = fallbackOff;
        if (eocdOff < 0) {
                throw new Error(`EOCD (50 4B 05 06) не найден в последних ${tailLen} байтах архива (размер ${size} байт)`);
        }
        const eocdRel = eocdOff - tailStart;
        let totalEntries = rdU16(tail, eocdRel + 10);
        let cdSize = rdU32(tail, eocdRel + 12);
        let cdOffset = rdU32(tail, eocdRel + 16);

        // ── 2. ZIP64-цепочка: 16-битный счётчик или 32-битные размеры/смещения
        // переполнены (0xFFFF / 0xFFFFFFFF) → непосредственно перед EOCD стоит
        // локатор 50 4B 06 07, указывающий на ZIP64 EOCD 50 4B 06 06.
        if (totalEntries === ENTRIES16_PLACEHOLDER || cdSize === ZIP64_PLACEHOLDER || cdOffset === ZIP64_PLACEHOLDER) {
                if (eocdOff < LOCATOR64_SIZE) {
                        throw new Error('ZIP64: перед EOCD нет места для локатора (50 4B 06 07)');
                }
                const locOff = eocdOff - LOCATOR64_SIZE;
                const loc = await reader.read(locOff, LOCATOR64_SIZE);
                if (rdU32(loc, 0) !== SIG_LOC64) {
                        throw new Error(`ZIP64: локатор 50 4B 06 07 не найден перед EOCD (смещение ${hex(locOff)})`);
                }
                const eocd64Off = rdU64(loc, 8);
                if (eocd64Off + EOCD64_MIN_SIZE > size) {
                        throw new Error(`ZIP64: смещение EOCD64 ${hex(eocd64Off)} + 56 байт выходит за пределы архива (${size} байт)`);
                }
                const eocd64 = await reader.read(eocd64Off, EOCD64_MIN_SIZE);
                if (rdU32(eocd64, 0) !== SIG_EOCD64) {
                        throw new Error(`ZIP64: некорректная запись EOCD64 (50 4B 06 06) по смещению ${hex(eocd64Off)}`);
                }
                totalEntries = rdU64(eocd64, 32);
                cdSize = rdU64(eocd64, 40);
                cdOffset = rdU64(eocd64, 48);
        }

        // ── 3. Весь central directory одним чтением: у фикстуры zip64 это
        // ~4 МБ (65540 записей) — в память помещается; по-записные запросы
        // к ридеру дали бы 65540 round-trip'ов.
        if (cdOffset + cdSize > size) {
                throw new Error(
                        `central directory выходит за пределы архива: cdOffset=${hex(cdOffset)}, cdSize=${cdSize}, размер архива=${size}`,
                );
        }
        const cd = await reader.read(cdOffset, cdSize);

        // ── 4. Проход по CD-записям (смещения полей — Приложение A).
        const entries: ZipEntry[] = [];
        let off = 0; // смещение внутри cd; абсолютное = cdOffset + off
        for (let i = 0; i < totalEntries; i++) {
                const abs = cdOffset + off;
                if (off + 46 > cdSize) {
                        throw new Error(`запись #${i + 1}: central directory обрезан (смещение ${hex(abs)})`);
                }
                if (rdU32(cd, off) !== SIG_CDE) {
                        throw new Error(`запись #${i + 1}: повреждена сигнатура central directory (ожидается 50 4B 01 02) по смещению ${hex(abs)}`);
                }
                const flags = rdU16(cd, off + 8);
                const method = rdU16(cd, off + 10);
                const crc32 = rdU32(cd, off + 16);
                let compressedSize = rdU32(cd, off + 20);
                let uncompressedSize = rdU32(cd, off + 24);
                const nameLen = rdU16(cd, off + 28);
                const extraLen = rdU16(cd, off + 30);
                const commentLen = rdU16(cd, off + 32);
                let localHeaderOffset = rdU32(cd, off + 42);
                const entryLen = 46 + nameLen + extraLen + commentLen;
                if (off + entryLen > cdSize) {
                        throw new Error(`запись #${i + 1}: имя/extra/comment выходят за пределы central directory (смещение ${hex(abs)})`);
                }
                // Сырые байты имени — независимая копия (нужны задачам 5-c/5-e).
                const rawName = cd.slice(off + 46, off + 46 + nameLen);

                // ZIP64-extra (header ID 0x0001): заменяются ТОЛЬКО поля-заглушки
                // 0xFFFFFFFF, в порядке usize(8) → csize(8) → lho(8); diskStart(4)
                // идёт последним и парсеру не нужен.
                if (
                        uncompressedSize === ZIP64_PLACEHOLDER ||
                        compressedSize === ZIP64_PLACEHOLDER ||
                        localHeaderOffset === ZIP64_PLACEHOLDER
                ) {
                        let p = off + 46 + nameLen;
                        const end = p + extraLen;
                        while (p + 4 <= end) {
                                const id = rdU16(cd, p);
                                const dataSize = rdU16(cd, p + 2);
                                if (id === 0x0001) {
                                        let q = p + 4;
                                        const need =
                                                (uncompressedSize === ZIP64_PLACEHOLDER ? 8 : 0) +
                                                (compressedSize === ZIP64_PLACEHOLDER ? 8 : 0) +
                                                (localHeaderOffset === ZIP64_PLACEHOLDER ? 8 : 0);
                                        if (q + need > end) {
                                                throw new Error(
                                                        `запись #${i + 1}: обрезан ZIP64 extra-блок (0x0001) — нужно ${need} байт, доступно ${end - q} (смещение ${hex(cdOffset + p)})`,
                                                );
                                        }
                                        if (uncompressedSize === ZIP64_PLACEHOLDER) { uncompressedSize = rdU64(cd, q); q += 8; }
                                        if (compressedSize === ZIP64_PLACEHOLDER) { compressedSize = rdU64(cd, q); q += 8; }
                                        if (localHeaderOffset === ZIP64_PLACEHOLDER) { localHeaderOffset = rdU64(cd, q); q += 8; }
                                        break;
                                }
                                p += 4 + dataSize;
                        }
                }

                // Декодирование имени (§7.4) и признак директории.
                const name = decodeZipName(rawName, (flags & 0x0800) !== 0);
                entries.push({
                        name,
                        rawName,
                        flags,
                        method,
                        crc32,
                        compressedSize,
                        uncompressedSize,
                        localHeaderOffset,
                        isDir: name.endsWith('/'),
                });
                off += entryLen;
        }

        // ── 5. Контроль пройденного пути: записи должны исчерпать central
        // directory ровно до cdSize (иначе — мусорный хвост или подделка).
        if (off !== cdSize) {
                throw new Error(
                        `central directory: пройдено ${off} байт, cdSize=${cdSize} (записи закончились на ${hex(cdOffset + off)})`,
                );
        }
        return entries;
}

// ────────────────────────────────────────────────────────────────────────
// Извлечение отдельной записи (задача 5-c, дизайн §7.3 + Приложение A/B)
// ────────────────────────────────────────────────────────────────────────

/** Таблица CRC32 (Приложение B): 256 значений, полином 0xEDB88320
 *  (reflected), init/XOR 0xFFFFFFFF — стандартный PKZIP/zlib-вариант,
 *  совпадающий с полем crc32 в zip. Локальная sync-реализация u32:
 *  hasher.ts не подходит (async-интерфейс sha и другой формат вывода). */
const CRC32_TABLE: Uint32Array = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) {
                        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
                }
                table[n] = c;
        }
        return table;
})();

/** CRC32 массива байт как беззнаковое u32 (>>> 0). */
function crc32(data: Uint8Array): number {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
                c = CRC32_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Извлечение одной записи (дизайн §7.3): local header → данные по
 * lho+30+nameLen+extraLen длиной compressedSize → method 0/8 →
 * сверка CRC32. Возвращает НЕЗАВИСИМЫЙ ArrayBuffer.
 * method ∉ {0,8} → Error «unsupported compression method N».
 * flags бит 0 (шифрование) → Error «encrypted».
 * CRC32 не совпал → Error с expected/actual.
 */
/** [overhaul S3/M-14] Защита от zip-бомбы: inflate аллоцирует весь
 *  результат в RAM — без лимита «архив в 10 МБ» разворачивался в
 *  гигабайты (OOM рендерера). Заявленный (central directory) размер
 *  записи проверяется ДО inflate; фактический — существующей сверкой
 *  с uncompressedSize ниже. 2 GiB — выше разумного файла заметки и
 *  ниже порога гарантированного OOM. */
const MAX_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

export async function extractEntry(
        reader: RandomAccessReader,
        entry: ZipEntry,
        signal?:AbortSignal,
): Promise<ArrayBuffer> {
        const size = reader.size();

        // [overhaul S3/M-14] zip-бомба: заявленный несжатый размер — ДО любых
        // чтений/inflate (дешёвая проверка по central directory). Stored-записи
        // (method 0) проходят ту же проверку — буфер резервируется и для них.
        if (entry.uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
                throw new Error(
                        `запись «${entry.name}»: заявленный размер ${entry.uncompressedSize} байт превышает лимит ${MAX_ENTRY_UNCOMPRESSED_BYTES} (защита от zip-бомбы)`,
                );
        }

        // ── 1. Local file header (Приложение A): 30 байт фиксированной части.
        // Повреждённая сигнатура = битый архив или рассинхрон central directory.
        if (entry.localHeaderOffset + 30 > size) {
                throw new Error(
                        `запись «${entry.name}»: local header за пределами архива: offset=${hex(entry.localHeaderOffset)}, размер архива=${size}`,
                );
        }
        const lfh = await reader.read(entry.localHeaderOffset, 30);
        if (rdU32(lfh, 0) !== SIG_LFH) {
                throw new Error(
                        `запись «${entry.name}»: повреждена сигнатура local file header (ожидается 50 4B 03 04) по смещению ${hex(entry.localHeaderOffset)} — архив битый или рассинхрон central directory`,
                );
        }

        // ── 2. Данные начинаются сразу за LFH + имя + extra (Приложение A);
        // длина — compressedSize из central directory. Имя в LFH намеренно
        // НЕ сверяется с CD: архиваторы пишут одинаково, сверка не требуется.
        const nameLen = rdU16(lfh, 26);
        const extraLen = rdU16(lfh, 28);
        const dataOffset = entry.localHeaderOffset + 30 + nameLen + extraLen;

        // ── 3. Шифрование (flags бит 0) — до чтения данных.
        if (entry.flags & 0x0001) {
                throw new Error(`encrypted entry: ${entry.name}`);
        }

        // ── 4. Метод сжатия: только 0 (stored) и 8 (raw DEFLATE);
        // 9/12/14 (Deflate64/bzip2/LZMA) отклоняются явно (§7.3).
        if (entry.method !== 0 && entry.method !== 8) {
                throw new Error(`unsupported compression method ${entry.method} (запись «${entry.name}»)`);
        }

        if (dataOffset + entry.compressedSize > size) {
                throw new Error(
                        `запись «${entry.name}»: данные выходят за пределы архива: dataOffset=${hex(dataOffset)}, compressedSize=${entry.compressedSize}, размер архива=${size}`,
                );
        }
        if(entry.compressedSize>MAX_ENTRY_UNCOMPRESSED_BYTES+1024*1024)throw new Error('Compressed entry exceeds the safe read buffer limit');
        const compressed = await reader.read(dataOffset, entry.compressedSize);

        // ── 5. Распаковка + сверка CRC32 с central directory. Бит 3 (data
        // descriptor) игнорируется: в CD всегда лежат финальные значения.
        let data: Uint8Array;
        if (entry.method === 0) {
                data = compressed; // stored — как есть
        } else {
                // raw DEFLATE (ZIP method 8): Node zlib отдаёт свежий Buffer
                // (subclass Uint8Array) — независимый от compressed буфер.
                try {
                        data = await inflateRaw(compressed,entry.uncompressedSize,signal);
                } catch (e) {
                        if(signal?.aborted)throw signal.reason??new DOMException('Cancelled','AbortError');
                        throw new Error(
                                `запись «${entry.name}»: не удалось распаковать DEFLATE-данные: ${e instanceof Error ? e.message : String(e)}`,
                        );
                }
        }
        if (data.length !== entry.uncompressedSize) {
                throw new Error(
                        `запись «${entry.name}»: размер распакованных данных ${data.length} ≠ uncompressedSize=${entry.uncompressedSize} (архив битый)`,
                );
        }
        const actualCrc = crc32(data);
        const expectedCrc = entry.crc32 >>> 0; // побитовое u32: клон мог занести знак
        if (actualCrc !== expectedCrc) {
                throw new Error(
                        `CRC32 не совпал: запись «${entry.name}»: expected 0x${expectedCrc.toString(16)}, actual 0x${actualCrc.toString(16)} (архив битый или повреждён при передаче)`,
                );
        }

        // ── 6. Независимый ArrayBuffer ровно uncompressedSize байт.
        // new Uint8Array(data) копирует данные в свежий Uint8Array с
        // собственным ArrayBuffer'ом точного размера — корректно и для
        // Uint8Array (stored-ветка), и для Node Buffer из inflateRawSync
        // (где data.slice().buffer отдал бы весь внутренний пул целиком).
        return new Uint8Array(data).buffer;
}
