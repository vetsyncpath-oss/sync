// src/engines/schema.ts — [W3-T01] типы декларативной схемы полей
// настроек движков + чистые функции валидации значений.
//
// Движок описывает свои настройки как массив SettingField[]; реестр
// движков (W3-T02 registry.ts) вкладывает этот массив в EngineDescriptor.
// SettingsTab (W3-T03) ходит по массиву и строит Obsidian-контрол по
// `type` без каскада if'ов (главная боль 2.3.3: каждое новое поле движка
// = новый if в display(); новое движок = 5+ правок по кодовой базе —
// §8.1 аудита). Здесь — только схема и валидация, без рендера.
//
// ЧИСТОТА: модуль фундаментальный — БЕЗ импортов obsidian, node-API и
// других внутренних модулей. Только TypeScript-типы + чистые функции.
// Логика детерминирована (no side-effects, no I/O, no logging) — это
// позволяет тестировать каждое правило изолированно.
//
// СЕКРЕТЫ: поля `type: 'secret'` НИКОГДА не логируются в plain-text
// (правило аудита §8.3). На уровне валидации это свойство НЕ влияет —
// мы проверяем только «не пусто» для required; маскирование/логирование
// — ответственность SettingsTab и sourceId-фабрики (W3-T02). Алиас
// `field.secret: true` оставлен как deprecated-маркер для sourceId-фабрики:
// она исключает секретные поля из хэша djb2 (иначе sourceId менялся бы
// при каждой ротации токена → у юзера полный re-download — правило
// сохранения sourceId существующих движков, инвариант 3 CONVENTIONS).
//
// КОНТРАКТ ВАЛИДАЦИИ ( ValidationError ):
//   - 'required'         : поле обязательно, значение пусто/отсутствует
//   - 'pattern'          : regex-валидация (включая http(s):// для url)
//   - 'range'            : number вне [min, max]
//   - 'invalid-option'   : select-значение не входит в options[]
//   - 'type-mismatch'    : значение не того типа (string vs number и т.п.)
//
// СЕМАНТИКА ПО ТИПАМ:
//   - text/url/secret: строка; required → непустая; pattern → regex match
//     (pattern проверяется ТОЛЬКО для непустых значений — пустое поле
//     без required валидно). url дополнительно требует `^https?://`
//     (префикс протокола обязателен — иначе régex-валидация упала бы
//      на частицах без '//').
//   - select: строка; required → непустая; значение обязано входить
//     в options[].value. Пустая строка при `!required` валидна (= нет выбора).
//   - toggle: boolean; `undefined` → трактуется как `false` (НЕ error)
//     — это совместимо со старым GitSyncSettings, где тумблеры
//     не обязаны быть заданы в настройках. Не-boolean и не-undefined →
//     type-mismatch.
//   - number: число; required → не undefined; NaN → type-mismatch;
//     min/max при наличии проверяются включительно.
//
// ЗАВИСИМОСТИ: отсутствуют. Модуль реестра (W3-T02) импортирует типы
// отсюда; SettingsTab (W3-T03) импортирует типы + validateSettings для
// подсветки ошибок в UI. Test Connection (W3-T04) зовёт validateSettings
// перед сетевым запросом (fail-closed: невалидная конфигурация не идёт в сеть).

// ────────────────────────────────────────────────────────────────────────
// Типы схемы
// ────────────────────────────────────────────────────────────────────────

/** Тип контрола SettingsTab для поля. Определяет рендер + правила валидации. */
export type SettingFieldType =
        | 'text'
        | 'url'
        | 'select'
        | 'toggle'
        | 'secret'
        | 'number';

/** Опция для `type: 'select'`. labelKey — путь в i18n-словаре. */
export interface SettingFieldOption {
        value: string;
        /** Путь в i18n-словаре (например 'eng.git.branches.all'). */
        labelKey: string;
}

/**
 * Декларативное описание поля настроек движка. SettingsTab (W3-T03)
 * строит Obsidian Setting-контрол по `type` + подставляет подписи
 * из i18n по `labelKey` / `helpKey` / `placeholderKey` / `options[].labelKey`.
 */
export interface SettingField {
        /** Имя поля в settings (например 'repo', 'branch', 'token'). */
        key: string;
        type: SettingFieldType;
        /** Путь в i18n-словаре для подписи поля. */
        labelKey: string;
        /** Путь в i18n для подсказки (small text под полем). */
        helpKey?: string;
        /** Путь в i18n для placeholder'а. */
        placeholderKey?: string;
        /** Поле обязательно — `required` пустое значение роняет валидацию. */
        required?: boolean;
        /** Значение по умолчанию (для инициализации + миграции). */
        default?: string | number | boolean;
        /** Опции для `type: 'select'`. Игнорируется для остальных типов. */
        options?: SettingFieldOption[];
        /** Границы для `type: 'number'` (включительно). */
        min?: number;
        max?: number;
        /**
         * Deprecated-алиас `type: 'secret'`. Сохранён как маркер для
         * sourceId-фабрики (W3-T02) — она исключает секретные поля из
         * djb2-хэша (инвариант 3: sourceId НЕ меняется при ротации токена).
         */
        secret?: boolean;
        /** Для 'text'/'secret' — рендерить textarea вместо input. */
        multiline?: boolean;
        /** Regex-строка для 'text'/'url' валидации (например '^[a-zA-Z0-9_-]+$'). */
        pattern?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Типы ошибок валидации
// ────────────────────────────────────────────────────────────────────────

export type ValidationError =
        | { code: 'required'; field: string }
        | { code: 'pattern'; field: string; pattern: string }
        | { code: 'range'; field: string; min?: number; max?: number }
        | { code: 'invalid-option'; field: string; value: string }
        | { code: 'type-mismatch'; field: string; expected: SettingFieldType };

// ────────────────────────────────────────────────────────────────────────
// Валидация
// ────────────────────────────────────────────────────────────────────────

/**
 * Неявный regex для URL-полей: значение обязано начинаться с http://
 * или https:// (правило из брифа W3-T01). Возвращается как 'pattern'
 * ValidationError с этим pattern, чтобы UI мог подсветить проблему
 * той же веткой рендера, что и пользовательские regex'ы.
 */
// [overhaul S4/LOW] регистронезависимая схема (HTTPS:// — валидный URL:
// RFC 3986: scheme нечувствителен к регистру; раньше «HTTPS://…» отвергался).
const URL_PREFIX_PATTERN = '^https?://';
const URL_PREFIX_RE = /^https?:\/\//i;

/** [overhaul S4/LOW] Кэш скомпилированных pattern'ов: компиляция на каждый
 *  вызов валидации — лишняя работа на каждый keystroke настроек. */
const patternCache = new Map<string, RegExp>();
function patternRe(source: string): RegExp {
        let re = patternCache.get(source);
        if (re === undefined) {
                re = new RegExp(source);
                patternCache.set(source, re);
        }
        return re;
}

/** true, если значение — непустая строка (после trim). */
function isNonEmptyString(v: unknown): v is string {
        return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Валидация одного значения по схеме поля. Возвращает null, если значение
 * корректно, иначе — ValidationError с указанием поля (field.key).
 *
 * Чистая функция — никаких side-эффектов, идемпотентна, не бросает.
 * Секреты: на уровне валидации НЕ отличаются от text (маскирование —
 * ответственность UI-слоя; здесь только «не пусто» для required).
 */
export function validateField(
        field: SettingField,
        value: unknown,
): ValidationError | null {
        const { key, type, required } = field;

        // toggle: особый случай — undefined → false (НЕ error), не-boolean → type-mismatch.
        // required для toggle игнорируется (бинарное поле не может быть «не заполнено»).
        if (type === 'toggle') {
                if (value === undefined || value === null) return null; // → false
                if (typeof value !== 'boolean') {
                        return { code: 'type-mismatch', field: key, expected: 'toggle' };
                }
                return null;
        }

        // Для остальных типов: undefined/null → required-проверка (если требуется).
        // Не-required поле без значения → валидно (null).
        if (value === undefined || value === null) {
                return required ? { code: 'required', field: key } : null;
        }

        switch (type) {
                case 'text':
                case 'secret': {
                        if (typeof value !== 'string') {
                                return { code: 'type-mismatch', field: key, expected: type };
                        }
                        if (required && !isNonEmptyString(value)) {
                                return { code: 'required', field: key };
                        }
                        // Pattern проверяется ТОЛЬКО для непустых значений —
                        // пустое поле без required валидно (см. контракт выше).
                        if (field.pattern && value.trim().length > 0) {
                                if (!patternRe(field.pattern).test(value)) {
                                        return { code: 'pattern', field: key, pattern: field.pattern };
                                }
                        }
                        return null;
                }

                case 'url': {
                        if (typeof value !== 'string') {
                                return { code: 'type-mismatch', field: key, expected: 'url' };
                        }
                        if (required && !isNonEmptyString(value)) {
                                return { code: 'required', field: key };
                        }
                        if (value.trim().length > 0) {
                                // 1) URL обязан начинаться с http(s):// (правило W3-T01);
                                //    [overhaul S4/LOW] регистронезависимо.
                                if (!URL_PREFIX_RE.test(value)) {
                                        return { code: 'pattern', field: key, pattern: URL_PREFIX_PATTERN };
                                }
                                // 2) Пользовательский pattern (если задан) — поверх обязательного.
                                if (field.pattern) {
                                        if (!patternRe(field.pattern).test(value)) {
                                                return { code: 'pattern', field: key, pattern: field.pattern };
                                        }
                                }
                        }
                        return null;
                }

                case 'select': {
                        if (typeof value !== 'string') {
                                return { code: 'type-mismatch', field: key, expected: 'select' };
                        }
                        if (required && !isNonEmptyString(value)) {
                                return { code: 'required', field: key };
                        }
                        // Пустое значение без required — валидно (= «не выбрано»).
                        if (value === '' && !required) return null;
                        const opts = field.options ?? [];
                        const found = opts.some((o) => o.value === value);
                        if (!found) {
                                return { code: 'invalid-option', field: key, value };
                        }
                        return null;
                }

                case 'number': {
                        if (typeof value !== 'number' || Number.isNaN(value)) {
                                return { code: 'type-mismatch', field: key, expected: 'number' };
                        }
                        if (field.min !== undefined && value < field.min) {
                                return { code: 'range', field: key, min: field.min, max: field.max };
                        }
                        if (field.max !== undefined && value > field.max) {
                                return { code: 'range', field: key, min: field.min, max: field.max };
                        }
                        return null;
                }

                default: {
                        // TypeScript- exhaustive switch: сюда попадут только новые типы,
                        // не описанные выше. Возвращаем type-mismatch с «ожидался X» —
                        // безопаснее, чем молча пропустить неизвестный тип.
                        return { code: 'type-mismatch', field: key, expected: type };
                }
        }
}

/**
 * Валидация набора значений по схеме. Возвращает массив ошибок
 * (порядок = порядок полей в schema). Пустой массив = всё корректно.
 *
 * Используется:
 *   - SettingsTab (W3-T03) — для подсветки некорректных полей в UI;
 *   - Test Connection (W3-T04) — fail-closed: невалидная конфигурация
 *     не идёт в сеть (например, пустой repo URL не даст POST на GitHub API).
 *   - applyPreset / migration — для самопроверки после программной правки.
 */
export function validateSettings(
        schema: SettingField[],
        values: Record<string, unknown>,
): ValidationError[] {
        const errors: ValidationError[] = [];
        for (const field of schema) {
                const err = validateField(field, values[field.key]);
                if (err) errors.push(err);
        }
        return errors;
}
