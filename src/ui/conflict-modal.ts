import { App, Modal } from 'obsidian';
import type { ConflictChoice, ConflictInfo } from '../sources/types';
import { button, element, tr } from './dom';
export class ConflictAskModal extends Modal {
    private resolved = false;
    private resolver?: (choice: ConflictChoice) => void;
    constructor(app: App, private readonly info: ConflictInfo) { super(app); }
    onOpen(): void {
        const box = this.contentEl; box.replaceChildren();
        box.append(element('h2', tr('Локальный файл изменён', 'Local file changed')), element('code', this.info.path));
        box.append(element('p', tr('Выберите, какая версия останется на основном пути. Закрытие оставит конфликт нерешённым.', 'Choose which version stays at the original path. Closing leaves this conflict unresolved.')));
        box.append(element('p', tr('Локальный', 'Local') + ': ' + this.info.localSize + ' B · ' + tr('Источник', 'Source') + ': ' + this.info.remoteSize + ' B'));
        button(box, tr('Версия источника; локальную сохранить в копию', 'Apply source; keep local copy'), () => this.resolve('keep-both'));
        button(box, tr('Оставить локальную; входящую сохранить в копию', 'Keep local; save incoming copy'), () => this.resolve('incoming'));
        button(box, tr('Оставить локальную; пропустить входящую', 'Keep local; skip incoming'), () => this.resolve('local-wins'));
        button(box, tr('Решить позже', 'Decide later'), () => this.resolve('defer'));
    }
    wait(): Promise<ConflictChoice> { return new Promise(resolve => { this.resolver = resolve; this.open(); }); }
    onClose(): void { if (!this.resolved) { this.resolved = true; this.resolver?.('defer'); } }
    private resolve(choice: ConflictChoice): void { if (this.resolved) return; this.resolved = true; this.resolver?.(choice); this.close(); }
}
