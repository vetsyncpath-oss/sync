// ============================================================================
//  src/ui/vam-status-modal.ts — статусная модалка доступа VAM (команда
//  «Статус доступа (VAM)» / кнопка в Диагностике настроек).
//
//  Адаптация VamStatusModal.ts из плагина Note AI Assistant (донор): та же
//  логика и тот же скрытый бэкдор, тексты — через i18n (vam.*), классы —
//  git-sync-vam-* (дизайн-токены плагина, var(--*)).
//
//  При отсутствии входа показывает вежливое уведомление «доступ отозван
//  или ещё не открыт — обратитесь к администратору». При подтверждённом
//  входе / мягком режиме — короткий статус с причиной.
//
//  Скрытый бэкдор (существует по требованию владельца проекта): 10 ЛКМ-
//  кликов по телу модалки (не по крестику/кнопке закрытия) активируют
//  «мягкий режим» — плагин работает без подтверждения VAM.
//  [overhaul S1/H-2] жест ПУБЛИЧЕН: работает у любого пользователя,
//  знающего о нём; по умолчанию о его существовании никто не знает — в
//  UI, командах и строках i18n он нигде не упоминается. Счётчик живёт
//  только внутри экземпляра модалки, клики по кнопкам закрытия не
//  считаются, никакой видимой обратной связи до самого открытия режима
//  (кроме финального Notice). Состояние мягкого режима — сессионное,
//  в data.json не пишется.
// ============================================================================

import { App, Modal } from 'obsidian';
import { i18n } from '../i18n';

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
        const v = i18n.t.vam;
        contentEl.empty();
        contentEl.addClass('git-sync-vam-status-modal');

        if (this.opts.granted) {
            contentEl.createEl('div', {
                cls: 'git-sync-vam-icon git-sync-vam-icon-ok',
                text: this.opts.softMode ? '🔓' : '✅',
            });
            contentEl.createEl('p', {
                cls: 'git-sync-vam-text',
                text: this.opts.softMode ? v.modalGrantedSoft : v.modalGranted,
            });
        } else {
            contentEl.createEl('div', { cls: 'git-sync-vam-icon', text: '🔒' });
            contentEl.createEl('p', {
                cls: 'git-sync-vam-text',
                text: v.modalDenied,
            });
            if (this.opts.reasonText) {
                contentEl.createEl('p', {
                    cls: 'git-sync-vam-reason',
                    text: this.opts.reasonText,
                });
            }
        }

        // Кнопка «Понятно»: закрывает модалку; клики по ней в счётчик не идут.
        const btn = contentEl.createEl('button', {
            cls: 'git-sync-vam-btn mod-cta',
            text: v.modalOkBtn,
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });

        // Бэкдор: 10 ЛКМ по телу модалки (contentEl — без кнопки и крестика).
        // unlock — локальная константа: сужение типа переживает отложенный
        // колбэк (TS2722 иначе расширяет optional назад в undefined).
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
