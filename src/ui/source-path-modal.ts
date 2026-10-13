import { App, Modal } from 'obsidian';
import type { RemoteEntry } from '../sources/types';
import { validateManifest } from '../core/source-validation';
import { buildRemoteTree, type TreeNode } from './tree-walk';
import { button, element, textInput, tr } from './dom';

export class SourcePathModal extends Modal {
    private entries: RemoteEntry[];
    private query = ''; private page = 0; private error = ''; private loading = false; private closed = false;
    private focused?:string;
    private readonly controller = new AbortController();
    private list!: HTMLElement;
    constructor(app: App, private name: string, private kind: 'file' | 'folder', entries: RemoteEntry[], private status: string,
        private fetch: (signal: AbortSignal) => Promise<RemoteEntry[]>, private choose: (path: string) => void) {
        super(app); this.entries = structuredClone(entries);
    }
    onOpen(): void {
        const box = this.contentEl; box.replaceChildren(); box.append(element('h3', this.name));
        const search = textInput('', value => { this.query = value; this.page = 0; this.render(); }); search.type = 'search'; search.placeholder = tr('Найти путь', 'Find path'); search.setAttribute('aria-label', search.placeholder); box.append(search);
        button(box, tr('Обновить содержимое', 'Refresh contents'), () => void this.refresh());
        this.list = element('div'); box.append(this.list); button(box, tr('Отмена', 'Cancel'), () => this.close()); this.render();
        if (!this.entries.length && this.status !== 'ready') void this.refresh();
    }
    private async refresh(): Promise<void> {
        if (this.loading) return; this.loading = true; this.error = ''; this.render();
        try { const result = await this.fetch(this.controller.signal); validateManifest(result); if (this.closed) return; this.entries = result; this.status = 'ready'; }
        catch (error) { if (!this.closed) this.error = String(error); }
        finally { this.loading = false; if (!this.closed) this.render(); }
    }
    private render(): void {
        if (!this.list || this.closed) return; this.list.replaceChildren();
        if (this.loading) this.list.append(element('p', tr('Загрузка…', 'Loading…')));
        if (this.error) this.list.append(element('p', this.error, 'sync-workspace-error'));
        if (this.status !== 'ready' && this.entries.length) this.list.append(element('p', tr('Показан прежний снимок. Перед запуском содержимое будет проверено снова.', 'Showing a previous snapshot. Contents will be checked again before execution.')));
        const paths: string[] = [], visit = (node: TreeNode) => { if (node.kind === this.kind) paths.push(node.path); for (const child of node.children) visit(child); }; visit(buildRemoteTree(this.entries));
        const matches = paths.filter(path => path.toLowerCase().includes(this.query.toLowerCase())).sort();
        const list = element('div', '', 'sync-path-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', this.name);
        const visible = matches.slice(this.page * 150, (this.page + 1) * 150);
        const focus=this.focused!==undefined&&visible.includes(this.focused)?this.focused:visible[0];
        for (const path of visible) {
            const row = element('div', path || tr('Корень', 'Root'), 'sync-path-option'); row.tabIndex = path===focus?0:-1; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false');
            row.addEventListener('focus',()=>{this.focused=path;for(const item of Array.from(list.children))(item as HTMLElement).tabIndex=item===row?0:-1;});
            const choose = () => { this.choose(path); this.close(); };
            row.addEventListener('click', choose); row.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = (event.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null; next?.focus(); }
                if(event.key==='Home'||event.key==='End'){event.preventDefault();const target=(event.key==='Home'?list.firstElementChild:list.lastElementChild) as HTMLElement|null;target?.focus();}
            }); list.append(row);
        }
        this.list.append(list);
        if (matches.length > 150) {
            button(this.list, tr('Назад', 'Previous'), () => { this.page--; this.render(); }).disabled = this.page === 0;
            this.list.append(element('span', (this.page + 1) + ' / ' + Math.ceil(matches.length / 150)));
            button(this.list, tr('Далее', 'Next'), () => { this.page++; this.render(); }).disabled = (this.page + 1) * 150 >= matches.length;
        }
        if (!visible.length) this.list.append(element('p', tr('Нет подходящих путей', 'No matching paths')));
    }
    onClose(): void { this.closed = true; this.controller.abort(); }
}
