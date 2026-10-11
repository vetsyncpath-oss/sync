import { Notice, Setting } from 'obsidian';
import { PLUGIN_CODE_FILES, resolveFileRule, validateFileRules, type FileRule, type WriteMode, type DeleteMode } from '../core/file-rules';

/** Edits a draft; only Apply persists it. Settings are scoped to the captured source. */
export function renderFileRulesEditor(host: HTMLElement, options: {
    rules?: FileRule[]; ru: boolean; save(rules: FileRule[]): Promise<void>;
}): void {
    const text = (ru: string, en: string) => options.ru ? ru : en;
    const box = host.createDiv();
    const rules = structuredClone(options.rules ?? []);
    const writeLabels: Record<WriteMode, string> = {
        preserve: text('Не трогать (включая удаления)', 'Do not touch (including deletion)'),
        create: text('Добавлять только отсутствующие', 'Create missing files only'),
        update: text('Обновлять, если нет локальных изменений', 'Update if unchanged locally'),
        remote: text('Приводить к версии источника', 'Match source content'),
    };
    const deleteLabels: Record<DeleteMode, string> = {
        keep: text('Сохранять', 'Keep'), tracked: text('Удалять ранее синхронизированные', 'Delete previously synced files'),
        mirror: text('Удалять все отсутствующие в источнике', 'Delete all files absent from source'),
    };
    const draw = () => {
        box.empty();
        box.createEl('h3', { text: text('Правила записи и удаления', 'Write and deletion rules') });
        box.createEl('p', { text: text(
            'Для текущего источника. Приоритет: vault → папка → вложенная папка → файл. Фильтр имён уточняет область. Среди одинаково конкретных правил побеждает последнее, отдельно для записи и удаления. Пути — относительно vault после переименований.',
            'For this source. Priority: vault → folder → nested folder → file. Name filters refine a scope. Last equally specific rule wins independently for writes and deletions. Paths are relative to the vault, after mappings.') });
        box.createEl('p', { text: text(
            'Без правила действуют прежние режимы. Исключения и разрешения на код имеют приоритет. «Обновлять» пропускает локальные изменения; «Приводить» восстанавливает версию источника даже без нового релиза. Фоновые удаления по-прежнему требуют ручного запуска.',
            'Without a rule, legacy modes apply. Exclusions and code permissions take priority. Update skips local edits; Match source also repairs local edits without a new release. Background deletions still await a manual run.') });
        rules.forEach((rule, index) => {
            const row = box.createDiv();
            new Setting(row).setName(`${text('Правило', 'Rule')} ${index + 1}`).addDropdown(dd => dd
                .addOption('vault', text('Весь vault', 'Entire vault')).addOption('folder', text('Папка', 'Folder')).addOption('file', text('Файл', 'File'))
                .setValue(rule.scope).onChange(v => { rule.scope = v as FileRule['scope']; if (v === 'vault') rule.path = ''; if (v === 'file') delete rule.names; draw(); }))
                .addButton(b => b.setButtonText(text('Удалить правило', 'Remove rule')).onClick(() => { rules.splice(index, 1); draw(); }));
            if (rule.scope !== 'vault') new Setting(row).setName(text('Путь', 'Path')).addText(t => t.setValue(rule.path)
                .setPlaceholder(rule.scope === 'folder' ? '.obsidian/plugins' : '.obsidian/plugins/example/data.json').onChange(v => { rule.path = v.trim(); }));
            if (rule.scope !== 'file') {
                new Setting(row).setName(text('Быстрый выбор файлов', 'Quick file selection'))
                    .addButton(b => b.setButtonText(text('Все файлы', 'All files')).onClick(() => { delete rule.names; draw(); }))
                    .addButton(b => b.setButtonText(text('Код плагинов', 'Plugin code')).onClick(() => { rule.names = [...PLUGIN_CODE_FILES]; draw(); }))
                    .addButton(b => b.setButtonText('data.json').onClick(() => { rule.names = ['data.json']; draw(); }));
                new Setting(row).setName(text('Имена через запятую; пусто — все', 'Names separated by commas; empty means all'))
                    .addText(t => t.setValue(rule.names?.join(', ') ?? '').onChange(v => {
                        const names = v.split(',').map(n => n.trim()).filter(Boolean); rule.names = names.length ? names : undefined;
                    }));
            }
            new Setting(row).setName(text('Запись', 'Writes')).addDropdown(dd => {
                dd.addOption('', text('Наследовать', 'Inherit'));
                for (const [key, label] of Object.entries(writeLabels)) dd.addOption(key, label);
                dd.setValue(rule.write ?? '').onChange(v => { rule.write = (v || undefined) as WriteMode | undefined; });
            });
            new Setting(row).setName(text('Если файла нет в источнике', 'When absent from source')).addDropdown(dd => {
                dd.addOption('', text('Наследовать', 'Inherit'));
                for (const [key, label] of Object.entries(deleteLabels)) dd.addOption(key, label);
                dd.setValue(rule.delete ?? '').onChange(v => { rule.delete = (v || undefined) as DeleteMode | undefined; });
            });
        });
        new Setting(box).addButton(b => b.setButtonText(text('Добавить правило', 'Add rule')).onClick(() => {
            rules.push({ scope: 'vault', path: '', write: 'preserve', delete: 'keep' }); draw();
        }));
        let previewPath = '';
        const preview = box.createEl('p');
        new Setting(box).setName(text('Проверить правило для пути', 'Check rule for a path'))
            .addText(t => t.setPlaceholder('.obsidian/plugins/example/data.json').onChange(v => { previewPath = v.trim(); }))
            .addButton(b => b.setButtonText(text('Проверить', 'Check')).onClick(() => {
                try {
                    validateFileRules(rules);
                    const r = resolveFileRule(previewPath, rules), inherited = text('прежний режим', 'legacy mode');
                    const source = (i?: number) => i === undefined ? '' : ` (#${i + 1})`;
                    preview.setText(`${text('Запись', 'Write')}: ${r.write ? writeLabels[r.write] : inherited}${source(r.writeRule)}; `
                        + `${text('Удаления', 'Deletion')}: ${r.delete ? deleteLabels[r.delete] : inherited}${source(r.write === 'preserve' ? r.writeRule : r.deleteRule)}. `
                        + text('Область синхронизации, исключения и разрешения проверяются отдельно.', 'Sync scope, exclusions and permissions are checked separately.'));
                } catch (e) { preview.setText(String(e)); }
            }));
        new Setting(box).addButton(b => b.setButtonText(text('Применить правила', 'Apply rules')).setCta().onClick(async () => {
            try { validateFileRules(rules); b.setDisabled(true); await options.save(structuredClone(rules)); new Notice(text('Правила сохранены', 'Rules saved')); }
            catch (e) { new Notice(String(e)); }
            finally { b.setDisabled(false); }
        })).addButton(b => b.setButtonText(text('Сбросить несохранённые изменения', 'Discard unsaved edits')).onClick(() => {
            rules.splice(0, rules.length, ...structuredClone(options.rules ?? [])); draw();
        }));
    };
    draw();
}
