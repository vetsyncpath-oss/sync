import { App, Modal, Notice } from 'obsidian';
import { compileProfiles, validateProfiles, participatingSources, type ProfileAssignment, type SourceConnection, type SyncProfile } from '../core/profiles';
import { connectionIssues } from '../engines/connection-validation';
import { resolveFileRule, PLUGIN_CODE_FILES } from '../core/file-rules';
import { computeLocalPath, type SyncPolicy, type FolderPolicy } from '../core/policy';
import { pathState, scopeMode, setScope, setParticipation, type ScopeMode } from '../core/workspace-state';
import type { PathPolicy } from '../core/path-policy';
import { sourceCandidates } from '../core/source-bindings';
import { buildLocalTree, buildRemoteTree, buildBrowseTree, treeNodeKey, sortChildren, type TreeNode } from './tree-walk';
import type { SourceBrowseResult, RemoteBrowseNode } from '../sources/remote-browse';
import { SourceInventories } from './source-inventories';
import { SourceConnectionModal } from './source-connection-modal';
import { trackModal } from './modal-registry';
import { writeLabel, deleteLabel, profileName, ProfileLibraryModal } from './profile-library';
import { DraftModal } from './draft-modal';
import { button, element, field, selectInput, setSelectValue, textInput, tr } from './dom';
import { ExclusionsModal } from './exclusions-modal';
import { SourcePathModal } from './source-path-modal';
import type { GoogleConnectionActions } from './gdrive-folder-picker';

export interface WorkspaceDeps {
    google?: GoogleConnectionActions;
    policy: SyncPolicy; profiles: SyncProfile[]; connections: SourceConnection[];
    pathPolicy: PathPolicy; pluginDir: string; isRunning(): boolean;
    local(): Promise<{ files: string[]; folders: string[] }>;
    fetch(connection: SourceConnection, signal: AbortSignal): Promise<SourceBrowseResult>;
    checkDownload?(connection:SourceConnection,signal:AbortSignal):Promise<void>;
    check?(connection: SourceConnection, signal: AbortSignal): Promise<void>;
    run?(sourceIds?: string[]): Promise<void>;
    profilesLibrary?(): void;
    recovery?(): void;
    save(policy: SyncPolicy, connections: SourceConnection[], profiles?: SyncProfile[]): Promise<void>;
    dispose(): void;
}
interface FormValues {
    destination: string; source: string; remotePath: string; profile: string; names: string;
    participation: FolderPolicy['include']; mapping: string; mappingKind: 'rename' | 'move';
}
interface AssignmentForm {
    remoteKey?: string;
    scope: ProfileAssignment['scope']; path: string; view: string; originalNames?: string[];
    value: FormValues; initial: string; paths: Map<string, string>;
    record?:string;
}
interface ViewContext { selected: { scope: ProfileAssignment['scope']; path: string; key?: string }; expanded: Set<string>; search: string; page: number; focus: string; editingNames?:string[]; }
const selector = (names?: string[]) => JSON.stringify([...(names ?? [])].map(n => n.normalize('NFC').toLowerCase()).sort());
// An impossible persisted selector identifies a new rule without consuming the existing all-files rule.
const NEW_SELECTOR=[''];
const namesOf = (value: string) => value.split(',').map(n => n.trim()).filter(Boolean);
const formKey = (view: string, scope: string, path: string, names?: string[]) => JSON.stringify([view, scope, path, selector(names)]);
const formIndex = (form:AssignmentForm) => formKey(form.view,form.scope,form.view==='vault'?form.path:form.remoteKey??form.path,form.originalNames);

export class SyncWorkspaceModal extends DraftModal {
    private policy: SyncPolicy;
    private connections: SourceConnection[];
    private profiles: SyncProfile[];
    private savedProfiles: SyncProfile[];
    private savedPolicy: SyncPolicy;
    private savedConnections: SourceConnection[];
    private initial: string;
    private readonly inventories = new SourceInventories();
    private readonly forms = new Map<string, AssignmentForm>();
    private readonly contexts = new Map<string, ViewContext>();
    private readonly checks = new Map<string, { loading: boolean; message: string }>();
    private localFiles: string[] = [];
    private localFolders: string[] = [];
    private localState = 'loading'; private localError = '';
    private view = 'vault';
    private context: ViewContext = { selected: { scope: 'vault', path: '' }, expanded: new Set(['']), search: '', page: 0, focus: '' };
    private selection = new Map<string, 'folder' | 'file'>();
    private get editingNames():string[]|undefined{return this.context.editingNames;}
    private set editingNames(value:string[]|undefined){this.context.editingNames=value;}
    private closed = false; private saving = false;
    private readonly controller = new AbortController();
    private treeBox!: HTMLElement; private inspector!: HTMLElement; private sourceBox!: HTMLElement; private summary!: HTMLElement;
    private scopeSelect!: HTMLSelectElement; private searchInput!: HTMLInputElement;
    private saveButton!: HTMLButtonElement; private runButton?: HTMLButtonElement; private bulkButton!: HTMLButtonElement;
    constructor(app: App, private readonly deps: WorkspaceDeps) {
        super(app); this.policy = structuredClone(deps.policy); this.connections = structuredClone(deps.connections);
        this.profiles=structuredClone(deps.profiles); this.savedProfiles=structuredClone(this.profiles);
        this.savedPolicy = structuredClone(this.policy); this.savedConnections = structuredClone(this.connections); this.initial = this.fingerprint();
    }
    private fingerprint(): string {
        const pending = [...this.forms].filter(([, f]) => JSON.stringify(f.value) !== f.initial).map(([key, f]) => [key, f.value]);
        return JSON.stringify([this.policy, this.connections, this.profiles, pending]);
    }
    protected isDirty(): boolean { return this.fingerprint() !== this.initial; }
    protected async saveDraft(): Promise<void> { await this.save(); }
    onOpen(): void {
        if (this.modalEl) { this.modalEl.style.width = 'min(1180px, 96vw)'; this.modalEl.style.maxWidth = '96vw'; }
        const box = this.contentEl; box.replaceChildren(); box.classList.add('sync-workspace');
        box.dataset.pane = 'tree';
        const heading = element('div', '', 'sync-workspace-heading');
        heading.append(element('h2', tr('Синхронизация vault', 'Vault synchronization')), element('small', tr('Источник → vault. Для OAuth Drive можно назначить двусторонний профиль.', 'Source → vault. OAuth Drive also supports a bidirectional profile.'))); box.append(heading);
        const toolbar = element('div', '', 'sync-workspace-toolbar');
        button(toolbar, 'Vault', () => this.switchView('vault'));
        button(toolbar, tr('Добавить источник', 'Add source'), () => this.editSource());
        button(toolbar, tr('Обновить локальное дерево', 'Refresh local tree'), () => void this.loadLocal());
        this.scopeSelect = selectInput([['full', tr('Весь vault', 'Entire vault')], ['obsidian', tr('Настройки Obsidian', 'Obsidian configuration')], ['custom', tr('Выбранные области', 'Selected scopes')]], scopeMode(this.policy), value => {
            // Record participation choices before switching their active scope; unfinished connection fields stay in their forms.
            for(const form of this.forms.values()){
                const initial=JSON.parse(form.initial) as FormValues;
                if(form.view==='vault'&&form.value.participation!==initial.participation&&this.deps.pathPolicy.isPathSafe(form.value.destination)){
                    this.policy=setParticipation(this.policy,form.value.destination,form.value.participation);
                    form.initial=JSON.stringify({...initial,participation:form.value.participation});
                }
            }
            this.policy = setScope(this.policy, value as ScopeMode); this.render();
        });
        field(toolbar, tr('Область синхронизации', 'Sync scope'), this.scopeSelect);
        button(toolbar, tr('Исключения', 'Exclusions'), () => this.editExclusions());
        this.searchInput = textInput('', value => { this.context.search = value; this.context.page = 0; this.renderTree(); });
        this.searchInput.type = 'search'; this.searchInput.placeholder = tr('Найти путь', 'Find path'); this.searchInput.setAttribute('aria-label', this.searchInput.placeholder); toolbar.append(this.searchInput); box.append(toolbar);
        const layout = element('div', '', 'sync-workspace-layout');
        const tabs = element('div', '', 'sync-workspace-mobile-tabs');
        for (const [pane, label] of [['sources', tr('Источники', 'Sources')], ['tree', tr('Файлы', 'Files')], ['inspector', tr('Назначение', 'Assignment')]]) {
            const tab=button(tabs,label,()=>{ box.dataset.pane=pane; for(const child of Array.from(tabs.children))child.setAttribute('aria-pressed',String((child as HTMLElement).dataset.pane===pane)); });
            tab.dataset.pane=pane; tab.setAttribute('aria-pressed',String(pane==='tree'));
        }
        box.append(tabs);
        this.sourceBox = element('nav', '', 'sync-workspace-sources'); this.sourceBox.setAttribute('aria-label', tr('Источники', 'Sources'));
        this.treeBox = element('div', '', 'sync-workspace-tree'); this.inspector = element('section', '', 'sync-workspace-inspector');
        layout.append(this.sourceBox, this.treeBox, this.inspector); box.append(layout);
        const footer = element('div', '', 'sync-workspace-footer'); this.summary = element('p'); this.summary.setAttribute('role', 'status'); footer.append(this.summary);
        this.bulkButton = button(footer, tr('Профиль выделенным', 'Profile for selection'), () => this.bulkProfiles());
        button(footer, tr('Сбросить черновик', 'Reset draft'), () => { this.policy = structuredClone(this.savedPolicy); this.connections = structuredClone(this.savedConnections); this.profiles=structuredClone(this.savedProfiles); this.forms.clear(); this.render(); }, 'sync-workspace-reset');
        this.saveButton = button(footer, tr('Сохранить настройки', 'Save settings'), () => void this.save(), 'mod-cta');
        if (this.deps.run) this.runButton = button(footer, tr('Запустить синхронизацию', 'Run synchronization'), () => void this.preview());
        button(footer, tr('Закрыть', 'Close'), () => this.close()); box.append(footer);
        this.render(); void this.loadLocal();
        const connection = this.connections.find(c => c.id === this.policy.defaultSource); if (connection) void this.loadSource(connection);
    }
    private render(): void {
        if (this.closed) return;
        setSelectValue(this.scopeSelect,scopeMode(this.policy)); this.searchInput.value = this.context.search;
        this.renderSources(); this.renderTree(); this.renderInspector(); this.renderSummary();
    }
    private renderSummary(): void {
        if (!this.summary) return;
        this.summary.textContent = (this.isDirty() ? tr('Есть несохранённые изменения', 'Unsaved changes') : tr('Сохранено', 'Saved')) +
            ' · ' + tr('Назначения', 'Assignments') + ': ' + (this.policy.assignments?.length ?? 0) +
            ' · ' + tr('Выделено для редактирования', 'Selected for editing') + ': ' + this.selection.size;
        const busy = this.saving || this.deps.isRunning();
        this.saveButton.disabled = busy; this.bulkButton.hidden = this.view !== 'vault' || this.selection.size === 0;
        if (this.runButton) { this.runButton.disabled = busy || this.isDirty(); this.runButton.title = this.isDirty() ? tr('Сначала сохраните настройки', 'Save settings first') : ''; }
        const needed=participatingSources(compileProfiles(this.policy,this.profiles));
        for(const action of Array.from(this.sourceBox.querySelectorAll<HTMLButtonElement>('[data-run-source]')))action.disabled=busy||this.isDirty()||!needed.includes(action.dataset.runSource!);
        if(this.runButton && !needed.length){this.runButton.disabled=true;this.runButton.title=tr('Назначьте источник vault, папке или файлу','Assign a source to the vault, a folder or a file');}
    }
    private renderSources(): void {
        if (!this.sourceBox) return; this.sourceBox.replaceChildren();
        this.sourceBox.append(element('h3', tr('Подключения', 'Connections')));
        field(this.sourceBox, tr('Общий источник', 'Default source'), selectInput([
            ['', tr('Только назначения', 'Assignments only')], ...this.connections.map(c => [c.id, c.name] as const),
        ], this.policy.defaultSource ?? '', value => { this.policy.defaultSource = value || undefined; this.render(); }),
            tr('Применяется там, где нет собственного источника.', 'Used where no source is assigned.'));
        const rootSource=compileProfiles(this.policy,this.profiles).fileRules?.find(rule=>rule.scope==='vault'&&!rule.names&&rule.source)?.source;
        if(rootSource)this.sourceBox.append(element('small',tr('Корню vault явно назначен: ','Vault root has an explicit source: ')+(this.connections.find(c=>c.id===rootSource)?.name??rootSource)));
        for (const c of this.connections) {
            const state = this.inventories.state(c.id), group = element('div', '', 'sync-workspace-source');
            const choose = button(group, c.name + (c.id === this.policy.defaultSource ? tr(' · по умолчанию', ' · default') : ''), () => this.switchView(c.id));
            choose.setAttribute('aria-pressed', String(this.view === c.id));
            group.append(element('small', c.kind + ' · ' + (state.status === 'loading' ? tr('Загрузка…', 'Loading…') : state.status === 'error' ? (state.loadedAt ? tr('Снимок устарел', 'Stale snapshot') : tr('Ошибка загрузки', 'Load failed')) :
                state.loadedAt ? tr('Снимок: ', 'Snapshot: ') + new Date(state.loadedAt).toLocaleString() : tr('Не загружен', 'Not loaded'))));
            group.append(element('small',tr('Авто: ','Auto: ')+(c.auto==='off'?tr('только вручную','manual only'):c.auto??tr('общий интервал','global interval'))));
            const check = this.checks.get(c.id); if (check) group.append(element('small', check.loading ? tr('Проверка доступа…', 'Checking access…') : check.message));
            const actions = element('details', '', 'sync-source-actions'); actions.append(element('summary', tr('Действия', 'Actions')));
            button(actions, tr('Настроить', 'Configure'), () => this.editSource(c));
            if (this.deps.check) button(actions, tr('Проверить доступ к каталогу', 'Check inventory access'), () => void this.checkSource(c));
            if(this.deps.checkDownload)button(actions,tr('Проверить пробную загрузку','Test a sample download'),()=>void this.checkSource(c,true));
            button(actions, tr('Обновить содержимое', 'Refresh contents'), () => void this.loadSource(c)).disabled = state.status === 'loading';
            if (state.status === 'loading') button(actions, tr('Отменить загрузку', 'Cancel loading'), () => { this.inventories.cancel(c.id); this.renderSources(); this.renderTree(); });
            button(actions, tr('Сделать общим источником', 'Set as default source'), () => { this.policy.defaultSource = c.id; this.render(); });
            if (this.deps.run) {const run=button(actions, tr('Синхронизировать этот источник', 'Sync this source'), () => void this.preview([c.id]));run.dataset.runSource=c.id;run.disabled=this.isDirty()||this.deps.isRunning();}
            button(actions, tr('Удалить подключение', 'Remove connection'), () => {
                const compiled = compileProfiles(this.policy, this.profiles);
                if (this.policy.defaultSource === c.id || compiled.fileRules?.some(r => r.source === c.id) || [...this.forms.values()].some(form=>form.value.source===c.id)) { new Notice(tr('Подключение используется. Сначала измените назначения.', 'Connection is used. Change its assignments first.')); return; }
                this.inventories.invalidate(c.id); this.connections = this.connections.filter(x => x.id !== c.id);
                if (this.view === c.id) this.switchView('vault'); else this.render();
            }); group.append(actions); this.sourceBox.append(group);
        }
        if (!this.connections.length) this.sourceBox.append(element('p', tr('Добавьте источник, затем назначьте его vault или папке.', 'Add a source, then assign it to the vault or a folder.')));
        button(this.sourceBox, tr('Библиотека профилей', 'Profile library'), () => this.editLibrary());
        if (this.deps.recovery) button(this.sourceBox, tr('Восстановление', 'Recovery'), () => this.deps.recovery!());
    }
    private switchView(view: string): void {
        this.contentEl.dataset.pane='tree';
        for(const tab of Array.from(this.contentEl.querySelectorAll<HTMLElement>('.sync-workspace-mobile-tabs button')))tab.setAttribute('aria-pressed',String(tab.dataset.pane==='tree'));
        this.contexts.set(this.view, this.context); this.view = view;
        this.context = this.contexts.get(view) ?? { selected: { scope: 'vault', path: '' }, expanded: new Set(['']), search: '', page: 0, focus: '' };
        this.render(); const connection = this.connections.find(c => c.id === view);
        if (connection && this.inventories.state(view).status === 'idle') void this.loadSource(connection);
    }
    private async loadLocal(): Promise<void> {
        this.localState = 'loading'; this.localError = ''; this.renderTree();
        try { const result = await this.deps.local(); if (this.closed) return; this.localFiles = result.files; this.localFolders = result.folders; this.localState = 'ready'; }
        catch (error) { if (this.closed) return; this.localState = 'error'; this.localError = String(error); }
        this.renderTree(); this.renderSummary();
    }
    private async loadSource(c: SourceConnection): Promise<void> {
        const pending = this.inventories.load(c.id, signal => this.deps.fetch(structuredClone(c), signal)); this.renderSources(); this.renderTree();
        await pending; if (!this.closed) { this.renderSources(); this.renderTree(); this.renderInspector(); }
    }
    private async checkSource(c: SourceConnection,sample=false): Promise<void> {
        if (!this.deps.check || this.checks.get(c.id)?.loading) return;
        this.checks.set(c.id, { loading: true, message: '' }); this.renderSources();
        try { await (sample?this.deps.checkDownload!:this.deps.check!)(structuredClone(c), this.controller.signal); this.checks.set(c.id, { loading: false, message:sample?tr('Пробный файл получен и проверен; vault не изменён','Sample file received and verified; vault unchanged'):tr('Доступ к каталогу подтверждён; загрузка файлов не проверялась','Inventory accessible; file downloads not tested') }); }
        catch (error) { this.checks.set(c.id, { loading: false, message: String(error) }); }
        if (!this.closed) this.renderSources();
    }
    private editSource(source?: SourceConnection): void {
        const modal = new SourceConnectionModal(this.app, source ?? { id: crypto.randomUUID(), name: '', kind: 'git', values: { branch: 'default' } }, draft => {
            const index = this.connections.findIndex(c => c.id === draft.id);
            if (index < 0) this.connections.push(draft); else this.connections[index] = draft;
            this.inventories.invalidate(draft.id); this.checks.delete(draft.id); this.render();
        },this.deps.google); trackModal(modal); modal.open();
    }
    private mapped(path: string): string {
        const rule = this.policy.folders.filter(r => r.target && (!r.path || path === r.path || path.startsWith(r.path + '/'))).sort((a, b) => b.path.length - a.path.length)[0];
        return rule ? computeLocalPath(path, rule.path, rule) : path;
    }
    private projected(compiled: SyncPolicy): Map<string, string> {
        const result = new Map<string, string>(), rules = compiled.fileRules ?? [];
        for (const c of this.connections) for (const entry of this.inventories.state(c.id).entries)
            for (const path of sourceCandidates(entry.path, c.id, rules, this.policy.defaultSource ?? '', p => this.mapped(p))) {
                const local = resolveFileRule(path, rules).remotePath !== undefined ? path : this.mapped(path);
                if (!result.has(local)) result.set(local, c.id);
            }
        return result;
    }
    private renderTree(): void {
        if (!this.treeBox || this.closed) return;
        const wasFocused = this.treeBox.contains(document.activeElement); this.treeBox.replaceChildren();
        const remote = this.view !== 'vault', compiled = compileProfiles(this.policy, this.profiles), projected = remote ? new Map<string, string>() : this.projected(compiled);
        this.treeBox.append(element('h3', remote ? this.connections.find(c => c.id === this.view)?.name ?? '' : 'Vault'));
        if (!remote && this.localState === 'loading') this.treeBox.append(element('p', tr('Читаем локальный vault…', 'Reading local vault…')));
        if (!remote && this.localError) this.treeBox.append(element('p', this.localError, 'sync-workspace-error'));
        const state = this.inventories.state(this.view);
        if (remote) {
            if (state.status === 'loading') this.treeBox.append(element('p', tr('Загрузка содержимого…', 'Loading contents…')));
            if (state.error) this.treeBox.append(element('p', state.error + (state.loadedAt ? tr(' · показан устаревший снимок', ' · showing a stale snapshot') : ''), 'sync-workspace-error'));
            if(state.browse?.diagnostics.length){const details=element('details');details.append(element('summary',tr('Диагностика источника: ','Source diagnostics: ')+state.browse.diagnostics.length));
                for(const diagnostic of state.browse.diagnostics.slice(0,100))details.append(element('p',diagnostic.message));this.treeBox.append(details);}
        }
        const root = remote ? state.browse?buildBrowseTree(state.browse):buildRemoteTree(state.entries) : buildLocalTree(new Set([...this.localFiles, ...projected.keys()]), this.localFolders);
        sortChildren(root); const flat: { node: TreeNode; depth: number }[] = [];
        const visit = (node: TreeNode, depth: number) => {
            if (!this.context.search || node.path.toLowerCase().includes(this.context.search.toLowerCase())) flat.push({ node, depth });
            if (this.context.search || this.context.expanded.has(treeNodeKey(node))) for (const child of node.children) visit(child, depth + 1);
        }; visit(root, 0);
        const size = 150; this.context.page = Math.min(this.context.page, Math.max(0, Math.ceil(flat.length / size) - 1));
        const page = flat.slice(this.context.page * size, (this.context.page + 1) * size);
        if (!page.some(({ node }) => treeNodeKey(node) === this.context.focus)) this.context.focus = page[0]?treeNodeKey(page[0].node):'';
        const list = element('div', '', 'sync-tree'); list.setAttribute('role', 'tree'); list.setAttribute('aria-label', remote ? tr('Файлы источника', 'Source files') : 'Vault'); list.setAttribute('aria-multiselectable', String(!remote));
        const local = new Set(this.localFiles);
        for (const { node, depth } of page) {
            const key=treeNodeKey(node);
            const row = element('div', '', 'sync-workspace-row'); row.setAttribute('role', 'treeitem'); row.setAttribute('aria-level', String(depth + 1));
            row.setAttribute('data-path', node.path);row.dataset.nodeKey=key; row.setAttribute('aria-selected', String((this.context.selected.key??this.context.selected.path) === key));
            row.tabIndex = key === this.context.focus ? 0 : -1; row.style.paddingLeft = depth * 14 + 'px';
            row.addEventListener('focus', () => { this.context.focus = key; });
            if (!remote && node.path) {
                const check = element('input'); check.type = 'checkbox'; check.tabIndex = -1; check.checked = this.selection.has(node.path); check.setAttribute('aria-label', tr('Выделить для редактирования: ', 'Select for editing: ') + node.path);
                check.addEventListener('click', event => event.stopPropagation()); check.addEventListener('change', () => { check.checked ? this.selection.set(node.path, node.kind) : this.selection.delete(node.path); this.renderSummary(); }); row.append(check);
            }
            if (node.kind === 'folder') {
                row.setAttribute('aria-expanded', String(this.context.expanded.has(key)));
                const arrow = button(row, this.context.expanded.has(key) ? '▾' : '▸', () => { this.context.expanded.has(key) ? this.context.expanded.delete(key) : this.context.expanded.add(key); this.context.focus = key; this.renderTree(); }, 'sync-tree-expander');
                arrow.tabIndex = -1; arrow.setAttribute('aria-label', tr('Раскрыть / свернуть ', 'Expand / collapse ') + (node.path || tr('корень', 'root'))); arrow.addEventListener('click', event => event.stopPropagation());
            } else row.append(element('span', '·', 'sync-tree-icon'));
            const name = element('span', node.parent ? node.name||tr('(пустое имя)','(empty name)') : remote ? tr('Корень источника', 'Source root') : tr('Весь vault / корень', 'Entire vault / root'), 'sync-tree-name');
            row.append(name); row.addEventListener('click', () => this.selectNode(node));
            if(node.browseNode){row.dataset.objectId=node.browseNode.objectId;const badge=element('small','ID '+(node.browseNode.objectId.length>16?node.browseNode.objectId.slice(0,8)+'…'+node.browseNode.objectId.slice(-4):node.browseNode.objectId),'sync-tree-meta');badge.title=node.browseNode.objectId;row.append(badge);
                if(node.browseNode.copyKind)row.append(element('small',node.browseNode.copyKind==='proposal'?tr('Предложение','Proposal'):node.browseNode.copyKind==='legacy'?tr('Старая конфликтная копия','Legacy conflict copy'):tr('Некорректная копия','Invalid artifact'),'sync-tree-meta'));
                if(node.browseNode.blocked)row.append(element('small',node.browseNode.blocked,'sync-workspace-warning'));}
            row.addEventListener('keydown', event => {
                if (event.target !== row) return;
                const index = flat.findIndex(item => treeNodeKey(item.node) === key);
                const focus = (next: number) => { const item = flat[Math.max(0, Math.min(flat.length - 1, next))]; if (!item) return; this.context.focus = treeNodeKey(item.node); this.context.page = Math.floor(Math.max(0, next) / size); this.renderTree(); this.focusRow(); };
                if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) event.preventDefault();
                if (event.key === 'ArrowUp') focus(index - 1); else if (event.key === 'ArrowDown') focus(index + 1);
                else if (event.key === 'Home') focus(0); else if (event.key === 'End') focus(flat.length - 1);
                else if (event.key === 'Enter') this.selectNode(node);
                else if (event.key === ' ' && !remote && node.path) { this.selection.has(node.path) ? this.selection.delete(node.path) : this.selection.set(node.path, node.kind); this.renderTree(); this.renderSummary(); }
                else if (event.key === 'ArrowRight' && node.kind === 'folder') { if (this.context.expanded.has(key)) focus(index + 1); else { this.context.expanded.add(key); this.renderTree(); } }
                else if (event.key === 'ArrowLeft') { if (node.kind === 'folder' && this.context.expanded.has(key)) { this.context.expanded.delete(key); this.renderTree(); } else if (node.parent) focus(flat.findIndex(item => treeNodeKey(item.node) === treeNodeKey(node.parent!))); }
            });
            if (!remote && node.path) {
                const witness = node.kind === 'folder' ? node.path + '/__file__' : node.path;
                const effective = pathState(this.policy, this.profiles, this.deps.pathPolicy, witness,compiled);
                const sources = new Set([effective.source]); const behaviours = new Set([JSON.stringify([effective.rule.write, effective.rule.delete])]);
                if (node.kind === 'folder') for (const assignment of this.policy.assignments ?? []) {
                    if (assignment.scope === 'vault' || assignment.path === node.path || assignment.path.startsWith(node.path + '/')) {
                        const sample = assignment.scope === 'file' ? assignment.path : [assignment.path, assignment.names?.[0] ?? '__file__'].filter(Boolean).join('/');
                        const rule = resolveFileRule(sample, compiled.fileRules); sources.add(rule.source ?? this.policy.defaultSource); behaviours.add(JSON.stringify([rule.write, rule.delete]));
                    }
                }
                const owner = this.connections.find(c => c.id === effective.source)?.name ?? tr('Нет источника', 'No source');
                const info = sources.size > 1 ? tr('Несколько источников', 'Multiple sources') : owner;
                row.append(element('small', info + ' · ' + (behaviours.size > 1 ? tr('Смешанное поведение', 'Mixed behaviour') : writeLabel(effective.rule.write ?? 'update')), 'sync-tree-meta'));
                const labels = { excluded: tr('Исключён', 'Excluded'), protected: tr('Защищён разрешениями', 'Protected by permissions'), unassigned: tr('Нет источника', 'No source'), preserve: tr('Не трогать', 'Do not touch'), included: '' };
                const status = labels[effective.state] || (node.kind === 'file' ? projected.has(node.path) ? local.has(node.path) ? tr('Локальный + источник', 'Local + source') : tr('Только в источнике', 'Source only') : tr('Наличие в источнике не подтверждено', 'Source availability unconfirmed') : '');
                const freshness=projected.has(node.path)&&this.inventories.state(projected.get(node.path)!).status!=='ready'?tr(' · снимок устарел',' · stale snapshot'):'';
                if (status) row.append(element('small', status+freshness, 'sync-tree-state sync-tree-state-' + effective.state));
            }
            list.append(row);
        }
        this.treeBox.append(list);
        if (!flat.length) this.treeBox.append(element('p', tr('Нет подходящих путей. Измените поиск.', 'No matching paths. Change the search.')));
        if (flat.length > size) {
            const pager = element('div', '', 'sync-tree-pager');
            button(pager, tr('Назад', 'Previous'), () => { this.context.page--; this.renderTree(); }).disabled = this.context.page === 0;
            pager.append(element('span', (this.context.page + 1) + ' / ' + Math.ceil(flat.length / size)));
            button(pager, tr('Далее', 'Next'), () => { this.context.page++; this.renderTree(); }).disabled = (this.context.page + 1) * size >= flat.length; this.treeBox.append(pager);
        }
        if (wasFocused) this.focusRow();
    }
    private focusRow(): void { Array.from(this.treeBox.querySelectorAll<HTMLElement>('[role="treeitem"]')).find(row => row.dataset.nodeKey === this.context.focus)?.focus(); }
    private selectNode(node: TreeNode): void {
        this.contentEl.dataset.pane = 'inspector';
        for(const tab of Array.from(this.contentEl.querySelectorAll<HTMLElement>('.sync-workspace-mobile-tabs button')))tab.setAttribute('aria-pressed',String(tab.dataset.pane==='inspector'));
        const key=treeNodeKey(node);this.context.selected = { scope: node.parent ? node.kind === 'file' ? 'file' : 'folder' : 'vault', path: node.path, key }; this.context.focus = key; this.editingNames = undefined;
        for (const row of Array.from(this.treeBox.querySelectorAll<HTMLElement>('[role="treeitem"]'))) { row.setAttribute('aria-selected', String(row.dataset.nodeKey === key)); row.tabIndex = row.dataset.nodeKey === key ? 0 : -1; }
        this.renderInspector();
    }
    private form(): AssignmentForm {
        const selected = this.context.selected, key = formKey(this.view, selected.scope, this.view==='vault'?selected.path:selected.key??selected.path, this.editingNames);
        const cached = this.forms.get(key); if (cached) {
            const node=this.remoteNode(cached);
            if(node&&node.path!==cached.path&&JSON.stringify(cached.value)===cached.initial){this.forms.delete(key);this.context.selected.path=node.path;return this.form();}
            if(cached.view==='vault' && JSON.stringify(cached.value)===cached.initial && cached.record!==this.assignmentRecord(this.policy,cached)){
                this.forms.delete(key);return this.form();
            }
            const initial=JSON.parse(cached.initial) as FormValues;
            if(cached.view==='vault'&&cached.value.participation===initial.participation){
                const participation=this.policy.folders.find(rule=>rule.path===cached.path)?.include??'inherit';
                cached.value.participation=participation;cached.initial=JSON.stringify({...initial,participation});
            }
            return cached;
        }
        const remote = this.view !== 'vault', current = remote ? undefined : this.policy.assignments?.find(a => a.scope === selected.scope && a.path === selected.path && selector(a.names) === selector(this.editingNames));
        const structural = this.policy.folders.find(f => f.path === selected.path);
        const value: FormValues = { destination: selected.path, source: remote ? this.view : current?.source ?? '', remotePath: remote ? selected.path : current?.remotePath ?? '',
            profile: current?.profileId ?? '', names: current?.names?.join(', ') ?? this.editingNames?.join(', ') ?? '', participation: structural?.include ?? 'inherit', mapping: structural?.target?.localPath ?? '', mappingKind: structural?.target?.kind ?? 'move' };
        const form:AssignmentForm = { scope: selected.scope, path: selected.path, remoteKey:remote&&this.inventories.state(this.view).browse?selected.key:undefined, view: this.view, originalNames: current?.names ?? this.editingNames, value, initial: JSON.stringify(value), paths: new Map<string, string>() };
        form.record=this.assignmentRecord(this.policy,form);
        this.forms.set(key, form); return form;
    }
    private renderInspector(): void {
        if (!this.inspector || this.closed) return; const box = this.inspector;
        const focus=box.contains(document.activeElement)?(document.activeElement as HTMLElement).dataset.syncField:undefined;
        box.replaceChildren();
        const form = this.form(), v = form.value, remote = this.view !== 'vault', selected = this.context.selected;
        const changed = () => this.renderSummary();
        if(form.record!==this.assignmentRecord(this.policy,form)&&JSON.stringify(v)!==form.initial)box.append(element('p',tr('Назначение изменено в другой панели. Сбросьте поля или явно примените свой вариант.','This assignment changed in another panel. Reset these fields or explicitly apply your version.'),'sync-workspace-warning'));
        box.append(element('h3', selected.path || (remote ? tr('Корень источника', 'Source root') : tr('Весь vault', 'Entire vault'))));
        if(remote){const node=this.remoteNode(form);if(node){box.append(element('p',`ID ${node.objectId} · parent ${node.parentId} · version ${node.version}`));
            if(node.artifact)box.append(element('p',tr('Заявленная связь копии: исходный ID ','Claimed artifact lineage: origin ID ')+node.artifact.originId+' · proposal '+node.artifact.proposalId+tr(' · При запуске проверяются область, родитель и содержимое.',' · Scope, parent and content are verified during the run.')));
            if(node.blocked)box.append(element('p',node.blocked+(node.copyKind?'':tr(' · Привязка по неоднозначному пути недоступна. Выберите другую папку источника или устраните неоднозначность.',' · Ambiguous path binding is unavailable. Select another source folder or resolve the ambiguity.')),'sync-workspace-warning'));}}
        box.append(element('p', remote ? tr('Свяжите путь источника с назначением в vault.', 'Bind this source path to a vault destination.') : tr('Источник, область и поведение настраиваются независимо.', 'Source, participation and behaviour are independent.'), 'sync-workspace-hint'));
        if(form.originalNames===NEW_SELECTOR)box.append(element('p',tr('Новое правило: задайте имена для дополнительного назначения. Без фильтра явное применение заменит правило для всех файлов этой области.','New rule: set file names for an additional assignment. Without a filter, explicitly applying it replaces the all-files assignment for this scope.'),'sync-workspace-hint'));
        if (!remote) {
            const effective = pathState(this.policy, this.profiles, this.deps.pathPolicy, selected.scope === 'file' ? selected.path : [selected.path,'__file__'].filter(Boolean).join('/'));
            const compiled = compileProfiles(this.policy, this.profiles);
            box.append(element('p', tr('Сейчас: ', 'Current: ') + (this.connections.find(c => c.id === effective.source)?.name ?? tr('Нет источника', 'No source')) + ' · ' + writeLabel(effective.rule.write ?? 'update') + ' · ' + deleteLabel(effective.rule.delete ?? 'keep')));
            const origin = effective.rule.sourceRule === undefined ? undefined : compiled.fileRules?.[effective.rule.sourceRule];
            if (origin) box.append(element('small', tr('Источник назначен на: ', 'Source assigned at: ') + (origin.path || 'Vault') + (origin.remotePath !== undefined ? ' · ' + origin.remotePath : '')));
            if(effective.state==='protected')box.append(element('p',tr('Путь защищён. Разрешения на код плагинов и сниппетов меняются в настройках плагина.','This path is protected. Plugin code and snippet permissions are controlled in plugin settings.'),'sync-workspace-warning'));
        }
        if(!remote && (selected.path==='.obsidian' || selected.scope==='vault')){
            const checkbox=element('input');checkbox.type='checkbox';
            checkbox.checked=!(this.policy.fileExclusions??[]).some(e=>e.scope==='.obsidian'&&(e.pattern==='workspace.json'||e.pattern==='workspace-mobile.json'));
            checkbox.addEventListener('change',()=>{
                this.policy.fileExclusions=(this.policy.fileExclusions??[]).filter(e=>!(e.scope==='.obsidian'&&(e.pattern==='workspace.json'||e.pattern==='workspace-mobile.json')));
                if(!checkbox.checked)for(const pattern of ['workspace.json','workspace-mobile.json'])this.policy.fileExclusions.push({pattern,scope:'.obsidian',note:'Workspace layout is device-specific'});
                this.renderTree();changed();
            });field(box,tr('Синхронизировать расположение панелей Obsidian','Sync Obsidian workspace layout'),checkbox,tr('workspace.json и workspace-mobile.json. Общие исключения продолжают действовать.','workspace.json and workspace-mobile.json. Other exclusions still apply.'));
        }
        if (remote) field(box, tr('Путь в vault', 'Vault path'), textInput(v.destination, value => { v.destination = value; changed(); }));
        const source = selectInput([['', tr('Наследовать', 'Inherit')], ...this.connections.map(c => [c.id, c.name] as const)], v.source, value => {
            form.paths.set(v.source, v.remotePath); v.source = value; v.remotePath = value ? form.paths.get(value) ?? v.destination : ''; this.renderInspector(); changed();
        }); field(box, tr('Источник', 'Source'), source);
        const path = textInput(v.remotePath, value => { v.remotePath = value; changed(); }); path.disabled = !v.source;
        field(box, tr('Путь в источнике', 'Source path'), path, v.source ? tr('Пусто — корень. Для файла нужен точный путь.', 'Empty means root. A file requires its exact path.') : tr('Источник и путь наследуются. Выберите подключение для переопределения.', 'Source and path are inherited. Choose a connection to override them.'));
        button(box, tr('Выбрать путь из источника', 'Pick source path'), () => {
            const inherited=resolveFileRule(selected.scope==='file'?selected.path:[selected.path,'__file__'].filter(Boolean).join('/'),compileProfiles(this.policy,this.profiles).fileRules).source??this.policy.defaultSource;
            const id = v.source || inherited, connection = this.connections.find(c => c.id === id);
            if (!connection) { new Notice(tr('Сначала выберите источник', 'Choose a source first')); return; }
            const modal = new SourcePathModal(this.app, connection.name, selected.scope === 'file' ? 'file' : 'folder', this.inventories.state(id!).browse??this.inventories.state(id!).entries, this.inventories.state(id!).status,
                signal => this.deps.fetch(structuredClone(connection), signal), value => { v.source = id!; v.remotePath = value; this.renderInspector(); changed(); });
            trackModal(modal); modal.open();
        });
        field(box, tr('Профиль поведения', 'Behaviour profile'), selectInput([['', tr('Наследовать', 'Inherit')], ...this.profiles.map(p => [p.id, profileName(p)] as const)], v.profile, value => { v.profile = value; changed(); }));
        if (!remote) field(box, tr('Участие в синхронизации', 'Participation'), selectInput([
            ['inherit', tr('Наследовать', 'Inherit')], ['include', tr('Включить', 'Include')], ['exclude', tr('Исключить', 'Exclude')],
        ], v.participation, value => { v.participation = value as FolderPolicy['include']; changed(); }));
        if (selected.scope !== 'file') {
            const filters = element('div', '', 'sync-file-filters');
            button(filters, tr('Все файлы', 'All files'), () => { v.names = ''; this.renderInspector(); changed(); });
            if (selected.path === '.obsidian/plugins' || selected.path.startsWith('.obsidian/plugins/')) {
                button(filters, tr('Код плагинов', 'Plugin code'), () => { v.names = PLUGIN_CODE_FILES.join(', '); this.renderInspector(); changed(); });
                button(filters, 'data.json', () => { v.names = 'data.json'; this.renderInspector(); changed(); });
            }
            box.append(filters); field(box, tr('Точные имена файлов', 'Exact file names'), textInput(v.names, value => { v.names = value; changed(); }), tr('Через запятую, во всём поддереве; это не маска расширений. При привязке источника остальные файлы не копируются повторно под исходным путём.', 'Comma-separated throughout this subtree; these are not extension patterns. A source binding does not copy the remaining files again under their original paths.'));
        }
        if (!remote && this.policy.folders.some(f => f.path === selected.path && f.target)) {
            const legacy = element('details'); legacy.append(element('summary', tr('Сохранённое перенаправление папки', 'Saved folder mapping')));
            field(legacy, tr('Тип перенаправления', 'Mapping type'), selectInput([['move', tr('Полный путь', 'Full path')], ['rename', tr('Имя папки', 'Folder name')]], v.mappingKind, value => { v.mappingKind = value as 'move' | 'rename'; changed(); }));
            field(legacy, tr('Назначение старого правила', 'Legacy target'), textInput(v.mapping, value => { v.mapping = value; changed(); }), tr('Явные новые привязки имеют конечный путь vault и повторно не перенаправляются.', 'Explicit new bindings use final vault paths and are not remapped again.')); box.append(legacy);
        }
        const actions = element('div', '', 'sync-inspector-actions');
        button(actions, remote ? tr('Разместить в vault', 'Place in vault') : tr('Применить к черновику', 'Apply to draft'), () => {
            try {
                this.policy = this.applyForm(this.policy, form,true);this.forms.delete(formIndex(form));
                form.initial = JSON.stringify(v); form.originalNames = namesOf(v.names).length ? namesOf(v.names) : undefined;form.record=this.assignmentRecord(this.policy,form);
                this.editingNames=form.originalNames;this.forms.set(formIndex(form),form);this.render();
            }
            catch (error) { new Notice(String(error)); }
        }, 'mod-cta').disabled=Boolean(remote&&this.remoteNode(form)?.blocked); box.append(actions);
        if(JSON.stringify(v)!==form.initial||form.record!==this.assignmentRecord(this.policy,form))button(actions,tr('Сбросить поля','Reset fields'),()=>{this.forms.delete(formIndex(form));this.renderInspector();this.renderSummary();});
        if (!remote) {
            if(selected.scope!=='file'&&selector(this.editingNames)!==selector(NEW_SELECTOR))button(box,tr('Добавить назначение','Add assignment'),()=>{this.editingNames=NEW_SELECTOR;this.renderInspector();});
            for (const assignment of this.policy.assignments?.filter(a => a.scope === selected.scope && a.path === selected.path) ?? []) {
                const row = element('div', '', 'sync-assignment-row');
                row.append(element('p', (assignment.names?.join(', ') ?? tr('Все файлы', 'All files')) + ' · ' + (this.profiles.find(p => p.id === assignment.profileId) ? profileName(this.profiles.find(p => p.id === assignment.profileId)!) : tr('Поведение наследуется', 'Behaviour inherited')) +
                    ' · ' + (this.connections.find(c => c.id === assignment.source)?.name ?? tr('Источник наследуется', 'Source inherited'))));
                button(row, tr('Изменить назначение', 'Edit assignment'), () => { this.editingNames = assignment.names; this.renderInspector(); });
                button(row, tr('Убрать назначение', 'Remove assignment'), () => { this.policy.assignments = this.policy.assignments?.filter(a => a !== assignment); this.forms.delete(formKey('vault', assignment.scope, assignment.path, assignment.names)); this.editingNames = undefined; this.render(); }); box.append(row);
            }
            if (selected.path) button(box, tr('Не синхронизировать эту область', 'Do not sync this scope'), () => { v.participation = 'exclude'; this.policy = setParticipation(this.policy, selected.path, 'exclude'); form.initial = JSON.stringify({ ...JSON.parse(form.initial), participation: 'exclude' }); this.render(); });
        }
        if(focus)Array.from(box.querySelectorAll<HTMLElement>('[data-sync-field]')).find(control=>control.dataset.syncField===focus)?.focus();
    }
    private remoteNode(form:AssignmentForm):RemoteBrowseNode|undefined{return this.inventories.state(form.view).browse?.nodes.find(node=>node.key===form.remoteKey);}
    private assignmentRecord(policy:SyncPolicy,form:AssignmentForm):string|undefined {
        const scope=form.scope==='vault'&&form.value.destination?'folder':form.scope;
        const assignment=policy.assignments?.find(a=>a.scope===scope&&a.path===form.value.destination&&selector(a.names)===selector(form.originalNames));
        return assignment?JSON.stringify([assignment.scope,assignment.path,selector(assignment.names),assignment.source,assignment.remotePath,assignment.profileId]):undefined;
    }
    private applyForm(policy: SyncPolicy, form: AssignmentForm, explicit=false): SyncPolicy {
        const remoteNode=this.remoteNode(form);if(remoteNode?.blocked)throw Error(remoteNode.blocked);
        if(form.remoteKey&&(!remoteNode||remoteNode.path!==form.path))throw Error(tr('Выбранный объект источника изменился. Откройте его заново.','Selected source object changed. Select it again.'));
        const v = form.value, destination = v.destination, scope = form.scope === 'vault' && destination ? 'folder' : form.scope;
        if (destination && !this.deps.pathPolicy.isPathSafe(destination)) throw Error(tr('Небезопасный путь vault', 'Unsafe vault path'));
        if(!explicit && form.record!==this.assignmentRecord(policy,form))throw Error(tr('Назначение изменилось в другой панели. Сбросьте поля или примените свой вариант явно.','Assignment changed in another panel. Reset these fields or explicitly apply your version.'));
        const next = structuredClone(policy), names = namesOf(v.names);
        if(!explicit && selector(form.originalNames)===selector(NEW_SELECTOR) && next.assignments?.some(a=>a.scope===scope&&a.path===destination&&selector(a.names)===selector(names)))throw Error(tr('Такое назначение уже есть. Откройте его для редактирования или явно примените замену.','This assignment already exists. Edit it or explicitly apply the replacement.'));
        next.assignments = (next.assignments ?? []).filter(a => !(a.scope === scope && a.path === destination && selector(a.names) === selector(form.originalNames)));
        // Replacing a selector cannot leave a second equal-priority assignment behind.
        next.assignments = next.assignments.filter(a => !(a.scope === scope && a.path === destination && selector(a.names) === selector(names)));
        if (v.source || v.profile) next.assignments.push({ scope, path: destination, names: names.length ? names : undefined, source: v.source || undefined, remotePath: v.source ? v.remotePath : undefined, profileId: v.profile || undefined });
        let result = next;
        if (form.view === 'vault' && v.participation !== JSON.parse(form.initial).participation) result = setParticipation(result, destination, v.participation);
        else if (form.view !== 'vault' && v.source) result = setParticipation(result, destination, 'include');
        if (form.view === 'vault' && policy.folders.some(r => r.path === destination && r.target)) {
            const target = v.mapping ? { kind: v.mappingKind, localPath: v.mapping } : undefined;
            if (target && (!this.deps.pathPolicy.isPathSafe(target.localPath) || (target.kind === 'rename' && target.localPath.includes('/')))) throw Error(tr('Небезопасное перенаправление', 'Unsafe mapping'));
            for (const rules of [result.folders, result.scopeSelection?.customFolders ?? []]) for (const rule of rules) if (rule.path === destination) rule.target = target;
        }
        compileProfiles(result, this.profiles); return result;
    }
    private bulkProfiles(): void {
        if (!this.selection.size) return;
        const modal = new Modal(this.app); modal.contentEl.append(element('h3', tr('Профиль для выделенных областей', 'Profile for selected scopes')), element('p', [...this.selection.keys()].join(', ')));
        let profile = ''; field(modal.contentEl, tr('Профиль', 'Profile'), selectInput([['', tr('Наследовать', 'Inherit')], ...this.profiles.map(p => [p.id, profileName(p)] as const)], '', value => profile = value));
        button(modal.contentEl, tr('Применить к черновику', 'Apply to draft'), () => {
            try { const next = structuredClone(this.policy);
                for (const [path, scope] of this.selection) {
                    const existing = next.assignments?.find(a => a.path === path && a.scope === scope && !a.names);
                    next.assignments = (next.assignments ?? []).filter(a => !(a.path === path && a.scope === scope && !a.names));
                    if (profile || existing?.source) next.assignments.push({ ...existing, path, scope, profileId: profile || undefined });
                    this.forms.delete(formKey('vault', scope, path));
                }
                compileProfiles(next, this.profiles); this.policy = next; modal.close(); this.render();
            } catch (error) { new Notice(String(error)); }
        }); button(modal.contentEl, tr('Отмена', 'Cancel'), () => modal.close()); trackModal(modal); modal.open();
    }
    private editExclusions(): void {
        const modal = new ExclusionsModal(this.app, this.policy.fileExclusions ?? [], this.deps.pathPolicy, exclusions => { this.policy.fileExclusions = exclusions; this.render(); });
        trackModal(modal); modal.open();
    }
    private async save(): Promise<void> {
        if (this.saving || this.closed) return; this.saving = true; this.renderSummary();
        try {
            if (this.deps.isRunning()) throw Error(tr('Синхронизация выполняется', 'Synchronization is running'));
            let next = structuredClone(this.policy);
            for (const form of this.forms.values()) if (JSON.stringify(form.value) !== form.initial) next = this.applyForm(next, form);
            validateProfiles(this.profiles, this.connections); const compiled = compileProfiles(next, this.profiles);
            for (const id of [next.defaultSource, ...(compiled.fileRules ?? []).map(r => r.source)]) if (id && !this.connections.some(c => c.id === id)) throw Error(tr('Отсутствует подключение источника', 'Source connection is missing'));
            await this.deps.save(structuredClone(next), structuredClone(this.connections),structuredClone(this.profiles));
            this.policy = next; this.savedPolicy = structuredClone(next); this.savedConnections = structuredClone(this.connections);
            this.savedProfiles=structuredClone(this.profiles);
            const active=this.forms.get(formKey(this.view,this.context.selected.scope,this.view==='vault'?this.context.selected.path:this.context.selected.key??this.context.selected.path,this.editingNames));
            if(active)this.editingNames=namesOf(active.value.names).length?namesOf(active.value.names):undefined;
            const forms=[...this.forms.values()];this.forms.clear();
            for(const form of forms){const oldNames=form.originalNames;form.originalNames=namesOf(form.value.names).length?namesOf(form.value.names):undefined;form.record=this.assignmentRecord(next,form);form.initial=JSON.stringify(form.value);this.forms.set(formIndex(form),form);
                const context=form.view===this.view?this.context:this.contexts.get(form.view);if(context?.selected.path===form.path&&context.selected.scope===form.scope&&selector(context.editingNames)===selector(oldNames))context.editingNames=form.originalNames;
            }
            this.initial = this.fingerprint(); this.render();
        } catch (error) { new Notice(String(error)); } finally { this.saving = false; this.renderSummary(); }
    }
    private editLibrary(): void {
        const references=structuredClone(this.policy);
        references.assignments=[...(references.assignments??[]), ...[...this.forms.values()].filter(f=>f.value.profile||f.value.source).map((f,index)=>({scope:'file' as const,path:'__draft_reference_'+index,profileId:f.value.profile||undefined,source:f.value.source||undefined}))];
        const modal=new ProfileLibraryModal(this.app,this.profiles,this.connections,async(profiles,connections,defaultSource)=>{
            compileProfiles(references,profiles); this.profiles=profiles;this.connections=connections;this.policy.defaultSource=defaultSource;this.render();
        },false,this.policy.defaultSource,references,true,this.deps.google);trackModal(modal);modal.open();
    }
    private async preview(ids?: string[]): Promise<void> {
        if (!this.deps.run || this.deps.isRunning()) return;
        if (this.isDirty()) { new Notice(tr('Сначала сохраните настройки', 'Save settings first')); return; }
        const needed=participatingSources(compileProfiles(this.policy,this.profiles)),selected=ids??needed;
        if(!selected.length||selected.some(id=>!needed.includes(id))){new Notice(tr('Выбранному источнику не назначены области','Selected source has no assigned scope'));return;}
        for(const id of selected){const connection=this.connections.find(c=>c.id===id);if(!connection||connectionIssues(connection).length){new Notice((connection?.name??id)+': '+tr('проверьте поля подключения','check the connection fields'));return;}}
        this.acceptClose(); await this.deps.run(ids);
    }
    onClose(): void { this.closed = true; this.controller.abort(); this.inventories.dispose(); this.deps.dispose(); this.contentEl.replaceChildren(); }
}
