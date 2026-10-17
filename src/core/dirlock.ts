import { SyncFault } from './sync-issue';
// ============================================================
// --- CORE/DIRLOCK (фаза 4-1: перенос из main.ts без изменений
// логики) ---
// Сериализует создание каталогов: параллельные загрузки одного
// батча не устраивают гонку mkdir на общем родителе.
// core/-версия принимает минимальный интерфейс вместо
// obsidian-DataAdapter (В5-1); текст ошибки — plain English,
// локализация — ответственность вызывающего UI.
// ============================================================

export interface MkdirAdapter {
        exists(path: string): Promise<boolean>;
        mkdir(path: string): Promise<void>;
        stat?(path:string):Promise<{type?:string}|null>;
}

export class DirLock {
        private locks: Map<string, Promise<void>> = new Map();

        async ensure(adapter: MkdirAdapter, filePath: string): Promise<void> {
                const dir = filePath.substring(0, filePath.lastIndexOf('/'));
                if (!dir) return;
                const existing = this.locks.get(dir);
                if (existing) {
                        await existing;
                        return this.ensure(adapter, filePath);
                }
                let resolveLock: () => void;
                const lockPromise = new Promise<void>((resolve) => { resolveLock = resolve; });
                this.locks.set(dir, lockPromise);
                try {
                        await this.createDirectory(adapter, dir);
                } finally {
                        this.locks.delete(dir);
                        resolveLock!();
                }
        }

        private async createDirectory(adapter: MkdirAdapter, dir: string): Promise<void> {
                const parts = dir.split('/').filter(p => p.length > 0);
                let currentPath = '';
                for (const part of parts) {
                        currentPath = currentPath === '' ? part : `${currentPath}/${part}`;
                        const exists = await adapter.exists(currentPath);
                        if(exists&&(await adapter.stat?.(currentPath))?.type==='file')throw new SyncFault('path-collision',`Parent is a file: ${currentPath}`);
                        if (!exists) {
                                try {
                                        await adapter.mkdir(currentPath);
                                } catch (e: any) {
                                        const nowExists = await adapter.exists(currentPath);
                                        if(nowExists&&(await adapter.stat?.(currentPath))?.type==='file')throw new SyncFault('path-collision',`Parent is a file: ${currentPath}`);
                                        if (!nowExists) {
                                                throw new SyncFault('mkdir-failed',`Failed to create directory ${currentPath}: ${e?.message ?? e}`);
                                        }
                                }
                        }
                }
        }
}
