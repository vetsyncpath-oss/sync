import { App, Notice } from 'obsidian';
import { EngineRegistry } from '../engines/registry';
import { validateSettings } from '../engines/schema';
import { validateProfiles, type SourceConnection } from '../core/profiles';
import { i18n, resolveLabel } from '../i18n';
import { DraftModal } from './draft-modal';
import { button, element, field, selectInput, textInput, tr } from './dom';
export class SourceConnectionModal extends DraftModal {
    private draft: SourceConnection;
    private readonly initial: string;
    private readonly providers = new Map<string, Record<string, unknown>>();
    private errors = new Map<string, HTMLElement>();
    constructor(app: App, source: SourceConnection, private apply: (source: SourceConnection) => void) {
        super(app); this.draft = structuredClone(source); this.initial = JSON.stringify(this.draft);
    }
    protected isDirty(): boolean { return JSON.stringify(this.draft) !== this.initial; }
    onOpen(): void { this.render(); }
    private render(): void {
        const box = this.contentEl, c = this.draft; box.replaceChildren(); this.errors.clear();
        box.classList.add('sync-connection'); box.append(element('h3', tr('Подключение источника', 'Source connection')));
        const nameRow=field(box, tr('Название', 'Name'), textInput(c.name, value => c.name = value));
        const nameError=element('small','','sync-workspace-error');nameError.setAttribute('role','alert');nameRow.append(nameError);this.errors.set('__name',nameError);
        field(box, tr('Провайдер', 'Provider'), selectInput(EngineRegistry.all().map(d => [d.kind, resolveLabel(i18n.t, d.labelKey) + (d.experimental ? ' · ' + i18n.t.experimentalTag : '')]), c.kind, value => {
            this.providers.set(c.kind, structuredClone(c.values)); c.kind = value as SourceConnection['kind'];
            c.values = structuredClone(this.providers.get(value) ?? (value === 'git' ? { branch: 'default' } : {})); this.render();
        }));
        const descriptor = EngineRegistry.get(c.kind);
        if (descriptor.experimental) box.append(element('p', i18n.t.noticeExperimentalEngine, 'sync-workspace-warning'));
        for (const f of descriptor.settingsSchema) {
            const value = c.values[f.key] ?? f.default; let control: HTMLElement;
            if (f.type === 'toggle') {
                const toggle = element('input'); toggle.type = 'checkbox'; toggle.checked = Boolean(value);
                toggle.addEventListener('change', () => c.values[f.key] = toggle.checked); control = toggle;
            } else if (f.type === 'select') control = selectInput((f.options ?? []).map(o => [o.value, resolveLabel(i18n.t, o.labelKey)]), String(value ?? ''), v => c.values[f.key] = v);
            else {
                const input = textInput(String(value ?? ''), v => c.values[f.key] = f.type === 'number' ? (v === '' ? undefined : Number(v)) : v);
                input.type = f.type === 'secret' || f.secret ? 'password' : f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text';
                if (f.placeholderKey) input.placeholder = resolveLabel(i18n.t, f.placeholderKey);
                input.autocomplete = input.type === 'password' ? 'new-password' : 'off'; control = input;
            }
            const row = field(box, resolveLabel(i18n.t, f.labelKey) + (f.required ? ' *' : ''), control, f.helpKey ? resolveLabel(i18n.t, f.helpKey) : '');
            const error = element('small', '', 'sync-workspace-error'); error.setAttribute('role', 'alert'); row.append(error); this.errors.set(f.key, error);
            if (f.type === 'secret' || f.secret) {
                const reveal = button(row, tr('Показать', 'Show'), () => {
                    const input = control as HTMLInputElement; input.type = input.type === 'password' ? 'text' : 'password';
                    reveal.textContent = input.type === 'password' ? tr('Показать', 'Show') : tr('Скрыть', 'Hide');
                });
            }
        }
        if (c.kind === 'zip-url' || c.kind === 'yandex') box.append(element('p', tr('Просмотр ZIP может скачать весь архив.', 'Browsing ZIP contents may download the whole archive.'), 'sync-workspace-hint'));
        button(box, tr('Применить к черновику', 'Apply to draft'), () => {
            try {
                const next = structuredClone(c);
                for (const f of descriptor.settingsSchema) if (next.values[f.key] === undefined && f.default !== undefined) next.values[f.key] = f.default;
                for (const error of this.errors.values()) { error.textContent = ''; error.parentElement?.querySelector('input, select')?.removeAttribute('aria-invalid'); }
                if(!c.name.trim()){
                    nameError.textContent=tr('Укажите название подключения','Enter a connection name');
                    const input=nameRow.querySelector('input')!;input.setAttribute('aria-invalid','true');input.focus();return;
                }
                const invalid = validateSettings(descriptor.settingsSchema, next.values);
                for (const error of invalid) {
                    const node = this.errors.get(error.field);
                    if (node) { node.textContent = error.code === 'required' ? tr('Обязательное поле', 'Required field') : tr('Проверьте формат значения', 'Check the value format'); node.parentElement?.querySelector('input, select')?.setAttribute('aria-invalid', 'true'); }
                }
                if (invalid.length) { this.errors.get(invalid[0].field)?.parentElement?.querySelector<HTMLElement>('input, select')?.focus(); return; }
                validateProfiles([], [next]); this.apply(structuredClone(c)); this.acceptClose();
            } catch (error) { new Notice(String(error)); }
        }, 'mod-cta');
        button(box, tr('Отмена', 'Cancel'), () => this.close());
    }
}
