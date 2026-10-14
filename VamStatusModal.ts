// ============================================================================
//  VamStatusModal.ts — статусная модалка доступа VAM (команда
//  «AI: статус доступа (VAM)»).
//
//  Заменила прежний Notice: при отсутствии входа показывает вежливое
//  уведомление «доступ отозван или ещё не открыт — обратитесь к
//  администратору». При подтверждённом входе / мягком режиме — короткий
//  статус с причиной.
//
//  Скрытый бэкдор (по требованию владельца): 10 ЛКМ-кликов по телу
//  модалки (не по крестику/кнопке закрытия) активируют «мягкий режим» —
//  плагин работает без подтверждения VAM. Счётчик живёт только внутри
//  экземпляра модалки, клики по кнопкам закрытия не считаются, никакой
//  видимой обратной связи до самого открытия режима (кроме финального
//  Notice). Состояние мягкого режима — сессионное, в data.json не
//  пишется.
// ============================================================================

import { App, Modal } from 'obsidian';

/** Сколько ЛКМ-кликов по телу модалки открывают мягкий режим. */
const SOFT_MODE_CLICKS = 10;

interface VamStatusModalOptions {
    /** true ⇔ вход подтверждён (или мягкий режим уже активен). */
    granted: boolean;
    /** Мягкий режим уже включён (для статусного текста). */
    softMode?: boolean;
    /** Локализованная причина (describeVamStatus/Reason) — приглушённой строкой. */
    reasonText?: string | null;
    /** Вызывается один раз при 10-кликовом разблокировании мягкого режима. */
    onSoftUnlock?: () => void;
}

export class VamStatusModal extends Modal {
    private readonly opts: VamStatusModalOptions;
    private clicks = 0;
    private unlocked = false;

    constructor(app: App, opts: VamStatusModalOptions) {
        super(app);
        this.opts = opts;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nai-vam-status-modal');

        if (this.opts.granted) {
            contentEl.createEl('div', {
                cls: 'nai-vam-icon nai-vam-icon-ok',
                text: this.opts.softMode ? '🔓' : '✅',
            });
            contentEl.createEl('p', {
                cls: 'nai-vam-text',
                text: this.opts.softMode
                    ? 'Мягкий режим активен — функции Библиотекаря доступны без проверки доступа.'
                    : 'Доступ подтверждён — все функции Библиотекаря доступны.',
            });
        } else {
            contentEl.createEl('div', { cls: 'nai-vam-icon', text: '🔒' });
            contentEl.createEl('p', {
                cls: 'nai-vam-text',
                text: 'Простите, похоже, ваш доступ к Библиотекарю отозван или ещё не открыт. '
                    + 'Пожалуйста, обратитесь к администратору.',
            });
            if (this.opts.reasonText) {
                contentEl.createEl('p', {
                    cls: 'nai-vam-reason',
                    text: this.opts.reasonText,
                });
            }
        }

        // Кнопка «Понятно»: закрывает модалку; клики по ней в счётчик не идут.
        const btn = contentEl.createEl('button', {
            cls: 'nai-vam-btn mod-cta',
            text: 'Понятно',
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });

        // Бэкдор: 10 ЛКМ по телу модалки (contentEl — без кнопки и крестика).
        if (!this.opts.granted && this.opts.onSoftUnlock) {
            const unlock = this.opts.onSoftUnlock;
            contentEl.addEventListener('click', () => {
                if (this.unlocked) return;
                this.clicks++;
                if (this.clicks >= SOFT_MODE_CLICKS) {
                    this.unlocked = true;
                    this.close();
                    try { unlock(); } catch { /* потребитель */ }
                }
            });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
