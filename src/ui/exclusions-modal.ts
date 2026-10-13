import { App, Notice } from 'obsidian';
import type { FileExclusion } from '../sources/types';
import type { PathPolicy } from '../core/path-policy';
import { DraftModal } from './draft-modal';
import { button, element, field, textInput, tr } from './dom';

export class ExclusionsModal extends DraftModal {
    private draft: FileExclusion[];
    private initial: string;
    constructor(app: App, exclusions: FileExclusion[], private paths: PathPolicy, private apply: (value: FileExclusion[]) => void) {
        super(app); this.draft = structuredClone(exclusions); this.initial = JSON.stringify(this.draft);
    }
    protected isDirty(): boolean { return JSON.stringify(this.draft) !== this.initial; }
    onOpen(): void { this.render(); }
    private render(): void {
        const box = this.contentEl; box.replaceChildren(); box.append(element('h3', tr('Исключения файлов', 'File exclusions')));
        box.append(element('p', tr('Маски исключают загрузку и удаление. Обязательные защиты путей, состояния плагина и конфликтных копий действуют независимо.', 'Patterns exclude downloads and deletions. Mandatory path, plugin state and conflict-copy protections remain independent.')));
        for (const exclusion of this.draft) {
            const row = element('div', '', 'sync-assignment-row');
            field(row, tr('Маска', 'Pattern'), textInput(exclusion.pattern, value => exclusion.pattern = value));
            field(row, tr('В папке', 'Within folder'), textInput(exclusion.scope ?? '', value => exclusion.scope = value || undefined), tr('Пусто — весь vault', 'Empty means the whole vault'));
            if (exclusion.note) row.append(element('small', exclusion.note));
            button(row, tr('Убрать исключение', 'Remove exclusion'), () => { this.draft = this.draft.filter(x => x !== exclusion); this.render(); }); box.append(row);
        }
        button(box, tr('Добавить исключение', 'Add exclusion'), () => { this.draft.push({ pattern: '' }); this.render(); });
        button(box, tr('Применить к черновику', 'Apply to draft'), () => {
            try {
                for (const exclusion of this.draft) if (!exclusion.pattern.trim() || (exclusion.scope && !this.paths.isPathSafe(exclusion.scope))) throw Error(tr('Проверьте маску и путь папки', 'Check the pattern and folder path'));
                this.apply(structuredClone(this.draft)); this.acceptClose();
            } catch (error) { new Notice(String(error)); }
        }, 'mod-cta'); button(box, tr('Отмена', 'Cancel'), () => this.close());
    }
}
