// ============================================================
// --- ADAPTERS/FILE-ARCHIVE-READER (фаза 5, задача 5-d) ---
// RandomAccessReader поверх ФАЙЛА на диске — десктоп-ветка
// архивного канала (§7.2): ZIP-источник скачивает архив в tmp-файл
// (ArchiveDownloader, задача 5-f) и парсит central directory без
// загрузки архива в память — только нужные диапазоны через fs.read.
//
// Node API — ТОЛЬКО ленивым require ВНУТРИ методов: top-level
// require('fs') утянул бы 'fs' в мобильный бандл (решение В5-1);
// вызов внутри метода при external:'fs' остаётся require-вызовом
// и в десктоп-рантайме резолвится лениво. Типы node:fs берём
// через typeof import('fs') — type-only конструкция, в рантайм
// не попадает (tsc её стирает).
//
// Владение: класс распоряжается ТОЛЬКО файловым дескриптором —
// сам файл НЕ удаляется (владелец tmp-файла — вызывающий код,
// см. dispose у ArchiveDownloader, 5-f). fd открывается лениво
// при первом size()/read() и живёт до dispose(); повторный
// dispose — no-op, обращения после dispose — Error 'disposed'.
//
// Результаты обязаны быть идентичны BufferArchiveReader (мобильная
// ветка): та же валидация RangeError, та же независимая копия
// из read() — паритет зафиксирован тестом tests/file-archive-reader.test.ts.
// ============================================================

import type { RandomAccessReader } from '../sources/types';

/** Ленивый доступ к node:fs: require исполняется только в момент вызова. */
function lazyFs(): typeof import('fs') {
	return require('fs') as typeof import('fs');
}

export class FileArchiveReader implements RandomAccessReader {
	private readonly filePath: string;
	private fd: number | null = null;
	private disposed = false;

	constructor(filePath: string) {
		// Конструктор ничего не трогает на диске — файл открывается
		// лениво при первом size()/read() (ошибки типа ENOENT — там же).
		this.filePath = filePath;
	}

	/** Мёртвый reader обязан сообщать об этом ДО какой-либо валидации. */
	private assertNotDisposed(): void {
		if (this.disposed) {
			throw new Error('FileArchiveReader: reader disposed — fd закрыт, нужен новый экземпляр');
		}
	}

	/** Лениво открыть fd (идемпотентно между size/read). */
	private ensureOpen(): number {
		this.assertNotDisposed();
		if (this.fd === null) {
			this.fd = lazyFs().openSync(this.filePath, 'r');
		}
		return this.fd;
	}

	size(): number {
		const fs = lazyFs();
		return fs.fstatSync(this.ensureOpen()).size;
	}

	async read(offset: number, length: number): Promise<Uint8Array> {
		// Мёртвый объект всегда отвечает 'disposed' (даже при кривых
		// аргументах) — детерминированнее, чем смесь ошибок.
		this.assertNotDisposed();
		// Валидация — паритет с BufferArchiveReader (единый контракт
		// RandomAccessReader): целые неотрицательные, затем границы.
		if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0) {
			throw new RangeError(
				`FileArchiveReader.read: некорректные аргументы offset=${offset}, length=${length}`,
			);
		}
		const fs = lazyFs();
		const fd = this.ensureOpen();
		const fileSize = fs.fstatSync(fd).size;
		if (offset + length > fileSize) {
			throw new RangeError(
				`FileArchiveReader.read: выход за пределы файла: offset=${offset} + length=${length} > size=${fileSize}`,
			);
		}
		// Пустой диапазон: read(size, 0) допустим (offset+0 > size — нет),
		// readSync не зовём — позиция в конце файла и так ни к чему.
		if (length === 0) {
			return new Uint8Array(0);
		}
		// Читаем сразу в СВЕЖИЙ Uint8Array: readSync принимает любую
		// typed array, поэтому результат — независимая копия без всякого
		// пула Buffer (мутация результата не влияет ни на файл, ни на
		// повторные чтения — контракт RandomAccessReader). Двойное
		// аллокирование Buffer.alloc + copy не нужно.
		const out = new Uint8Array(length);
		const bytesRead = fs.readSync(fd, out, 0, length, offset);
		if (bytesRead !== length) {
			// Границы проверены по fstat — недобор означает, что файл
			// усечён параллельно (tmp-файл перезаписали/удалили).
			throw new Error(
				`FileArchiveReader.read: прочитано ${bytesRead} из ${length} байт (offset=${offset}) — файл изменился во время чтения`,
			);
		}
		return out;
	}

	async dispose(): Promise<void> {
		// Закрываем fd, файл НЕ трогаем (владелец tmp-файла — вызывающий
		// код, 5-f). Идемпотентно: повторный dispose / dispose до первого
		// открытия — no-op.
		if (this.fd !== null) {
			lazyFs().closeSync(this.fd);
			this.fd = null;
		}
		this.disposed = true;
	}
}
