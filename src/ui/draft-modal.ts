import { Modal } from 'obsidian';
import { button, element, tr } from './dom';
import { isForceClosingModals, trackModal } from './modal-registry';
/** Escape, backdrop and Close share the same draft contract. */
export abstract class DraftModal extends Modal {
    private closeApproved = false;
    private prompt?: Modal;
    protected abstract isDirty(): boolean;
    protected saveDraft?(): Promise<void>;
    protected acceptClose(): void { this.closeApproved = true; this.close(); }
    close(): void {
        if (this.closeApproved || isForceClosingModals() || !this.isDirty()) { this.prompt?.close(); super.close(); return; }
        if (this.prompt) return;
        const modal = new Modal(this.app); this.prompt = modal;
        modal.contentEl.append(element('p', tr('Есть несохранённые изменения.', 'There are unsaved changes.')));
        if (this.saveDraft) button(modal.contentEl, tr('Сохранить', 'Save'), () => { modal.close(); void this.saveDraft!(); });
        button(modal.contentEl, tr('Отбросить', 'Discard'), () => { modal.close(); this.acceptClose(); });
        button(modal.contentEl, tr('Вернуться', 'Return'), () => modal.close());
        modal.onClose = () => { this.prompt = undefined; }; trackModal(modal); modal.open();
    }
}
