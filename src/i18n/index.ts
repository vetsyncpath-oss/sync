// [W2-T01] i18n-менеджер: синглтон на процесс + канонический аксессор t().
// main.ts перестал владеть `let i18n` — импортирует синглтон отсюда.
// Обнаружение локали — защищённое от Node-окружения (vitest default env
// не имеет window/navigator; happy-dom подключается точечно).

import { en } from './en';
import { ru } from './ru';
import type { Locale, Translations } from './types';

const translations: Record<Locale, Translations> = { en, ru };

export type { Locale, Translations };
export { en, ru };

// --- i18n Manager ---

export class I18n {
        private locale: Locale = 'en';
        private _translations!: Translations;

        constructor(locale?: Locale) {
                this.setLocale(locale || this.detectLocale());
        }

        private detectLocale(): Locale {
                // Try Obsidian's locale, then browser language, then default.
                // [W2-T01] Гварды: вне DOM-среды (тесты в node-env) window и
                // navigator отсутствуют; localStorage может кидать в privacy-режиме.
                let lang = 'en';
                try {
                        const stored = typeof window !== 'undefined'
                                ? window.localStorage.getItem('language')
                                : null;
                        const nav = typeof navigator !== 'undefined' ? navigator.language : null;
                        lang = stored || nav || 'en';
                } catch {
                        lang = 'en';
                }
                const norm = String(lang).toLowerCase();
                if (norm.startsWith('ru') || norm.startsWith('be') || norm.startsWith('uk')) return 'ru';
                return 'en';
        }

        setLocale(locale: Locale) {
                this.locale = locale;
                this._translations = translations[locale] || translations.en;
        }

        getLocale(): Locale {
                return this.locale;
        }

        // Access translation object — i18n.t.property
        get t(): Translations {
                return this._translations;
        }
}

// Module-level singleton: единственный экземпляр на процесс.
// Замена прежнему `let i18n = new I18n()` в main.ts: импорт константы
// вместо переназначения (ES-модульные bindings доступны только для чтения).
export const i18n = new I18n();

/** Инициализация/смена локали синглтона (вызов из plugin.onload). */
export function setLocale(locale: Locale): void {
        i18n.setLocale(locale);
}

/** Канонический доступ к словарю для новых UI-модулей: t().settHeading. */
export function t(): Translations {
        return i18n.t;
}

/**
 * [W3-T03] Резолвер i18n-пути для schema-driven рендера SettingsTab.
 *
 * Принимает путь вида `'eng.git.repoUrl'` / `'eng.git.branches.all'` /
 * `'eng.zipurl.placeholder'` / `'eng.yandex.label'` и обходит словарь по
 * частям. Используется в SettingsTab, который не знает заранее, какой
 * движок зарегистрирован — `EngineDescriptor.labelKey` / `SettingField.labelKey`
 * / `SettingField.helpKey` / `SettingField.placeholderKey` /
 * `SettingFieldOption.labelKey` — все пути резолвятся через эту функцию.
 *
 * Контракт:
 *   - любой путь состоит из строковых сегментов, разделённых '.'
 *   - пустой путь → возвращает '' (defensive)
 *   - путь не найден в словаре → возвращает САМ КЛЮЧ (fallback): это
 *     упрощает диагностику (видим «eng.gdrive.label» вместо пустоты)
 *   - терминальное значение — строка; иначе (объект/функция) → fallback
 *     на ключ (SettingsTab ожидает строку)
 *   - тип-безопасность: используется `unknown` + `as Record<string, unknown>`
 *     на каждой итерации — TS strict не роняет, рантайм-безопасно
 *
 * НЕ использует `any` — strict-compliant. Тесты i18n.test.ts проверяют
 * парность en/ru словарей, так что если key найден в одном языке — он
 * найден и во втором.
 */
export function resolveLabel(t: Translations, key: string): string {
        if (!key) return '';
        const parts = key.split('.');
        let cur: unknown = t;
        for (const part of parts) {
                if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
                        cur = (cur as Record<string, unknown>)[part];
                } else {
                        return key; // путь не резолвится — вернуть сам ключ как fallback
                }
        }
        return typeof cur === 'string' ? cur : key;
}
