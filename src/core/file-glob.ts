// src/core/file-glob.ts — минималистичный glob-matcher для fileExclusions.
// [overhaul v4 / Этап 1] Чистая функция без obsidian/node импортов.
//
// ПОДДЕРЖКА:
//  - '*'   → '[^/]*' (любые символы кроме '/')
//  - '**'  → '.*'    (любые символы включая '/')
//  - '?'   → '[^/]'  (один любой символ кроме '/')
//  - литералы экранируются (regex special chars: . + ^ $ { } ( ) | [ ] \)
//
// НЕ ПОДДЕРЖИВАЕТ (сознательно — для простоты и предсказуемости):
//  - character classes '[abc]' — пользователь может обойтись '*'
//  - braces '{a,b}' — два исключения вместо одного
//  - negation '!' — fileExclusions само по себе исключение
//
// КОНТРАКТ:
//  - Если паттерн НЕ содержит '/', матч на BASENAME (последний сегмент).
//    '*.log' матчит 'app.log' и 'logs/app.log' (по basename 'app.log').
//  - Если паттерн содержит '/', матч на ПОЛНЫЙ ПУТЬ.
//    'notes/*.tmp' матчит 'notes/draft.tmp', но НЕ 'other/draft.tmp'
//    и НЕ 'notes/sub/draft.tmp' (т.к. '*' без '/').
//  - 'notes/**/*.tmp' матчит 'notes/draft.tmp' и 'notes/sub/draft.tmp'
//    ('**' покрывает '/').

import type { FileExclusion } from '../sources/types';

/**
 * Конвертировать glob-паттерн в RegExp.
 *
 * Алгоритм: посимвольный обход, экранирование regex-special chars,
 * разворот '*', '**', '?' в соответствующие regex-конструкции.
 *
 * Бросает SyntaxError на malformed pattern (например, unbalanced '[') —
 * НО мы НЕ бросаем в callers; matchesFileExclusion ловит и трактует
 * как "не матчится" (fail-open: файл НЕ исключается, синк продолжается).
 */
export function globToRegex(pattern: string): RegExp {
    let re = '^';
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === '*') {
            if (pattern[i + 1] === '*') {
                re += '.*';
                i++;
            } else {
                re += '[^/]*';
            }
        } else if (c === '?') {
            re += '[^/]';
        } else if (/[.+^${}()|[\]\\]/.test(c)) {
            re += '\\' + c;
        } else {
            re += c;
        }
    }
    return new RegExp(re + '$');
}

/**
 * Матчится ли путь против glob-паттерна.
 *
 * Если паттерн НЕ содержит '/' — матч на basename (последний сегмент пути).
 * Иначе — на полный путь (с учётом иерархии, '*' не покрывает '/').
 *
 * Fail-open: malformed pattern → false (файл не исключается, синк идёт).
 */
export function matchGlob(path: string, pattern: string): boolean {
    // паттерн без '/' → матч на basename (последний сегмент)
    const target = pattern.includes('/')
        ? path
        : (path.split('/').pop() ?? '');
    try {
        return globToRegex(pattern).test(target);
    } catch {
        // malformed pattern (например, unbalanced '[') — fail-open
        return false;
    }
}

/**
 * Извлечь timestamp из имени конфликт-копии для сортировки "от старых к новым".
 *
 * Формат имени: 'base.conflict-YYYY-MM-DDTHH-mm-ss[-N].ext'
 * Возвращает timestamp как строку (лексикографическая сортировка = хронологическая
 * для ISO-подобного формата). Пустая строка если не найдено.
 *
 * [overhaul v4 / Этап 5 / F1] Используется auto-cleanup'ом конфликт-копий
 * для выбора самой старой при достижении MAX_NAME_CANDIDATES.
 */
export function extractConflictTimestamp(name: string): string {
    // '.' перед 'conflict-' может быть в любом месте имени (basename).
    // Берём первое совпадение 'conflict-(timestamp)'.
    const match = name.match(/\.conflict-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
    return match ? match[1] : '';
}

/**
 * Матчится ли путь против любого исключения из списка.
 *
 * Логика:
 *  1. Если у исключения задан scope — путь должен быть внутри scope
 *     (path === scope || path.startsWith(scope + '/')). Иначе — skip исключение.
 *  2. Если паттерн содержит '/' — матч на полный путь.
 *     Иначе — на basename.
 *  3. Первое совпадение — true (одно исключение достаточно).
 *
 * @param path Нормализованный путь (POSIX-разделители, без ведущих '/').
 * @param exclusions Список исключений (или undefined/[]).
 * @returns true если путь подпадает хотя бы под одно исключение.
 */
export function matchesFileExclusion(
    path: string,
    exclusions: readonly FileExclusion[] | undefined,
): boolean {
    if (!exclusions || exclusions.length === 0) return false;

    for (const ex of exclusions) {
        if (!ex.pattern) continue;

        // scope check: если задан, путь должен быть внутри scope
        if (ex.scope) {
            const scopeNorm = ex.scope.replace(/\/+$/g, '').replace(/^\/+/, '');
            if (scopeNorm) {
                // путь === scope ИЛИ начинается со scope + '/'
                const insideScope =
                    path === scopeNorm || path.startsWith(scopeNorm + '/');
                if (!insideScope) continue;
            }
        }

        if (matchGlob(path, ex.pattern)) return true;
    }
    return false;
}
