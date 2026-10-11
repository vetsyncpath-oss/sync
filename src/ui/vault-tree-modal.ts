import { ProfileAssignmentModal } from './profile-assignment-modal';
import type { SyncProfile, SourceConnection } from '../core/profiles';
import { i18n } from '../i18n';
import type { WriteMode } from '../core/file-rules';
// src/ui/vault-tree-modal.ts — модалка структуры-политики vault
// (Phase 4: вкладки «Источник»/«Текущий vault» с РАЗНОЙ легендой).
//
// ТОНКАЯ obsidian-оболочка: логика — PolicyEditor/status (чистые),
// здесь — DOM-рендер, вкладки, фильтры, поиск, контекст-меню,
// rename/move sub-модалки. DOM — только стандартные API (тестируемость
// под happy-dom с моком Modal/Menu/Notice).
//
// ДИЗАЙН-РЕШЕНИЯ (утверждены пользователем):
//   - КРАТКАЯ шапка: пресет + Save; сводка «что будет» НЕ здесь —
//     её показывает confirm-модалка после «Синхронизировать».
//   - Вкладка «ИСТОЧНИК» — по умолчанию (односторонний sync: выбор оттуда):
//     чекбоксы, статусы remote→локаль («синхронизировано», «обновить»,
//     «нет локально», «риск конфликта»), счётчики папок.
//   - Вкладка «ТЕКУЩИЙ VAULT» — инспекция без чекбоксов: статусы
//     локаль→источник («синхронизировано 24.08», «local-only»,
//     «удалено в источнике», фильтр «под угрозой зеркала»).
//   - Статусы — ЦВЕТНОЙ ТЕКСТ (vts-c-*), без глифов-точек/ромбов.
//   - Фильтр по умолчанию — «Всё»; поиск по подстроке пути.
//
// [W2-T07] Реформа модалки (честность + мультивыбор + мобильный паритет):
//   - ЧЕСТНЫЕ СТАТУСЫ (конец BUG-1-UI): подписи local-only/not-synced/
//     deleted-in-source зависят от ЭФФЕКТИВНОГО уровня зеркала пути
//     (матрица §2.2) — модалка обещает ровно то, что сделает движок.
//   - ЧЕКБОКС «Зеркало» УДАЛЁН: policy.mirror — мёртвое легаси-поле
//     (BUG-5/W1-T05), движок читает уровни; глобальный уровень теперь
//     read-only в футере (настройки владеют им; deps.mirrorLevel — wiring).
//   - БЕЙДЖИ УРОВНЕЙ (Е3=1): ⚡/⚡⚡ на custom-папках (vts-badge-*).
//   - МУЛЬТИВЫБОР (Е1): Ctrl/⌘+ЛКМ или режим «выбрать несколько» (A2,
//     мобильный fallback): общее меню на группу — уровни, исключение,
//     include-only, сброс — одной операцией.
//   - «⋯» В КАЖДОЙ СТРОКЕ ПАПКИ (BUG-18): контекст-меню достижимо с тача
//     (rename/move раньше были недостижимы на мобильных).
//   - СКОРОСТЬ (F4-F7): debounce поиска 200 мс, rAF-коалесцинг рендера
//     слайса при скролле, мемоизация счётчиков папок (PolicyEditor).
//   - UNSAVED-CONFIRM (F10): закрытие при dirty-модели — мини-confirm.

import { Modal, Menu, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { CacheEntry, FileExclusion, RemoteEntry } from '../sources/types';
import type { PathPolicy } from '../core/path-policy';
import type { SyncPolicy } from '../core/policy';
import type { MirrorLevel } from '../core/mirror';
// [overhaul S4 / S3-review #2,#3] внутренние модалки — в общем реестре.
import { trackModal, isForceClosingModals } from './modal-registry';
import { PolicyEditor, type PolicySummary } from './policy-editor';
import {
        LOCAL_COLOR,
        REMOTE_COLOR,
        formatSyncDay,
        localFilterPass,
        localFolderLabel,
        localStatusColor,
        remoteFilterPass,
        remoteFolderLabel,
        type LocalFilterId,
        type LocalStatus,
        type RemoteFilterId,
        type RemoteStatus,
        type StatusColor,
        type StructurePreset,
} from './status';
import { flattenVisible, type TreeNode, type VisibleNode } from './tree-walk';

// ─── [overhaul v4 / Этап 2] Пресеты fileExclusions для быстрых кнопок ───
// Спец-маркер scope='__pluginDir__' резолвится в pluginDir из deps в момент
// клика (см. renderFileExclusionsPanel). Это позволяет пресетам не зависеть
// от конкретного pluginDir — пресет переиспользуется для любого плагина.
const FILE_EXCLUSION_PRESETS: readonly (FileExclusion & { scope?: string })[] = [
        { pattern: 'data.json', scope: '__pluginDir__', note: 'plugin secrets (machine-specific)' },
        { pattern: 'data.json.bak', scope: '__pluginDir__', note: 'plugin backup' },
        { pattern: '.DS_Store', note: 'macOS metadata' },
        { pattern: 'Thumbs.db', note: 'Windows thumbnail cache' },
        { pattern: '*.log', note: 'log files' },
        { pattern: '*.tmp', note: 'temp files' },
        { pattern: '*.bak', note: 'backup files' },
        { pattern: 'workspace.json', scope: '.obsidian', note: 'Obsidian UI state' },
        { pattern: 'cache', scope: '.obsidian', note: 'Obsidian cache' },
        { pattern: 'manifest-*.json', scope: '__pluginDir__', note: 'manifest cache files' },
        { pattern: 'vault-sync-journal.json', scope: '__pluginDir__', note: 'local session journal' },
];

// ─── Локализация ───

export interface VaultTreeModalLabels {
        title: string;
        presetFull: string;
        presetObsidian: string;
        presetCustom: string;
        save: string;
        close: string;
        tabRemote: string;
        tabLocal: string;
        filterAll: string;
        filterChanges: string;
        filterSelectAll: string;
        filterDeselectAll: string;
        showFiles: string;
        hideFiles: string;
        filterLocalOnly: string;
        filterDeleted: string;
        filterConflicts: string;
        filterMirrorRisk: string;
        searchPlaceholder: string;
        emptyLocal: string;
        emptyRemote: string;
        fetchFailed: (msg: string) => string;
        retry: string;
        readOnlyNotice: string;
        loading: string;
        statusSummary: (s: PolicySummary) => string;
        menuSpecificSync: string;
        menuExclude: string;
        menuIncludeOnly: string;
        menuReset: string;
        clearTarget: string;
        pickFolderBtn: string;
        renameTitle: string;
        moveTitle: string;
        renamePrompt: (sourcePath: string) => string;
        renamePlaceholder: string;
        // [P2/B5] expandAll/collapseAll: тултипы кнопок ⊕/⊖ — раньше хардкоды
        // 'Expand all'/'Collapse all' в обход i18n (§5.13 пост-аудита).
        expandAll: string;
        collapseAll: string;
        renameFeedbackWillLand: (path: string) => string;
        renameFeedbackUnsafe: string;
        renameFeedbackEmpty: string;
        renameCancel: string;
        renameConfirm: string;
        renameFixFirst: string;
        validateErrorNotice: (errors: string) => string;
        /** [overhaul S4/LOW] локализация строк валидации rename/move-целей
         *  (раньше — хардкод русских строк в чистом policy-editor). */
        validationEmptyTarget: (path: string) => string;
        validationUnsafeTarget: (path: string, target: string) => string;
        savedNotice: (s: PolicySummary) => string;
        // Статусы вкладки ИСТОЧНИК (цветной текст)
        stSynced: string;
        stChanged: string;
        stNew: string;
        stRisk: string;
        stExcluded: string;
        stPlugin: string;
        // Статусы вкладки ТЕКУЩИЙ VAULT
        stLSynced: (day: string | null) => string;
        stLChanged: string;
        stLLocalOnly: string;
        stLNotSynced: string;
        stLMirrorDelete: string;
        stLDeleted: string;
        stLConflictCopy: string;
        // Подписи папок (счётчики)
        cntUpdate: (n: number) => string;
        cntNew: (n: number) => string;
        cntRisk: (n: number) => string;
        cntFiles: (n: number) => string;
        cntLocalOnly: (n: number) => string;
        cntNotSynced: (n: number) => string;
        cntDeleted: (n: number) => string;
        cntConflicts: (n: number) => string;
        // [W2-T07] Бейджи уровней на custom-папках (Е3=1)
        badgeLight: string;
        badgeFull: string;
        // [overhaul v4 / Этап 2] File exclusions panel
        fileExclusionsTitle: string;
        fileExclusionsEmpty: string;
        fileExclusionsAdd: string;
        fileExclusionsRemove: string;
        fileExclusionsPatternPlaceholder: string;
        fileExclusionsScopePlaceholder: string;
        // [W2-T07] Кнопка «⋯» в строке — мобильный паритет контекст-меню (BUG-18)
        rowMenuBtnTitle: string;
        // [W2-T07] Мультивыбор Ctrl/⌘+ЛКМ: общий context menu на группу (Е1)
        multiSelectToggle: string;
        multiSelected: (n: number) => string;
        menuSetLevelFetch: string;
        menuSetLevelLight: string;
        menuSetLevelFull: string;
        menuResetToInherit: string;
        // [W2-T07] Честные статусы по уровню зеркала (конец BUG-1-UI)
        stLNotSyncedFetch: string;
        stLNotSyncedLight: string;
        stLNotSyncedFull: string;
        stLLocalOnlyLight: string;
        stLLocalOnlyFull: string;
        cntLevelLight: (n: number) => string;
        cntLevelFull: (n: number) => string;
        // [W2-T07] Подтверждение при закрытии с несохранёнными правками (F10)
        unsavedTitle: string;
        unsavedBody: string;
        unsavedDiscard: string;
        unsavedStay: string;
        // [W2-T07] Глобальный уровень в футере модалки
        levelFooter: string;
}

export interface LocalSnapshot {
        /** Пути локальных ФАЙЛОВ. */
        files: string[];
        /** Пути локальных ПАПОК (вкл. пустые; из getAllLoadedFiles TFolder). */
        folders: string[];
}

export interface VaultTreeModalDeps {
        profiles?: SyncProfile[];
        connections?: SourceConnection[];
        onDispose?: () => void;
        /** Снимок локальных файлов И папок (забирается при onOpen). */
        getLocalSnapshot: () => LocalSnapshot | Promise<LocalSnapshot>;
        /** Манифест источника (getManifest + dispose — ответственность вызывающего). */
        fetchRemote: () => Promise<RemoteEntry[]>;
        /** Кэш последнего применённого состояния (статусы + даты). */
        getCache: () => Map<string, CacheEntry>;
        /** Папка самого плагина ('.obsidian/plugins/<dir>') — авто-блокировка. */
        pluginDir: string;
        /** Активная path-политика — валидация rename-целей. */
        pathPolicy: PathPolicy;
        /** Исходная политика (клонируется). */
        initialPolicy: SyncPolicy;
        /** sync идёт — модалка открывается read-only. */
        isSyncRunning: () => boolean;
        /** Save: персист + hot-swap (готовит следующую сессию). */
        onSave: (policy: SyncPolicy) => Promise<void>;
        /** [W2-T07] Глобальный уровень зеркала из НАСТРОЕК (settings.mirrorLevel).
         *  Опционален: без wiring (main.ts) — легаси-вывод из initialPolicy.mirror
         *  (mirror=true ≡ light, миграция §2.4). main подключит:
         *  `mirrorLevel: () => this.currentMirrorLevel()`. */
        mirrorLevel?: () => MirrorLevel;
        labels: VaultTreeModalLabels;
}

type TabId = 'remote' | 'local';

const ROW_HEIGHT_PX = 26;
const VIRTUAL_BUFFER = 50;

/** [W2-T07 / F4] Debounce поиска: рендер не на каждый keystroke. */
const SEARCH_DEBOUNCE_MS = 200;

/** Типизатор пункта меню (мок/obsidian структурно совместимы; без пакета
 *  obsidian TS выводит any и ловит TS7006 — здесь явный контракт). */
type MenuItemLike = {
        setTitle: (title: string) => unknown;
        onClick: (fn: () => void) => unknown;
};

/** Стандартный DOM-конструктор (без obsidian-расширений). */
function el<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        opts: { cls?: string; text?: string; type?: string; placeholder?: string; attr?: Record<string, string>; title?: string } = {},
): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (opts.cls) node.className = opts.cls;
        if (opts.text !== undefined) node.textContent = opts.text;
        if (opts.type) (node as HTMLInputElement).type = opts.type;
        if (opts.placeholder) (node as HTMLInputElement).placeholder = opts.placeholder;
        if (opts.title) node.title = opts.title;
        if (opts.attr) {
                for (const [k, v] of Object.entries(opts.attr)) {
                        node.setAttribute(k, v);
                }
        }
        return node;
}

/** Текст статуса с цветовым классом. */
function statusSpan(color: StatusColor, text: string): HTMLElement {
        return el('span', { cls: `vts-st vts-c-${color}`, text });
}

/**
 * [W2-T07] Имя уровня для футера: выводится из подписи пункта меню
 * menuSetLevel* отсечением глифа в скобках ('Лёгкое зеркало (⚡)') —
 * словари en/ru следуют формату 'Имя (глиф)'.
 * TODO(i18n): отдельные ключи имён уровней в vts-секции отсутствуют
 * (mln* лежит в корне словаря — недоступен модалке без правки main.ts);
 * при консолидации main может завести vts.levelName* и заменить это.
 */
function levelDisplayName(t: VaultTreeModalLabels, level: MirrorLevel): string {
        const raw = level === 'fetch'
                ? t.menuSetLevelFetch
                : level === 'light' ? t.menuSetLevelLight : t.menuSetLevelFull;
        const stripped = raw.replace(/\s*\([^()]*\)\s*$/, '').trim();
        return stripped !== '' ? stripped : raw;
}

export class VaultTreeModal extends Modal {
        private readonly deps: VaultTreeModalDeps;
        private editor: PolicyEditor | null = null;
        private fetchError: string | null = null;
        private remoteLoaded = false;
        private localEmpty = false;
        private expanded: Set<string> = new Set();
        private tab: TabId = 'remote'; // источник — по умолчанию (односторонний sync)
        private remoteFilter: RemoteFilterId = 'all'; // «Всё» — по умолчанию
        private localFilter: LocalFilterId = 'all';
        private search = '';
        /** [5] Файлы скрыты до явного «Показать файлы» (быстрый первый экран). */
        private showFiles = true;
        private treeEl: HTMLElement | null = null;
        private treeUl: HTMLElement | null = null;
        private currentFlat: VisibleNode[] | null = null;
        private statusEl: HTMLElement | null = null;
        /** [W2-T07] Футер: глобальный уровень + счётчики custom-папок (Е3). */
        private levelEl: HTMLElement | null = null;
        private emptyEl: HTMLElement | null = null;
        private filterBarEl: HTMLElement | null = null;
        private renderToken = 0;
        private closed = false;
        /** [W2-T07 / Е1] Мультивыбор: выделенные папки (нормализованные пути). */
        private readonly selected = new Set<string>();
        /** [W2-T07 / A2] Режим «выбрать несколько» — мобильный паритет (тап = toggle). */
        private multiSelectMode = false;
        /** [W2-T07 / F4] Debounce-таймер поиска. */
        private searchTimer: ReturnType<typeof setTimeout> | null = null;
        /** [W2-T07 / F6] rAF-флаг коалесцинга рендера слайса (скролл). */
        private sliceRafPending = false;
        /** [W2-T07 / F10] Закрытие уже одобрено (Save/Discard) — без confirm. */
        private closeApproved = false;

        constructor(app: App, deps: VaultTreeModalDeps) {
                super(app);
                this.deps = deps;
        }

        async onOpen(): Promise<void> {
                const { contentEl } = this;
                contentEl.replaceChildren();
                contentEl.classList.add('vts-modal');
                contentEl.append(el('h2', { text: this.deps.labels.title }));

                if (this.deps.isSyncRunning()) {
                        contentEl.classList.add('vts-read-only');
                        new Notice(this.deps.labels.readOnlyNotice, 4000);
                }

                this.renderHeader();
                this.renderTabs();

                this.treeEl = el('div', { cls: 'vts-tree-wrap' });
                this.treeEl.append(el('div', { cls: 'vts-loading', text: this.deps.labels.loading }));
                this.treeEl.addEventListener('scroll', () => this.scheduleSlice());
                contentEl.append(this.treeEl);

                this.emptyEl = el('div', { cls: 'vts-empty' });
                this.emptyEl.hidden = true;
                contentEl.append(this.emptyEl);

                // [overhaul v4 / Этап 2] Панель fileExclusions — после дерева,
                // до footer. Editor ещё не создан (loadTrees async), но
                // renderFileExclusionsPanel проверяет this.editor и no-op'ает.
                // Реальный рендер панели — в loadTrees() после создания editor.
                this.renderFileExclusionsPanel();

                // [Phase 4.1] Save/Close — в НИЖНЕЙ панели: не конкурируют с
                // пресетом в шапке и не наезжают на узких экранах.
                const footer = el('div', { cls: 'vts-footer' });
                const footerStatus = el('span', { cls: 'vts-footer-status' });
                this.statusEl = footerStatus;
                const footerLevel = el('span', { cls: 'vts-footer-level' });
                this.levelEl = footerLevel;
                footer.append(footerStatus, footerLevel);
                const footerBtns = el('div', { cls: 'vts-footer-btns' });
                const close = el('button', { cls: 'vts-btn vts-btn-warning', text: this.deps.labels.close });
                close.addEventListener('click', () => this.close());
                const save = el('button', { cls: 'vts-btn vts-btn-cta', text: this.deps.labels.save });
                save.disabled = this.deps.isSyncRunning();
                save.addEventListener('click', () => void this.onSave());
                footerBtns.append(close, save);
                footer.append(footerBtns);
                contentEl.append(footer);

                await this.loadTrees();
                if (this.closed) return;
                this.render();
        }

        onClose(): void {
                this.closed = true;
                this.deps.onDispose?.();
                this.editor = null;
                this.currentFlat = null;
                this.renderToken++;
                // [W2-T07] Гасим отложенные рендеры — модалки больше нет.
                if (this.searchTimer !== null) {
                        clearTimeout(this.searchTimer);
                        this.searchTimer = null;
                }
                this.sliceRafPending = false;
                this.selected.clear();
                this.multiSelectMode = false;
                this.contentEl.replaceChildren();
        }

        /**
         * [W2-T07 / F10] Единая точка закрытия (кнопка/Esc/клик в фон —
         * все пути Obsidian ведут сюда): при dirty-модели — мини-confirm.
         * После Save/Discard проходит беспрепятственно (closeApproved).
         */
        close(): void {
                // [overhaul S4 / S3-review #3] при принудительном закрытии (выгрузка
                // плагина) dirty-guard пропускается: вложенный confirm в момент
                // onunload бессмысленен и сам пережил бы выгрузку.
                if (!this.closeApproved && !isForceClosingModals() && this.editor !== null && this.editor.isDirty()) {
                        this.openUnsavedConfirm();
                        return;
                }
                super.close();
        }

        /** [W2-T07 / F10] Мини-confirm «Несохранённые изменения». */
        private openUnsavedConfirm(): void {
                const t = this.deps.labels;
                const confirmModal = new UnsavedConfirmModal(this.app, {
                        title: t.unsavedTitle,
                        body: t.unsavedBody,
                        discardText: t.unsavedDiscard,
                        stayText: t.unsavedStay,
                        onDiscard: () => {
                                this.closeApproved = true;
                                this.close();
                        },
                });
                // [overhaul S4 / S3-review #2] мини-confirm — в реестре модалок.
                trackModal(confirmModal);
                confirmModal.open();
        }

        // ── Загрузка данных ──

        private async loadTrees(): Promise<void> {
                const draft = this.editor?.getPolicy();
                this.fetchError=null;this.remoteLoaded=false;
                let remote: RemoteEntry[] = [];
                try {
                        remote = await this.deps.fetchRemote();
                        this.remoteLoaded = true;
                } catch (e: unknown) {
                        this.fetchError = e instanceof Error ? e.message : String(e);
                }
                let snapshot: {files:string[];folders:string[]};
                try { snapshot = await this.deps.getLocalSnapshot(); }
                catch (e) {
                        this.fetchError = String(e);
                        if (this.editor) return; // Keep the existing draft and snapshot on Retry.
                        snapshot = {files:[],folders:[]};
                }
                if (this.closed) return;
                this.localEmpty = snapshot.files.length === 0 && snapshot.folders.length === 0;
                this.editor = new PolicyEditor({
                        localFiles: snapshot.files,
                        localFolders: snapshot.folders,
                        remote,
                        cache: this.deps.getCache(),
                        pluginDir: this.deps.pluginDir,
                        policy: this.deps.initialPolicy,
                        // [overhaul S4/LOW] локализованные сообщения валидации.
                        validationMessages: {
                                emptyTarget: this.deps.labels.validationEmptyTarget,
                                unsafeTarget: this.deps.labels.validationUnsafeTarget,
                        },
                        // [W2-T07] Глобальный уровень из настроек; без wiring —
                        // легаси-вывод из policy.mirror (mirror=true ≡ light).
                        mirrorLevel: this.deps.mirrorLevel?.(),
                });
                // [overhaul v4 / Этап 2] editor создан — перерисовать панель
                if (draft) this.editor.replacePolicy(draft);
                // fileExclusions (раньше render() не нашёл editor, теперь есть).
                this.renderFileExclusionsPanel();
        }

        // ── Шапка: пресет (КРАТКО; сводка — в confirm-модалке) ──

        private renderHeader(): void {
                const { contentEl } = this;
                const header = el('div', { cls: 'vts-header' });

                const row = el('div', { cls: 'vts-header-row' });

                const preset = el('select', { cls: 'vts-preset' }) as HTMLSelectElement;
                const t = this.deps.labels;
                for (const [value, label] of [
                        ['full', t.presetFull],
                        ['obsidian', t.presetObsidian],
                        ['custom', t.presetCustom],
                ] as Array<[StructurePreset, string]>) {
                        const opt = el('option', { text: label }) as HTMLOptionElement;
                        opt.value = value;
                        preset.append(opt);
                }
                if (this.editor) {
                        preset.value = this.editor.preset === 'full' && !this.editor.folderPolicyFor('') ? 'full' : this.editor.preset;
                } else {
                        preset.value = 'full';
                }
                preset.disabled = this.deps.isSyncRunning();
                preset.addEventListener('change', () => {
                        if (!this.editor) return;
                        this.editor.setPreset(preset.value as StructurePreset, this.deps.pluginDir);
                        this.render();
                });
                row.append(preset);
                const root=el('button',{cls:'vts-btn',text:i18n.getLocale()==='ru'?'Весь vault: назначить профиль':'Entire vault: assign profile'});
                root.addEventListener('click',()=>this.openProfileAssignment([{scope:'vault',path:''}]));row.append(root);

                // [W2-T07] Чекбокс «Зеркало» УДАЛЁН: policy.mirror — мёртвое
                // легаси-поле (BUG-5/W1-T05), движок читает уровни зеркала.
                // Глобальный уровень — read-only в футере (настройки владеют);
                // пер-папочные — мультивыбором в контекст-меню (Е1).

                header.append(row);
                contentEl.append(header);
        }

        // ── Вкладки + фильтры + поиск ──

        private renderTabs(): void {
                const t = this.deps.labels;
                const bar = el('div', { cls: 'vts-tabbar' });
                const tabRemote = el('button', { cls: 'vts-tab', text: t.tabRemote });
                const tabLocal = el('button', { cls: 'vts-tab', text: t.tabLocal });
                tabRemote.addEventListener('click', () => this.setTab('remote'));
                tabLocal.addEventListener('click', () => this.setTab('local'));
                bar.append(tabRemote, tabLocal);
                this.contentEl.append(bar);

                this.filterBarEl = el('div', { cls: 'vts-filterbar' });
                this.contentEl.append(this.filterBarEl);
        }

        /**
         * [overhaul v4 / Этап 2] Панель управления file exclusions.
         *
         * Список текущих исключений (pattern + scope + note + кнопка удалить)
         * + форма добавления (pattern + scope + кнопка Add) + кнопки-пресеты
         * для быстрого добавления ('data.json', '*.log', '.DS_Store', ...).
         *
         * Вызывается из render() ПОСЛЕ дерева, ДО footer. Идемпотентен —
         * при каждом вызове перерисовывает панель заново (replaceChildren).
         */
        private renderFileExclusionsPanel(): void {
                if (!this.editor) return;
                const t = this.deps.labels;
                const exclusions = this.editor.getFileExclusions();

                // удаляем старую панель, если была
                const oldPanel = this.contentEl.querySelector('.vts-file-exclusions');
                if (oldPanel) oldPanel.remove();

                const panel = el('details', { cls: 'vts-file-exclusions' });
                panel.append(el('summary', { text: t.fileExclusionsTitle }));

                // описание / empty state
                if (exclusions.length === 0) {
                        panel.append(el('p', {
                                cls: 'setting-item-description',
                                text: t.fileExclusionsEmpty,
                        }));
                } else {
                        const list = el('ul', { cls: 'vts-exclusion-list' });
                        for (const ex of exclusions) {
                                const li = el('li', { cls: 'vts-exclusion-item' });
                                const code = el('code', { text: ex.pattern });
                                li.append(code);
                                if (ex.scope) {
                                        const scope = el('span', {
                                                cls: 'vts-exclusion-scope',
                                                text: ` @ ${ex.scope}`,
                                        });
                                        li.append(scope);
                                }
                                if (ex.note) {
                                        const note = el('span', {
                                                cls: 'setting-item-description',
                                                text: ` — ${ex.note}`,
                                        });
                                        li.append(note);
                                }
                                const removeBtn = el('button', {
                                        cls: 'vts-exclusion-remove',
                                        text: '×',
                                        attr: { type: 'button', 'aria-label': 'Remove exclusion' },
                                });
                                removeBtn.title = t.fileExclusionsRemove;
                                removeBtn.addEventListener('click', () => {
                                        this.editor!.removeFileExclusion(ex);
                                        this.renderFileExclusionsPanel();
                                        this.updateFooter();
                                });
                                li.append(removeBtn);
                                list.append(li);
                        }
                        panel.append(list);
                }

                // форма добавления
                const form = el('div', { cls: 'vts-exclusion-form' });
                const patternInput = el('input', {
                        attr: {
                                type: 'text',
                                placeholder: t.fileExclusionsPatternPlaceholder,
                        },
                }) as HTMLInputElement;
                patternInput.classList.add('vts-exclusion-input');
                const scopeInput = el('input', {
                        attr: {
                                type: 'text',
                                placeholder: t.fileExclusionsScopePlaceholder,
                        },
                }) as HTMLInputElement;
                scopeInput.classList.add('vts-exclusion-input');
                const addBtn = el('button', {
                        cls: 'vts-btn vts-exclusion-add',
                        text: t.fileExclusionsAdd,
                        attr: { type: 'button' },
                });
                const doAdd = () => {
                        const pattern = patternInput.value.trim();
                        if (!pattern) return;
                        const scope = scopeInput.value.trim() || undefined;
                        this.editor!.addFileExclusion({ pattern, scope });
                        patternInput.value = '';
                        scopeInput.value = '';
                        this.renderFileExclusionsPanel();
                        this.updateFooter();
                };
                addBtn.addEventListener('click', doAdd);
                patternInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                                e.preventDefault();
                                doAdd();
                        }
                });
                scopeInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                                e.preventDefault();
                                doAdd();
                        }
                });
                form.append(patternInput, scopeInput, addBtn);
                panel.append(form);

                // пресеты — быстрые кнопки
                const presetsWrap = el('div', { cls: 'vts-exclusion-presets' });
                for (const preset of FILE_EXCLUSION_PRESETS) {
                        const btn = el('button', {
                                cls: 'vts-preset-btn',
                                text: preset.pattern,
                                attr: { type: 'button', title: preset.note ?? '' },
                        });
                        btn.addEventListener('click', () => {
                                // для пресетов со scope используем pluginDir если задан
                                const scope = preset.scope === '__pluginDir__'
                                        ? (this.deps.pluginDir || undefined)
                                        : preset.scope;
                                this.editor!.addFileExclusion({
                                        pattern: preset.pattern,
                                        scope,
                                        note: preset.note,
                                });
                                this.renderFileExclusionsPanel();
                                this.updateFooter();
                        });
                        presetsWrap.append(btn);
                }
                panel.append(presetsWrap);

                this.contentEl.append(panel);
        }

        /** Expand/Collapse all — функциональные кнопки filterbar'а (глубокие деревья).
         *  [P2/B5] тултипы — из i18n (labels.expandAll/collapseAll), не хардкоды. */
        private renderExpandButtons(): void {
                if (!this.filterBarEl || !this.editor) return;
                const expand = el('button', { cls: 'vts-filter vts-expand-btn', text: '⊕' });
                expand.title = this.deps.labels.expandAll;
                expand.addEventListener('click', () => {
                        this.expanded = new Set(this.editor!.allNodes()
                                .filter((n) => n.kind === 'folder' && n.path !== '')
                                .map((n) => n.path));
                        this.renderTree();
                });
                const collapse = el('button', { cls: 'vts-filter vts-expand-btn', text: '⊖' });
                collapse.title = this.deps.labels.collapseAll;
                collapse.addEventListener('click', () => {
                        this.expanded = new Set();
                        this.renderTree();
                });
                this.filterBarEl.append(expand, collapse);
        }

        private setTab(tab: TabId): void {
                this.tab = tab;
                this.render();
        }

        private renderFilterBar(): void {
                const t = this.deps.labels;
                if (!this.filterBarEl) return;
                this.filterBarEl.replaceChildren();

                if (this.tab === 'remote') {
                        const mk = (id: RemoteFilterId, label: string): void => {
                                const b = el('button', { cls: `vts-filter ${this.remoteFilter === id ? 'vts-filter-active' : ''}`, text: label });
                                b.addEventListener('click', () => {
                                        this.remoteFilter = id;
                                        // [2] Файл-статусные фильтры требуют файлов: включаем показ
                                        // автоматически (без этого фильтр «Изменения» по папкам пуст).
                                        if (id !== 'all' && !this.showFiles) {
                                                this.showFiles = true;
                                        }
                                        this.renderTree();
                                        this.renderFilterBar();
                                });
                                this.filterBarEl!.append(b);
                        };
                        // [2] Только «Всё» и «Изменения» (update+new+risk одной кнопкой);
                        // excluded/renamed-кнопки убраны — статусы видны в строках.
                        mk('all', t.filterAll);
                        mk('changes', t.filterChanges);
                } else {
                        const mk = (id: LocalFilterId, label: string): void => {
                                const b = el('button', { cls: `vts-filter ${this.localFilter === id ? 'vts-filter-active' : ''}`, text: label });
                                b.addEventListener('click', () => {
                                        this.localFilter = id;
                                        // Файл-статусные фильтры требуют показа файлов.
                                        if (id !== 'all' && !this.showFiles) {
                                                this.showFiles = true;
                                        }
                                        this.renderTree();
                                        this.renderFilterBar();
                                });
                                this.filterBarEl!.append(b);
                        };
                        mk('all', t.filterAll);
                        mk('local-only', t.filterLocalOnly);
                        mk('deleted', t.filterDeleted);
                        mk('conflicts', t.filterConflicts);
                        // «Под угрозой зеркала» — только когда зеркало способно
                        // удалять (глобальный light/full или активный custom).
                        if (this.editor?.canMirrorDelete()) mk('mirror', t.filterMirrorRisk);
                }

                // [1] Select all / Deselect all (только вкладка источника — там чекбоксы).
                if (this.tab === 'remote' && this.editor) {
                        const selAll = el('button', { cls: 'vts-filter vts-select-btn', text: t.filterSelectAll });
                        selAll.disabled = this.deps.isSyncRunning();
                        selAll.addEventListener('click', () => {
                                this.editor?.selectAll();
                                this.renderTree();
                                this.renderStatus();
                        });
                        const deselAll = el('button', { cls: 'vts-filter vts-select-btn', text: t.filterDeselectAll });
                        deselAll.disabled = this.deps.isSyncRunning();
                        deselAll.addEventListener('click', () => {
                                this.editor?.deselectAll();
                                this.renderTree();
                                this.renderStatus();
                        });
                        this.filterBarEl.append(selAll, deselAll);
                }

                // [5] Показать/скрыть файлы: дерево открывается папками — быстро;
                // файловые строки и по-файловые статусы считаются по требованию.
                if (this.editor) {
                        const filesBtn = el('button', {
                                cls: `vts-filter vts-files-btn ${this.showFiles ? 'vts-filter-active' : ''}`,
                                text: this.showFiles ? t.hideFiles : t.showFiles,
                        });
                        filesBtn.addEventListener('click', () => {
                                this.showFiles = !this.showFiles;
                                this.renderTree();
                                this.renderFilterBar();
                        });
                        this.filterBarEl.append(filesBtn);
                }

                this.renderExpandButtons();

                // [W2-T07 / Е1+A2] Тумблер «выбрать несколько» — fallback для
                // мобильных (тап = toggle без Ctrl); индикатор multiSelected(n).
                if (this.editor) {
                        const multi = el('button', {
                                cls: `vts-filter vts-multi-btn ${this.multiSelectMode ? 'vts-filter-active' : ''}`,
                                text: t.multiSelectToggle,
                        });
                        multi.disabled = this.deps.isSyncRunning();
                        multi.addEventListener('click', () => {
                                this.multiSelectMode = !this.multiSelectMode;
                                if (!this.multiSelectMode) this.selected.clear();
                                this.renderTree();
                                this.renderFilterBar();
                        });
                        this.filterBarEl.append(multi);
                        if (this.selected.size > 0) {
                                this.filterBarEl.append(el('span', {
                                        cls: 'vts-multi-count',
                                        text: t.multiSelected(this.selected.size),
                                }));
                        }
                }

                const search = el('input', { cls: 'vts-search', type: 'text', placeholder: t.searchPlaceholder }) as HTMLInputElement;
                search.value = this.search;
                search.addEventListener('input', () => {
                        this.search = search.value.trim().toLowerCase();
                        // Поиск по файлам не имеет смысла при скрытых файлах —
                        // включаем показ автоматически (пользователь ищет конкретное).
                        if (this.search !== '' && !this.showFiles) {
                                this.showFiles = true;
                                this.renderFilterBar();
                                // [P1/M16] renderFilterBar() пересоздал input поиска —
                                // фокус и каретка терялись на ПЕРВОМ введённом символе
                                // (пока showFiles был false). Восстанавливаем фокус
                                // в конец поля: ввод продолжается без разрыва.
                                const restored = this.filterBarEl?.querySelector('input.vts-search') as HTMLInputElement | null;
                                if (restored !== null && restored !== search) {
                                        restored.focus();
                                        const pos = restored.value.length;
                                        restored.setSelectionRange(pos, pos);
                                }
                        }
                        // [W2-T07 / F4] Debounce 200 мс: рендер не на каждый
                        // keystroke (серия быстрых нажатий → один рендер).
                        if (this.searchTimer !== null) clearTimeout(this.searchTimer);
                        this.searchTimer = setTimeout(() => {
                                this.searchTimer = null;
                                this.renderTree();
                        }, SEARCH_DEBOUNCE_MS);
                });
                this.filterBarEl.append(search);
        }

        // ── Пустые состояния ──

        private render(): void {
                this.renderEmptyStates();
                this.renderFilterBar();
                this.renderTree();
                this.renderStatus();
                this.refreshPresetSelect();
                // Активная вкладка подсвечивается.
                const tabs = this.contentEl.querySelectorAll('button.vts-tab');
                (tabs[0] as HTMLElement).classList.toggle('vts-tab-active', this.tab === 'remote');
                (tabs[1] as HTMLElement).classList.toggle('vts-tab-active', this.tab === 'local');
        }

        /** Пресет-селектор актуализируется ПОСЛЕ загрузки (renderHeader идёт до editor). */
        private refreshPresetSelect(): void {
                const select = this.contentEl.querySelector('select.vts-preset') as HTMLSelectElement | null;
                if (!select || !this.editor) return;
                select.value = this.editor.preset;
        }

        /**
         * [overhaul v4 / Этап 2] Обновить футер (статус + уровень) после
         * мутации политики через fileExclusions panel.
         *
         * Делегирует в updateFooterStatus + updateFooterLevel — оба метода
         * уже существуют (см. renderTree). Если они приватные — вызываем
         * через общий updateFooter. Здесь — тонкая обёртка для UI callbacks.
         */
        private updateFooter(): void {
                if (!this.editor || !this.statusEl || !this.levelEl) return;
                // status: сводка политики
                const summary = this.editor.summary();
                this.statusEl.textContent = this.deps.labels.statusSummary(summary);
                // level: эффективный уровень глобальный или корневой
                const rootLevel = this.editor.preset === 'full' && !this.editor.folderPolicyFor('')
                        ? 'full'
                        : this.editor.preset;
                this.renderLevelFooter();
                // preset select тоже мог сброситься — обновим
                this.refreshPresetSelect();
        }

        private renderEmptyStates(): void {
                if (!this.emptyEl) return;
                this.emptyEl.replaceChildren();
                this.emptyEl.hidden = true;
                if (this.fetchError) {
                        this.emptyEl.append(el('span', { cls: 'vts-error-msg', text: this.deps.labels.fetchFailed(this.fetchError) }));
                        const retry = el('button', { cls: 'vts-btn', text: this.deps.labels.retry });
                        retry.addEventListener('click', () => void this.onRetry());
                        this.emptyEl.append(retry);
                        this.emptyEl.hidden = false;
                        return;
                }
                if (!this.editor) return;
                if (this.tab === 'remote') {
                        const hasRemote = this.editor.allNodes().some((n) => n.path !== '' && n.origin !== 'local');
                        if (this.remoteLoaded && !hasRemote) {
                                this.emptyEl.append(el('span', { text: this.deps.labels.emptyRemote }));
                                this.emptyEl.hidden = false;
                        } else if (this.localEmpty && hasRemote) {
                                this.emptyEl.append(el('span', { text: this.deps.labels.emptyLocal }));
                                this.emptyEl.hidden = false;
                        }
                }
        }

        private async onRetry(): Promise<void> {
                this.fetchError = null;
                this.remoteLoaded = false;
                await this.loadTrees();
                if (this.closed) return;
                this.render();
        }

        // ── Дерево (виртуализированный рендер) ──

        private visibleNodes(): VisibleNode[] {
                if (!this.editor) return [];
                const side = this.tab === 'remote' ? 'remote' : 'local';
                const filterActive = this.search !== ''
                        || (this.tab === 'remote' ? this.remoteFilter !== 'all' : this.localFilter !== 'all');
                // [5] Файлы скрыты (дефолт): только папки — быстрый первый экран
                // большого vault; по-файловые статусы/строки не считаются.
                if (!this.showFiles) {
                        return flattenVisible(this.editor.root, this.expanded, side)
                                .filter((v) => v.node.kind === 'folder');
                }
                if (!filterActive) return flattenVisible(this.editor.root, this.expanded, side);
                // Фильтр/поиск активны: папки с совпадениями АВТО-РАСКРЫВАЮТСЯ
                // (иначе фильтр показывает только свёрнутых родителей — бессмысленно),
                // а показываются только узлы на пути к совпадению.
                const expandedSet = new Set(this.expanded);
                const visible = new Set<string>();
                const walk = (n: TreeNode): boolean => {
                        let subtree = false;
                        if (n.kind === 'file' && this.matchesFilters(n)) {
                                visible.add(n.path);
                                subtree = true;
                        }
                        for (const c of n.children) subtree = walk(c) || subtree;
                        if (subtree) {
                                visible.add(n.path);
                                if (n.kind === 'folder') expandedSet.add(n.path);
                        }
                        return subtree;
                };
                walk(this.editor.root);
                return flattenVisible(this.editor.root, expandedSet, side)
                        .filter((v) => visible.has(v.node.path));
        }

        private matchesFilters(node: TreeNode): boolean {
                if (!this.editor) return false;
                if (this.search && !node.path.toLowerCase().includes(this.search)) return false;
                if (node.kind === 'folder') return true; // папки не фильтруются по статусу
                if (this.tab === 'remote') {
                        const st = this.editor.remoteStatusOf(node.path);
                        const hasTarget = this.editor.folderPolicyFor(node.path)?.target !== undefined;
                        return remoteFilterPass(this.remoteFilter, st, hasTarget);
                }
                const st = this.editor.localStatusOf(node.path);
                return localFilterPass(this.localFilter, st);
        }

        private renderTree(): void {
                if (!this.treeEl || !this.editor) return;
                this.renderToken++;
                this.treeEl.replaceChildren();
                this.treeUl = el('ul', { cls: 'vts-tree' });
                this.treeUl.setAttribute('role', 'tree');
                this.treeEl.append(this.treeUl);
                this.currentFlat = this.visibleNodes();
                this.renderSlice();
        }

        private renderSlice(): void {
                if (!this.treeEl || !this.treeUl || !this.currentFlat) return;
                const flat = this.currentFlat;
                const scrollTop = this.treeEl.scrollTop;
                const viewport = this.treeEl.clientHeight || 400;
                const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - VIRTUAL_BUFFER);
                const endIndex = Math.min(flat.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT_PX) + VIRTUAL_BUFFER);
                const slice = flat.slice(startIndex, endIndex);
                this.treeUl.replaceChildren();
                if (startIndex > 0) {
                        this.treeUl.append(this.spacer(startIndex * ROW_HEIGHT_PX));
                }
                for (const v of slice) {
                        this.treeUl.append(this.renderRow(v.node, v.depth));
                }
                if (endIndex < flat.length) {
                        this.treeUl.append(this.spacer((flat.length - endIndex) * ROW_HEIGHT_PX));
                }
        }

        /**
         * [W2-T07 / F6] rAF-коалесцинг рендера слайса при СКРОЛЛЕ: серия
         * scroll-событий одного кадра → один renderSlice (виртуализация
         * не должна перерисовываться на каждый пиксель). В тестах rAF
         * мокается (или работает таймер happy-dom).
         */
        private scheduleSlice(): void {
                if (this.sliceRafPending || this.closed) return;
                this.sliceRafPending = true;
                const raf: (cb: FrameRequestCallback) => number =
                        typeof requestAnimationFrame === 'function'
                                ? requestAnimationFrame.bind(globalThis)
                                : (cb) => setTimeout(() => cb(0), 0) as unknown as number;
                raf(() => {
                        this.sliceRafPending = false;
                        this.renderSlice();
                });
        }

        private spacer(heightPx: number): HTMLElement {
                const sp = el('div', { cls: 'vts-spacer' });
                sp.style.height = `${heightPx}px`;
                return sp;
        }

        private renderRow(node: TreeNode, depth: number): HTMLElement {
                const t = this.deps.labels;
                const li = el('li', { cls: `vts-row vts-${node.kind} vts-depth-${depth}` });
                li.style.paddingInlineStart=`${8+depth*16}px`;
                li.setAttribute('role', 'treeitem');
                li.setAttribute('tabindex','0'); li.setAttribute('aria-level',String(depth+1));
                if(node.kind==='folder') li.setAttribute('aria-expanded',String(this.expanded.has(node.path)));
                li.addEventListener('keydown',e=>{
                        if(e.target!==li)return;
                        if(e.key==='Enter'){e.preventDefault();this.openProfileAssignment([{scope:node.kind==='folder'?'folder':'file',path:node.path}]);}
                        if(node.kind==='folder'&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();if(e.key==='ArrowRight')this.expanded.add(node.path);else this.expanded.delete(node.path);this.renderTree();}
                });
                li.setAttribute('data-path', node.path);
                li.setAttribute('data-kind', node.kind);
                li.setAttribute('data-side', this.tab);

                // [W2-T07 / Е1] Выделение мультивыбора (визуальный класс строки).
                if (this.selected.has(node.path)) {
                        li.classList.add('vts-selected');
                }

                // Twisty (раскрытие).
                const twisty = el('span', { cls: `vts-twisty ${node.kind === 'folder' ? '' : 'vts-leaf'}` });
                twisty.textContent = node.kind === 'folder' ? (this.expanded.has(node.path) ? '▼' : '▶') : '';
                if (node.kind === 'folder') {
                        twisty.addEventListener('click', (e) => {
                                e.stopPropagation();
                                this.onToggleExpand(node.path);
                        });
                }
                li.append(twisty);

                // Чекбокс — ТОЛЬКО на вкладке источника (там живёт выбор).
                if (this.tab === 'remote') {
                        const cb = el('input', { cls: 'vts-checkbox', type: 'checkbox' }) as HTMLInputElement;
                        const state = this.editor ? this.editor.checkboxState(node.path) : 'checked';
                        cb.checked = state === 'checked';
                        cb.indeterminate = state === 'indeterminate';
                        cb.disabled = this.deps.isSyncRunning();
                        cb.setAttribute('data-path', node.path);
                        cb.setAttribute('aria-label',`${i18n.getLocale()==='ru'?'Синхронизировать':'Sync'} ${node.path}`);
                        cb.addEventListener('click',e=>e.stopPropagation());
                        cb.addEventListener('change', () => {
                                this.onCheckboxChange(node, cb.checked ? 'include' : 'exclude');
                        });
                        li.append(cb);
                }

                li.append(el('span', { cls: `vts-icon vts-icon-${node.kind}`, text: node.kind === 'folder' ? '📁' : '' }));
                li.append(el('span', { cls: 'vts-label', text: node.name }));

                const assignments=this.editor?.assignmentCount(this.tab==='remote'?this.editor.localAssignmentPath(node.path):node.path) ?? 0;
                if(node.remoteEntry?.provider) li.append(el('span',{cls:'vts-st vts-c-muted',text:node.remoteEntry.provider}));
                if(assignments) li.append(el('span',{cls:'vts-st vts-c-accent',text:`${i18n.getLocale()==='ru'?'Профили':'Profiles'}: ${assignments}`}));
                // Статусная колонка (цветной текст) — разная легенда вкладок.
                const statusEl = el('span', { cls: 'vts-row-status' });
                if (node.kind === 'file') {
                        statusEl.append(this.fileStatus(node));
                } else {
                        statusEl.append(this.folderStatus(node));
                }
                // Переименование — в статусной колонке рядом со статусом.
                const rule = this.editor?.folderPolicyFor(node.path);
                if (rule?.target) {
                        statusEl.append(el('span', { cls: 'vts-st vts-c-accent', text: `→ ${rule.target.localPath}` }));
                }
                li.append(statusEl);

                if (this.editor && this.editor.effectiveInclude(node.path) === 'exclude') {
                        li.classList.add('vts-state-excluded');
                }

                {
                        // Multi-selection and menus are available for files as well as folders.: Ctrl/⌘+ЛКМ — всегда; в режиме
                        // «выбрать несколько» — обычный тап (A2, мобильный паритет).
                        li.addEventListener('click', (e) => this.onRowClick(e as MouseEvent, node));
                        // [W2-T07 / BUG-18] «⋯» — то же контекст-меню, что и правый
                        // клик: rename/move достижимы с тача (правого клика нет).
                        const menuBtn = el('button', { cls: 'vts-row-menu-btn', type: 'button', text: '⋯' });
                        menuBtn.title = t.rowMenuBtnTitle;
                        menuBtn.setAttribute('aria-label', t.rowMenuBtnTitle);
                        menuBtn.disabled = this.deps.isSyncRunning();
                        menuBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const me = e as MouseEvent;
                                this.openRowMenu(node, { x: me.clientX || 8, y: me.clientY || 8 });
                        });
                        li.append(menuBtn);
                        li.addEventListener('contextmenu', (e) => {
                                this.onContextMenu(e as MouseEvent, node);
                        });
                }
                return li;
        }

        /** Цветная надпись статуса файла. */
        private fileStatus(node: TreeNode): HTMLElement {
                const t = this.deps.labels;
                if (this.tab === 'remote') {
                        const st = this.editor!.remoteStatusOf(node.path);
                        switch (st.kind) {
                                case 'rule': return this.ruleStatusSpan(st.write);
                                case 'synced': return statusSpan('ok', t.stSynced);
                                case 'changed': return statusSpan('warn', t.stChanged);
                                case 'new': return statusSpan('accent', t.stNew);
                                case 'conflict-risk': return statusSpan('warn', t.stRisk);
                                case 'excluded': return statusSpan('faint', t.stExcluded);
                        }
                }
                const st = this.editor!.localStatusOf(node.path);
                return this.localStatusSpan(st);
        }

        private ruleStatusSpan(mode: WriteMode): HTMLElement {
                const ru = i18n.getLocale() === 'ru';
                const labels = {
                        changes: ru ? 'проверка и разрешение конфликтов' : 'check and resolve conflicts',
                        preserve: ru ? 'сохраняется по правилу' : 'preserved by rule',
                        create: ru ? 'существующий файл сохраняется' : 'existing file preserved',
                        update: ru ? 'обновление после проверки локальных правок' : 'update after checking local edits',
                        remote: ru ? 'проверка соответствия источнику' : 'source content check',
                };
                return statusSpan('faint', labels[mode]);
        }

        private localStatusSpan(st: LocalStatus): HTMLElement {
                const t = this.deps.labels;
                switch (st.kind) {
                        case 'rule': return this.ruleStatusSpan(st.write);
                        case 'synced': return statusSpan('ok', t.stLSynced(st.t !== undefined ? formatSyncDay(st.t) : null));
                        case 'changed': return statusSpan('warn', t.stLChanged);
                        // [W2-T07 / конец BUG-1-UI] Честные статусы по уровню:
                        // подпись обещает ровно то, что сделает движок (§2.2).
                        case 'local-only':
                                return statusSpan(
                                        localStatusColor(st),
                                        st.mirrorLevel === 'full' ? t.stLLocalOnlyFull
                                                : st.mirrorLevel === 'light' ? t.stLLocalOnlyLight
                                                : t.stLLocalOnly,
                                );
                        case 'not-synced':
                                return statusSpan(
                                        localStatusColor(st),
                                        st.mirrorLevel === 'full' ? t.stLNotSyncedFull
                                                : st.mirrorLevel === 'light' ? t.stLNotSyncedLight
                                                : t.stLNotSynced,
                                );
                        case 'deleted-in-source':
                                // light/full: ex-synced orphan уходит в корзину (§2.2 строка 3);
                                // fetch — старая нейтральная подпись.
                                return statusSpan(
                                        localStatusColor(st),
                                        st.mirrorLevel === 'fetch' ? t.stLDeleted : t.stLMirrorDelete,
                                );
                        case 'conflict-copy': return statusSpan('danger', t.stLConflictCopy);
                        case 'plugin-locked': return statusSpan('faint', t.stPlugin);
                }
        }

        /** Компактная цветная подпись папки (счётчики статусов потомков-файлов). */
        private folderStatus(node: TreeNode): HTMLElement {
                const t = this.deps.labels;
                const wrap = el('span', { cls: 'vts-folder-status' });
                if (!this.editor) return wrap;
                // Сама папка может иметь собственный статус (плагин — защищён).
                if (this.tab === 'local') {
                        const own = this.editor.localStatusOf(node.path);
                        if (own.kind === 'plugin-locked') {
                                wrap.append(statusSpan('faint', t.stPlugin));
                                return wrap;
                        }
                }
                const c = this.editor.folderCountersOf(node, this.tab);
                const total = c.synced + c.changed + c.new + c.conflictRisk + c.excluded
                        + c.localOnly + c.notSynced + c.deletedInSource + c.conflictCopies + c.pluginLocked;
                const labels = this.tab === 'remote'
                        ? remoteFolderLabel(c, total, {
                                update: t.cntUpdate,
                                newFiles: t.cntNew,
                                risk: t.cntRisk,
                                files: t.cntFiles,
                        })
                        : localFolderLabel(c, total, {
                                localOnly: t.cntLocalOnly,
                                notSynced: t.cntNotSynced,
                                deleted: t.cntDeleted,
                                conflicts: t.cntConflicts,
                                files: t.cntFiles,
                        });
                labels.forEach((part, i) => {
                        if (i > 0) wrap.append(el('span', { cls: 'vts-c-sep', text: ' · ' }));
                        wrap.append(statusSpan(part.color, part.text));
                });
                return wrap;
        }

        // ── Интерактивность ──

        private onToggleExpand(path: string): void {
                if (this.expanded.has(path)) this.expanded.delete(path);
                else this.expanded.add(path);
                this.renderTree();
        }

        private onCheckboxChange(node: TreeNode, state: 'include' | 'exclude'): void {
                if (!this.editor || this.deps.isSyncRunning()) return;
                this.editor.toggle(node.path, state);
                this.renderTree();
                this.renderStatus();
        }

        /**
         * [W2-T07 / Е1] Клик по строке ПАПКИ: Ctrl/⌘ (или режим «выбрать
         * несколько», A2) — toggle выделения; обычный клик — снять всё
         * выделение (если было). Чекбокс/twisty/«⋯» не попадают сюда
         * (stopPropagation).
         */
        private onRowClick(e: MouseEvent, node: TreeNode): void {
                if (!this.editor || this.deps.isSyncRunning()) return;
                const additive = e.ctrlKey || e.metaKey || this.multiSelectMode;
                if (!additive) {
                        if (this.selected.size > 0) {
                                this.selected.clear();
                                this.renderTree();
                                this.renderFilterBar();
                        }
                        return;
                }
                if (this.selected.has(node.path)) this.selected.delete(node.path);
                else this.selected.add(node.path);
                this.renderTree();
                this.renderFilterBar();
        }

        private onContextMenu(e: MouseEvent, node: TreeNode): void {
                e.preventDefault();
                e.stopPropagation();
                this.openRowMenu(node, { x: e.clientX, y: e.clientY });
        }

        /**
         * [W2-T07] Единое меню строки (правый клик И «⋯» — BUG-18, мобильный
         * паритет): при выделении ≥2 папок и клике по выделенной — меню ГРУППЫ
         * (Е1: уровни/exclude/include-only/reset применяются одной операцией);
         * иначе — обычное меню одного узла.
         */
        private openRowMenu(node: TreeNode, pos: { x: number; y: number }): void {
                if (!this.editor || this.deps.isSyncRunning()) return;
                const group = this.selected.size >= 2 && this.selected.has(node.path)
                        ? [...this.selected]
                        : null;
                this.buildRowMenu(node, group).showAtPosition(pos);
        }

        private buildRowMenu(node: TreeNode, group: string[] | null): Menu {
                const t = this.deps.labels;
                const menu = new Menu();
                if (!this.editor) return menu; // без модели — пустое меню (не открывается)
                const targets = group ?? [node.path];
                const isFolder = node.kind === 'folder';

                menu.addItem((item:MenuItemLike)=>{
                        item.setTitle(i18n.getLocale()==='ru'?'Назначить профиль…':'Assign profile…');
                        item.onClick(()=>this.openProfileAssignment(targets.map(path=>({path,scope:this.editor!.allNodes().find(n=>n.path===path)?.kind==='folder'?'folder':'file'}))));
                });
                menu.addSeparator();
                if (this.tab === 'remote') {
                        if (isFolder && !group) {
                                // [3] ОДИН пункт «Специфическая синхронизация» вместо пары
                                // Rename/Move: мини-модалка с обоими вариантами (move —
                                // выбор папки из структуры локального vault).
                                // Только ОДНА папка — группе rename/move не бывает.
                                menu.addItem((item: MenuItemLike) => {
                                        item.setTitle(t.menuSpecificSync);
                                        item.onClick(() => this.openSpecificSyncModal(node));
                                });
                                const rule = this.editor.folderPolicyFor(node.path);
                                if (rule?.target) {
                                        menu.addItem((item: MenuItemLike) => {
                                                item.setTitle(t.clearTarget);
                                                item.onClick(() => this.applyToModel(() => {
                                                        this.editor?.setTarget(node.path, undefined);
                                                }));
                                        });
                                }
                                menu.addSeparator();
                        }
                        menu.addItem((item: MenuItemLike) => {
                                item.setTitle(t.menuExclude);
                                item.onClick(() => this.applyToModel(() => {
                                        for (const p of targets) this.editor?.toggle(p, 'exclude');
                                }));
                        });
                        menu.addItem((item: MenuItemLike) => {
                                item.setTitle(t.menuIncludeOnly);
                                item.onClick(() => this.applyToModel(() => {
                                        if (group) this.editor?.includeSubtreesOnly(group);
                                        else this.editor?.includeSubtreeOnly(node.path);
                                }));
                        });
                        menu.addSeparator();
                        menu.addItem((item: MenuItemLike) => {
                                item.setTitle(t.menuReset);
                                item.onClick(() => this.applyToModel(() => {
                                        for (const p of targets) this.editor?.resetSubtree(p);
                                }));
                        });
                }
                return menu;
        }

        private openProfileAssignment(targets:{scope:'vault'|'folder'|'file';path:string}[]):void {
                if(!this.editor || this.deps.isSyncRunning())return;
                if(this.tab==='remote') targets=targets.map(t=>t.scope==='vault'?t:{...t,path:this.editor!.localAssignmentPath(t.path)});
                const modal=new ProfileAssignmentModal(this.app,{targets,policy:this.editor.getPolicy(),
                        profiles:this.deps.profiles ?? [],connections:this.deps.connections ?? [],
                        apply:assignments=>{this.editor!.assignProfiles(assignments,this.deps.profiles ?? []);this.render();}});
                trackModal(modal);modal.open();
        }

        /** Мутация модели из меню + перерисовка (дерево/бейджи/футер). */
        private applyToModel(mutate: () => void): void {
                mutate();
                this.renderTree();
                this.renderStatus();
        }

        /** [3] Мини-модалка «Специфическая синхронизация» (rename / move). */
        private openSpecificSyncModal(node: TreeNode): void {
                const modal = new SpecificSyncModal(this.app, {
                        sourcePath: node.path,
                        currentTarget: this.editor?.folderPolicyFor(node.path)?.target,
                        labels: this.deps.labels,
                        pathPolicy: this.deps.pathPolicy,
                        /** Локальные папки для выбора цели перемещения. */
                        localFolders: this.editor
                                ? this.editor.allNodes()
                                        .filter((n) => n.kind === 'folder' && n.path !== '' && n.origin !== 'remote')
                                        .map((n) => n.path)
                                        .sort()
                                : [],
                        onApply: (target) => {
                                if (!this.editor) return;
                                this.editor.setTarget(node.path, target);
                                this.renderTree();
                                this.renderStatus();
                        },
                });
                // [overhaul S4 / S3-review #2] SpecificSync — в реестре модалок.
                trackModal(modal);
                modal.open();
        }

        private renderStatus(): void {
                if (!this.statusEl || !this.editor) return;
                this.statusEl.textContent = this.deps.labels.statusSummary(this.editor.summary());
                this.renderLevelFooter();
        }

        /** [W2-T07 / Е3] Футер: глобальный уровень + счётчики custom-папок. */
        private renderLevelFooter(): void {
                if (!this.levelEl || !this.editor) return;
                this.levelEl.textContent = `${i18n.getLocale()==='ru'?'Назначений профилей':'Profile assignments'}: ${this.editor.assignmentCount()}`;
        }

        private async onSave(): Promise<void> {
                if (!this.editor) return;
                const errors = this.editor.validate(this.deps.pathPolicy);
                if (errors.length > 0) {
                        new Notice(this.deps.labels.validateErrorNotice(errors.join('; ')), 8000);
                        return;
                }
                try {
                        await this.deps.onSave(this.editor.getPolicy());
                } catch (e: unknown) {
                        new Notice(this.deps.labels.validateErrorNotice(e instanceof Error ? e.message : String(e)), 8000);
                        return;
                }
                new Notice(this.deps.labels.savedNotice(this.editor.summary()), 3000);
                // [W2-T07 / F10] Сохранено — закрытие без unsaved-confirm.
                this.closeApproved = true;
                this.close();
        }
}

/**
 * [W2-T07 / F10] Мини-confirm «Несохранённые изменения»: Discard — закрыть
 * редактор без сохранения (closeApproved у родителя), Stay — вернуться к
 * правке. Обычная Modal-обёртка (мок трекает в __allModals — тесты жмут
 * кнопки по текстам словаря).
 */
class UnsavedConfirmModal extends Modal {
        constructor(
                app: App,
                private readonly opts: {
                        title: string;
                        body: string;
                        discardText: string;
                        stayText: string;
                        onDiscard: () => void;
                },
        ) {
                super(app);
        }

        onOpen(): void {
                const { contentEl } = this;
                contentEl.replaceChildren();
                contentEl.classList.add('vts-confirm-modal');
                contentEl.append(el('h3', { text: this.opts.title }));
                contentEl.append(el('p', { text: this.opts.body }));
                const btns = el('div', { cls: 'vts-rename-btns' });
                const stay = el('button', { cls: 'vts-btn', text: this.opts.stayText });
                stay.addEventListener('click', () => this.close());
                const discard = el('button', { cls: 'vts-btn vts-btn-warning', text: this.opts.discardText });
                discard.addEventListener('click', () => {
                        this.opts.onDiscard();
                        this.close();
                });
                btns.append(stay, discard);
                contentEl.append(btns);
        }
}

/**
 * Sub-модалка «Специфическая синхронизация» (§3.9 + [3]): ДВА режима
 * в одном окне — «переименовать в» (текст) и «переместить в» (выбор
 * папки локального vault деревом). Текущая цель отображается и
 * снимается. Валидация preview-time: непустота + isPathSafe;
 * окончательная — validate() редактора при Save.
 */
class SpecificSyncModal extends Modal {
        constructor(
                app: App,
                private readonly opts: {
                        sourcePath: string;
                        currentTarget?: { kind: 'rename' | 'move'; localPath: string };
                        labels: VaultTreeModalLabels;
                        pathPolicy: PathPolicy;
                        localFolders: string[];
                        onApply: (target: { kind: 'rename' | 'move'; localPath: string } | undefined) => void;
                },
        ) {
                super(app);
        }

        onOpen(): void {
                const t = this.opts.labels;
                const { contentEl } = this;
                contentEl.replaceChildren();
                contentEl.classList.add('vts-specific-modal');
                contentEl.append(el('h3', { text: t.menuSpecificSync }));
                contentEl.append(el('p', { text: t.renamePrompt(this.opts.sourcePath) }));

                // Текущая цель (если задана) + снятие.
                if (this.opts.currentTarget) {
                        const cur = this.opts.currentTarget;
                        const box = el('div', { cls: 'vts-specific-current' });
                        box.append(el('span', {
                                cls: 'vts-st vts-c-accent',
                                text: `${cur.kind === 'rename' ? '→' : '⇢'} ${cur.localPath}`,
                        }));
                        const clear = el('button', { cls: 'vts-btn', text: t.clearTarget });
                        clear.addEventListener('click', () => {
                                this.opts.onApply(undefined);
                                this.close();
                        });
                        box.append(clear);
                        contentEl.append(box);
                }

                // Переименовать в (одно имя сегмента).
                const renameSection = el('div', { cls: 'vts-specific-section' });
                renameSection.append(el('h4', { text: t.renameTitle }));
                const input = el('input', {
                        cls: 'vts-rename-input',
                        type: 'text',
                        placeholder: t.renamePlaceholder,
                }) as HTMLInputElement;
                const feedback = el('div', { cls: 'vts-rename-feedback' });
                const validate = (): boolean => {
                        const raw = input.value.trim();
                        if (!raw) {
                                feedback.textContent = t.renameFeedbackEmpty;
                                feedback.className = 'vts-rename-feedback vts-error';
                                return false;
                        }
                        if (!this.opts.pathPolicy.isPathSafe(raw)) {
                                feedback.textContent = t.renameFeedbackUnsafe;
                                feedback.className = 'vts-rename-feedback vts-error';
                                return false;
                        }
                        feedback.textContent = t.renameFeedbackWillLand(raw);
                        feedback.className = 'vts-rename-feedback vts-ok';
                        return true;
                };
                input.addEventListener('input', validate);
                const renameBtn = el('button', { cls: 'vts-btn vts-btn-cta', text: t.renameConfirm });
                renameBtn.addEventListener('click', () => {
                        if (!validate()) {
                                new Notice(t.renameFixFirst, 3000);
                                return;
                        }
                        this.opts.onApply({ kind: 'rename', localPath: input.value.trim() });
                        this.close();
                });
                renameSection.append(input, feedback, renameBtn);
                contentEl.append(renameSection);

                // Переместить в (выбор папки локального vault).
                const moveSection = el('div', { cls: 'vts-specific-section' });
                moveSection.append(el('h4', { text: t.moveTitle }));
                const pickBtn = el('button', { cls: 'vts-btn', text: t.pickFolderBtn });
                pickBtn.addEventListener('click', () => {
                        const picker = new FolderPickerModal(this.app, {
                                title: t.moveTitle,
                                folders: this.opts.localFolders,
                                placeholder: t.searchPlaceholder,
                                confirmText: t.renameConfirm,
                                cancelText: t.renameCancel,
                                onPick: (folder) => {
                                        this.opts.onApply({ kind: 'move', localPath: folder });
                                        this.close();
                                },
                        });
                        // [overhaul S4 / S3-review #2] FolderPicker — в реестре модалок.
                        trackModal(picker);
                        picker.open();
                });
                moveSection.append(pickBtn);
                contentEl.append(moveSection);

                const closeBtn = el('div', { cls: 'vts-rename-btns' });
                const cancel = el('button', { cls: 'vts-btn', text: t.renameCancel });
                cancel.addEventListener('click', () => this.close());
                closeBtn.append(cancel);
                contentEl.append(closeBtn);
                input.focus();
        }
}

/**
 * Выбор папки локального vault (для «переместить в»): плоский список
 * путей папок с отступами по глубине + поиск. Клик — выбор и подтверждение.
 */
class FolderPickerModal extends Modal {
        constructor(
                app: App,
                private readonly opts: {
                        title: string;
                        folders: string[];
                        placeholder: string;
                        confirmText: string;
                        cancelText: string;
                        onPick: (folder: string) => void;
                },
        ) {
                super(app);
        }

        onOpen(): void {
                const { contentEl } = this;
                contentEl.replaceChildren();
                contentEl.classList.add('vts-folder-picker');
                contentEl.append(el('h3', { text: this.opts.title }));

                const search = el('input', {
                        cls: 'vts-search vts-picker-search',
                        type: 'text',
                        placeholder: this.opts.placeholder,
                }) as HTMLInputElement;
                contentEl.append(search);

                const list = el('div', { cls: 'vts-picker-list' });
                const renderList = (query: string): void => {
                        list.replaceChildren();
                        const q = query.trim().toLowerCase();
                        const folders = q
                                ? this.opts.folders.filter((f) => f.toLowerCase().includes(q))
                                : this.opts.folders;
                        for (const folder of folders) {
                                const depth = folder.split('/').length - 1;
                                const row = el('div', {
                                        cls: 'vts-picker-row',
                                });
                                row.style.paddingLeft = `${8 + depth * 16}px`;
                                row.append(el('span', { cls: 'vts-icon vts-icon-folder', text: '📁' }));
                                row.append(el('span', { cls: 'vts-label', text: folder }));
                                row.addEventListener('click', () => {
                                        this.opts.onPick(folder);
                                        this.close();
                                });
                                list.append(row);
                        }
                        if (folders.length === 0) {
                                list.append(el('div', { cls: 'vts-empty', text: '—' }));
                        }
                };
                renderList('');
                search.addEventListener('input', () => renderList(search.value));
                contentEl.append(list);

                const btns = el('div', { cls: 'vts-rename-btns' });
                const cancel = el('button', { cls: 'vts-btn', text: this.opts.cancelText });
                cancel.addEventListener('click', () => this.close());
                btns.append(cancel);
                contentEl.append(btns);
                search.focus();
        }
}
