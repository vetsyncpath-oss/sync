// src/utils/format.ts — чистые функции форматирования (без зависимостей).
// Извлечены дословно из main.ts (3 копии formatBytes) и syncthing-orchestrator.ts
// в рамках фазы 1 (задача 1-1a, аудит Д-02). Поведение не изменено.

export function formatBytes(bytes: number): string {
        // [overhaul S4/LOW] ГБ-размеры: раньше 2 ГБ → «2048.0 MB».
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
