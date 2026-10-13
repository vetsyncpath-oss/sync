// Access status is informational. Hidden gestures cannot change authorization.
import { App, Modal } from 'obsidian';
import { i18n } from '../i18n';

interface VamStatusModalOptions {
    /** true ⇔ вход подтверждён (или мягкий режим уже активен). */
    granted: boolean;
    /** Мягкий режим уже включён (для статусного текста). */
    softMode?: boolean;
    /** Локализованная причина (describeVamStatus/Reason) — приглушённой строкой. */
    reasonText?: string | null;
}

export class VamStatusModal extends Modal {
    private readonly opts: VamStatusModalOptions;

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

    }
}
