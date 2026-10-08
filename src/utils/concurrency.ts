// Утилиты конкурентности (фаза 1 рефакторинга, задача 1-2a).
// Обе функции перенесены ДОСЛОВНО из src/main.ts (блоки
// "--- UTILITY: Debounce with cancel ---" и "--- UTILITY: Concurrency Limiter ---",
// строки ~898-940) без изменения поведения; добавлен только `export`.
//
// - debounce: отложенный вызов с возможностью отмены (нужен SettingsManager).
// - pMap: map с лимитом параллельности. ВАЖНО (сознательное поведение исходника):
//   исключение mapper'а НЕ пробрасывается наружу, а кладётся В РЕЗУЛЬТАТ
//   на позиции элемента (`catch (e) { results[idx] = e; }`).
//   [overhaul S4/M-19] ТИП БОЛЬШЕ НЕ ВРЁТ: возвращается Array<R | Error> —
//   потребитель ОБЯЗАН проверить instanceof Error (компилятор заставит).
//   Раньше тип R[] позволял забыть проверку — тихая порча (W1-T02).
//
// Импорты в main.ts переключает главный агент ПОСЛЕ приёмки этой задачи
// (дубликат определений в main.ts пока остаётся).

// --- UTILITY: Debounce with cancel ---

export function debounce<T extends (...args: any[]) => any>(
        fn: T,
        delay: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const debounced = ((...args: Parameters<T>) => {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => fn(...args), delay);
        }) as ((...args: Parameters<T>) => void) & { cancel: () => void };
        debounced.cancel = () => {
                if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                }
        };
        return debounced;
}

// --- UTILITY: Concurrency Limiter ---

/** Map с лимитом параллельности. Ошибка mapper'а кладётся В РЕЗУЛЬТАТ на
 *  позиции элемента (НЕ пробрасывается) — честный тип Array<R | Error>
 *  заставляет потребителей проверять слоты (фикс контракта W1-T02). */
export async function pMap<T, R>(
        items: T[],
        mapper: (item: T, index: number) => Promise<R>,
        concurrency: number
): Promise<Array<R | Error>> {
        if (items.length === 0) return [];
        if (concurrency <= 0) concurrency = 1;
        const results: Array<R | Error> = new Array(items.length);
        let nextIndex = 0;
        const worker = async (): Promise<void> => {
                while (nextIndex < items.length) {
                        const idx = nextIndex++;
                        try {
                                results[idx] = await mapper(items[idx], idx);
                        } catch (e) {
                                results[idx] = e instanceof Error ? e : new Error(String(e));
                        }
                }
        };
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
        await Promise.all(workers);
        return results;
}
