// src/ui/policy-editor.ts — логика редактирования SyncPolicy в модалке
// (Phase 3 модуля Vault Structure Sync Policy; дизайн §3.4/§3.5/§3.8/§3.9).
//
// ЧИСТЫЙ модуль: без obsidian/DOM. Хранит рабочую копию политики (клон
// initialPolicy) + merged-дерево; модалка только рендерит и форвардит
// события. Так ВСЯ интерактивная логика (tri-state, тулбар, контекст-меню,
// валидация rename) тестируется без DOM.
//
// КЛЮЧЕВОЕ УПРОЩЕНИЕ против дизайна (§3.5): toggle НЕ размножает правила
// на потомков. Семантика applyPolicy (Phase 1) — префиксная: правило
// exclude на папке уже исключает ВСЁ поддерево; display-наследование
// (effectiveInclude) даёт тот же эффект в UI. Разреженная политика
// переживает переименования/перемещения папок лучше плотной. Отклонение
// от дизайн-теста §8.2 #5 задокументировано в tests/policy-editor.test.ts.
//
// selectAll/deselectAll/includeSubtreeOnly — тоже разреженные: одно
// правило на корень/цель вместо N правил на N папок (эквивалентная
// семантика через префиксное наследование).

import type { CacheEntry, FileExclusion, RemoteEntry } from '../sources/types';
import type { PathPolicy } from '../core/path-policy';
import type { FolderPolicy, SyncPolicy } from '../core/policy';
import { EMPTY_POLICY, normalizePolicyPath } from '../core/policy';
import type { FolderMirrorRule, MirrorLevel } from '../core/mirror';
import {
        folderCounters,
        localStatus,
        remoteStatus,
        type FolderCounters,
        type LocalStatus,
        type RemoteStatus,
        type StatusSnapshot,
        type StructurePreset,
} from './status';
import {
        buildLocalTree,
        buildRemoteTree,
        mergeTrees,
        sortChildren,
        findNode,
        iterAll,
        iterDescendants,
        type TreeNode,
} from './tree-walk';

/** Display-состояние чекбокса. */
export type CheckboxState = 'checked' | 'unchecked' | 'indeterminate';

/** Сводка политики для футера/кнопки настроек.
 *  [W2-T07] mirror — уровень-осознанный (глобальный light/full или хотя бы
 *  один активный custom): легаси-флаг policy.mirror источником правды
 *  больше не является (BUG-5/W1-T05). */
export interface PolicySummary {
        included: number;
        excluded: number;
        renames: number;
        mirror: boolean;
}

export interface PolicyEditorInit {
        /** Снимок локальных ФАЙЛОВ. */
        localFiles: string[];
        /** Снимок локальных ПАПОК (вкл. пустые). */
        localFolders: string[];
        /** Снимок удалённого манифеста. */
        remote: RemoteEntry[];
        /** [Phase 4] Кэш последнего применённого состояния (для статусов). */
        cache: Map<string, CacheEntry>;
        /** [Phase 4] Папка самого плагина ('.obsidian/plugins/<dir>'). */
        pluginDir: string;
        /** Исходная политика (клонируется — вход не мутируется). */
        policy: SyncPolicy;
        /** [W2-T07] Глобальный уровень зеркала из НАСТРОЕК (settings.mirrorLevel).
         *  Опционален: без него — легаси-вывод policy.mirror ? 'light' : 'fetch'
         *  (миграция §2.4: mirror=true ≡ light, ровно поведение 2.3.3). */
        mirrorLevel?: MirrorLevel;
        /** [overhaul S4/LOW] Локализуемые сообщения валидации rename/move-целей
         *  (модуль чистый — без i18n-импорта; строки приходят снаружи).
         *  Опционально: без них — англоязычные fallback-строки. */
        validationMessages?: {
                emptyTarget: (path: string) => string;
                unsafeTarget: (path: string, target: string) => string;
        };
}

export class PolicyEditor {
        readonly root: TreeNode;
        private readonly policy: SyncPolicy;
        private readonly nodeByPath: Map<string, TreeNode>;
        private readonly snap: StatusSnapshot;
        /** [W2-T07] Явный глобальный уровень (из настроек); undefined → легаси-вывод. */
        private readonly explicitLevel: MirrorLevel | undefined;
        /** [W2-T07 / F10] Отпечаток исходной политики для dirty-трекинга. */
        private readonly initialFingerprint: string;
        /** Кэш правил для префиксного effectiveInclude (сортировка по специфичности). */
        private sortedRulesCache: FolderPolicy[] = [];
        private rulesDirty = true;
        /** [W2-T07 / F7] Мемо-кэш счётчиков папок: снимок (remote/cache/local)
        *  неизменен, инвалидируется только мутациями модели. */
        private readonly countersCache = new Map<string, FolderCounters>();

        /** [overhaul S4/LOW] Локализованные сообщения валидации (см. init). */
        private readonly validationMessages: Required<NonNullable<PolicyEditorInit['validationMessages']>>;

        constructor(init: PolicyEditorInit) {
                this.validationMessages = init.validationMessages ?? {
                        emptyTarget: (path) => `"${path}": empty target path`,
                        unsafeTarget: (path, target) => `"${path}" -> "${target}": unsafe path`,
                };
                const local = buildLocalTree(init.localFiles, init.localFolders);
                const remote = buildRemoteTree(init.remote);
                this.root = mergeTrees(local, remote);
                sortChildren(this.root);
                this.policy = clonePolicy(init.policy);
                this.explicitLevel = init.mirrorLevel;
                this.initialFingerprint = policyFingerprint(this.policy);
                this.nodeByPath = new Map(iterAll(this.root).map((n) => [n.path, n]));
                this.snap = {
                        remote: new Map(init.remote.map((e) => [normalizePolicyPath(e.path), e])),
                        cache: init.cache,
                        local: new Set(init.localFiles.map(normalizePolicyPath)),
                        mirrorLevel: init.mirrorLevel ?? legacyLevelOf(init.policy),
                        mirrorFolders: this.policy.mirrorFolders,
                        // [W2-T07] sync-exclude защищает от зеркальных удалений
                        // (applyPolicy фильтрует до плана) — статусы это учитывают.
                        excludedFromSync: (p) => this.effectiveInclude(p) === 'exclude',
                        pluginDir: normalizePolicyPath(init.pluginDir),
                };
        }

        // ── Чтение ──

        /** Явное правило на пути (undefined = нет). */
        folderPolicyFor(path: string): FolderPolicy | undefined {
                return this.policy.folders.find((f) => f.path === normalizePolicyPath(path));
        }

        /**
         * Эффективный include узла (дизайн §3.5): ПРЕФИКСНЫЙ поиск правил —
         * самое специфичное совпавшее не-'inherit' правило побеждает, нет
         * правил — 'include'. Семантика 1:1 с resolveInclude из core/policy
         * (applyPolicy) — UI и sync видят одно и то же ДЛЯ ЛЮБОГО пути,
         * в том числе отсутствующего в дереве (parent-цепочка дерева,
         * использовавшаяся раньше, расходилась с sync для таких путей —
         * поймано тестом setPreset(full) с блокировкой плагина).
         */
        effectiveInclude(path: string): 'include' | 'exclude' {
                const norm = normalizePolicyPath(path);
                for (const f of this.ensureRules()) {
                        const key = f.path;
                        const hit = key === '' || norm === key || norm.startsWith(key + '/');
                        if (!hit) continue;
                        if (f.include === 'include' || f.include === 'exclude') return f.include;
                }
                return 'include';
        }

        /** Правила по убыванию специфичности (кэш; инвалидируется мутациями). */
        private ensureRules(): FolderPolicy[] {
                if (this.rulesDirty) {
                        this.sortedRulesCache = [...this.policy.folders]
                                .sort((a, b) => b.path.length - a.path.length);
                        this.rulesDirty = false;
                }
                return this.sortedRulesCache;
        }

        /**
         * Display-состояние чекбокса (дизайн §3.5, уточнено): множество
         * эффективных состояний узла + всех потомков; одно — показываем его;
         * смешанное — indeterminate. В отличие от refreshAncestorDisplay
         * дизайна (только прямые дети), сюда входит и сам узел: если все
         * потомки исключены, а сам узел включён (наследует), честный
         * индикатор — indeterminate, не unchecked.
         */
        checkboxState(path: string): CheckboxState {
                const norm = normalizePolicyPath(path);
                const node = this.nodeByPath.get(norm);
                const states = new Set<'include' | 'exclude'>([this.effectiveInclude(norm)]);
                if (node) {
                        for (const d of iterDescendants(node)) {
                                states.add(this.effectiveInclude(d.path));
                        }
                }
                if (states.size > 1) return 'indeterminate';
                return states.values().next().value === 'include' ? 'checked' : 'unchecked';
        }

        /** Сводка для футера. */
        summary(): PolicySummary {
                let included = 0;
                let excluded = 0;
                let renames = 0;
                for (const f of this.policy.folders) {
                        if (f.include === 'include') included++;
                        else if (f.include === 'exclude') excluded++;
                        if (f.target) renames++;
                }
                return { included, excluded, renames, mirror: this.canMirrorDelete() };
        }

        /** Рабочая копия политики (клон — безопасно передавать в onSave). */
        getPolicy(): SyncPolicy {
                return clonePolicy(this.policy);
        }

        /**
         * Валидация rename/move-целей (дизайн §6.1, слой persist-time):
         * каждая цель обязана проходить isPathSafe. Возвращает список
         * описаний ошибок (пустой = ок).
         */
        validate(pathPolicy: PathPolicy): string[] {
                // [overhaul S4/LOW] строки валидации — через i18n-инъекцию
                // (раньше — хардкод русских строк в чистом модуле).
                const errors: string[] = [];
                for (const f of this.policy.folders) {
                        if (!f.target) continue;
                        const target = normalizePolicyPath(f.target.localPath);
                        if (target === '') {
                                errors.push(this.validationMessages.emptyTarget(f.path));
                                continue;
                        }
                        if (!pathPolicy.isPathSafe(target)) {
                                errors.push(this.validationMessages.unsafeTarget(f.path, target));
                        }
                }
                return errors;
        }

        /** Узел дерева по пути (для рендера строк). */
        node(path: string): TreeNode | undefined {
                return this.nodeByPath.get(normalizePolicyPath(path));
        }

        /** Все узлы (для рендера). */
        allNodes(): TreeNode[] {
                return iterAll(this.root);
        }

        // ── [Phase 4] Статусы вкладок (делегирование status.ts) ──

        /** Статус строки на вкладке ИСТОЧНИК. */
        remoteStatusOf(path: string): RemoteStatus {
                return remoteStatus(normalizePolicyPath(path), this.snapshot(), this.effectiveInclude(path));
        }

        /** Статус строки на вкладке ТЕКУЩИЙ VAULT. */
        localStatusOf(path: string): LocalStatus {
                return localStatus(normalizePolicyPath(path), this.snapshot());
        }

        /** Счётчики статусов файлов поддерева (для подписи папки).
         *  [W2-T07 / F7] Мемоизация: ключ — сторона+путь; кэш живёт до
         *  ближайшей мутации модели (снимок статуса неизменен). */
        folderCountersOf(node: TreeNode, side: 'remote' | 'local'): FolderCounters {
                const key = `${side}:${node.path}`;
                const cached = this.countersCache.get(key);
                if (cached) return cached;
                const files = iterDescendants(node).filter((n) => n.kind === 'file').map((n) => n.path);
                const effective = (p: string): 'include' | 'exclude' => this.effectiveInclude(p);
                const counters = folderCounters(files, side, this.snapshot(), side === 'remote' ? effective : undefined);
                this.countersCache.set(key, counters);
                return counters;
        }

        /** Живой снимок (уровень и mirrorFolders синхронизированы с политикой). */
        private snapshot(): StatusSnapshot {
                this.snap.mirrorLevel = this.mirrorLevel;
                this.snap.mirrorFolders = this.policy.mirrorFolders;
                return this.snap;
        }

        /** Пресет структуры (шапка модалки). */
        get preset(): StructurePreset {
                if (this.policy.preset === 'full' || this.policy.preset === 'obsidian') return this.policy.preset;
                return this.policy.folders.some((f) => f.include !== 'inherit' || f.target) ? 'custom' : 'full';
        }

        // ── [W2-T07] Модель уровней зеркала (spec §2.1; мульти-выбор Е1) ──

        /** Глобальный уровень: явный (настройки) либо легаси-вывод из
         *  policy.mirror (mirror=true ≡ light — миграция §2.4, Д8=1). */
        get mirrorLevel(): MirrorLevel {
                return this.explicitLevel ?? legacyLevelOf(this.policy);
        }

        /** Явное mirror-правило папки (off/on/custom из mirrorFolders). */
        folderLevelRule(path: string): FolderMirrorRule | undefined {
                return this.policy.mirrorFolders?.[normalizePolicyPath(path)];
        }

        /** Custom-уровень папки для бейджа (Е3=1): undefined — бейджа нет
         *  (наследует / off / on). fetch-custom бейджем не маркируется. */
        folderCustomLevel(path: string): MirrorLevel | undefined {
                const rule = this.folderLevelRule(path);
                return rule?.state === 'custom' ? rule.level : undefined;
        }

        /** Установить custom-уровень папки (создаёт/заменяет запись).
         *  Override самодостаточен — работает и при глобальном fetch (Д2). */
        setFolderLevel(path: string, level: MirrorLevel): void {
                const norm = normalizePolicyPath(path);
                if (norm === '') return; // корень всегда наследует глобальный уровень
                const folders: Record<string, FolderMirrorRule> = { ...(this.policy.mirrorFolders ?? {}) };
                folders[norm] = { state: 'custom', level };
                this.policy.mirrorFolders = folders;
                this.invalidateCaches();
        }

        /** Сбросить custom-запись → наследование (Е1-в: уровень берётся
         *  родительской цепочкой, НЕ жёстко глобальный). */
        resetFolderLevel(path: string): void {
                const norm = normalizePolicyPath(path);
                if (!this.policy.mirrorFolders || !(norm in this.policy.mirrorFolders)) return;
                const folders: Record<string, FolderMirrorRule> = { ...this.policy.mirrorFolders };
                delete folders[norm];
                this.policy.mirrorFolders = folders;
                this.invalidateCaches();
        }

        /** Счётчики custom-папок по уровням (футер модалки, Е3). */
        customLevelCounts(): { light: number; full: number } {
                let light = 0;
                let full = 0;
                for (const rule of Object.values(this.policy.mirrorFolders ?? {})) {
                        if (rule.state !== 'custom') continue;
                        if (rule.level === 'light') light++;
                        else if (rule.level === 'full') full++;
                }
                return { light, full };
        }

        /** Зеркало способно удалять? (видимость фильтра «под угрозой зеркала»:
         *  глобальный light/full ИЛИ хотя бы один активный custom-override.) */
        canMirrorDelete(): boolean {
                if (this.mirrorLevel !== 'fetch') return true;
                return Object.values(this.policy.mirrorFolders ?? {}).some(
                        (r) => r.state === 'custom' && r.level !== undefined && r.level !== 'fetch',
                );
        }

        /** [W2-T07 / F10] Несохранённые правки? Канонический отпечаток модели
         *  (порядок-независимый: «правка туда-обратно» dirty гасит). */
        isDirty(): boolean {
                return policyFingerprint(this.policy) !== this.initialFingerprint;
        }

        /** Установить политику пресета (перезаписывает правила, mirror не трогает). */
        setPreset(preset: StructurePreset, pluginDir: string): void {
                if (preset === 'full') {
                        const keepMirror = this.policy.mirror;
                        this.policy.folders = pluginDir ? [{ path: normalizePolicyPath(pluginDir), include: 'exclude' }] : [];
                        this.invalidateCaches();
                        this.policy.preset = 'full';
                        this.policy.mirror = keepMirror;
                } else if (preset === 'obsidian') {
                        const keepMirror = this.policy.mirror;
                        const folders = [
                                { path: '', include: 'exclude' as const },
                                { path: '.obsidian', include: 'include' as const },
                        ];
                        if (pluginDir) folders.push({ path: normalizePolicyPath(pluginDir), include: 'exclude' as const });
                        this.policy.folders = folders;
                        this.invalidateCaches();
                        this.policy.preset = 'obsidian';
                        this.policy.mirror = keepMirror;
                } else {
                        // custom: просто помечаем; правила правятся деревом.
                        this.policy.preset = 'custom';
                }
        }

        // ── Мутации (модалка зовёт из обработчиков) ──

        /**
         * Тоггл узла: ЯВНОЕ правило только на самом узле (разреженно;
         * см. комментарий модуля). Возвращает true, если что-то изменилось.
         */
        toggle(path: string, state: 'include' | 'exclude'): boolean {
                return this.setFolderPolicy(normalizePolicyPath(path), (existing) => ({
                        ...existing,
                        include: state,
                }));
        }

        /** Разреженный select all: корень include, прочие include/exclude-правила сняты. */
        selectAll(): void {
                this.policy.folders = this.policy.folders
                        .filter((f) => f.target)
                        .map((f) => ({ path: f.path, include: 'inherit' as const, ...(f.target ? { target: f.target } : {}) }));
                this.invalidateCaches();
                this.setRootInclude('include');
        }

        /** Разреженный deselect all: корень exclude, прочие include/exclude-правила сняты. */
        deselectAll(): void {
                this.policy.folders = this.policy.folders
                        .filter((f) => f.target)
                        .map((f) => ({ path: f.path, include: 'inherit' as const, ...(f.target ? { target: f.target } : {}) }));
                this.invalidateCaches();
                this.setRootInclude('exclude');
        }

        /**
         * «Синхронизировать только это поддерево» (§3.8): корень exclude,
         * прочие include/exclude сняты, путь include.
         */
        includeSubtreeOnly(path: string): void {
                const norm = normalizePolicyPath(path);
                this.deselectAll();
                this.setFolderPolicy(norm, (existing) => ({ ...existing, include: 'include' }));
        }

        /**
         * [W2-T07 / Е1] Групповое «синхронизировать только эти поддеревья»:
         * один deselectAll на группу (последовательные includeSubtreeOnly
         * затирали бы друг друга — семантика группы иная), затем include
         * каждой выбранной папки.
         */
        includeSubtreesOnly(paths: string[]): void {
                this.deselectAll();
                for (const raw of paths) {
                        const norm = normalizePolicyPath(raw);
                        if (norm === '') continue;
                        this.setFolderPolicy(norm, (existing) => ({ ...existing, include: 'include' }));
                }
        }

        /**
         * Сброс правил поддерева (§3.8): само правило и все правила-потомки
         * удаляются (наследуют). target-правил это тоже касается.
         */
        resetSubtree(path: string): void {
                const norm = normalizePolicyPath(path);
                const prefix = norm === '' ? '' : norm + '/';
                this.policy.folders = this.policy.folders.filter((f) => {
                        const fp = normalizePolicyPath(f.path);
                this.invalidateCaches();
                        return fp !== norm && !fp.startsWith(prefix);
                });
        }

        /** Установить/заменить/снять rename/move-цель узла. */
        setTarget(path: string, target: { kind: 'rename' | 'move'; localPath: string } | undefined): void {
                const norm = normalizePolicyPath(path);
                if (target === undefined) {
                        this.policy.folders = this.policy.folders.filter((f) => f.path !== norm || !f.target);
                this.invalidateCaches();
                        return;
                }
                this.setFolderPolicy(norm, (existing) => ({ ...existing, target }));
        }

        /**
         * [W2-T07] ЛЕГАСИ-ось: тумблер зеркала 2.3.3. Чекбокс из модалки
         * УДАЛЁН (policy.mirror движком больше не читается — BUG-5/W1-T05);
         * метод остаётся для совместимости старых data.json/тестов: true
         * транслируется в уровень light (миграция §2.4), false — fetch.
         */
        setMirror(v: boolean): void {
                this.policy.mirror = v;
        }

        get mirror(): boolean {
                return this.policy.mirror;
        }

        // ── [overhaul v4 / Этап 2] File exclusions (per-file/per-glob) ──

        /**
         * Текущие fileExclusions (копия массива; мутировать возвращённое
         * безопасно — не влияет на политику). Для UI рендера списка.
         */
        getFileExclusions(): FileExclusion[] {
                return (this.policy.fileExclusions ?? []).map((e) => ({ ...e }));
        }

        /**
         * Добавить exclusion. Дедуп по pattern+scope: если уже есть
         * идентичное — no-op. Иначе добавляет и инвалидировать кэш вывода
         * (хотя exclusion не влияет на counters, он влияет на отображаемые
         * статусы через matchesFileExclusion в будущем; консервативно
         * инвалидируем для согласованности).
         */
        addFileExclusion(ex: FileExclusion): void {
                if (!this.policy.fileExclusions) this.policy.fileExclusions = [];
                const exists = this.policy.fileExclusions.some(
                        (e) => e.pattern === ex.pattern && (e.scope ?? '') === (ex.scope ?? ''),
                );
                if (!exists) {
                        this.policy.fileExclusions.push({ ...ex });
                        this.invalidateCaches();
                }
        }

        /** Удалить exclusion по точному совпадению pattern+scope. */
        removeFileExclusion(ex: FileExclusion): void {
                if (!this.policy.fileExclusions) return;
                const before = this.policy.fileExclusions.length;
                this.policy.fileExclusions = this.policy.fileExclusions.filter(
                        (e) => !(e.pattern === ex.pattern && (e.scope ?? '') === (ex.scope ?? '')),
                );
                if (this.policy.fileExclusions.length === before) return;
                if (this.policy.fileExclusions.length === 0) {
                        // удалён последний — выкинуть поле (serialise как absent)
                        delete this.policy.fileExclusions;
                }
                this.invalidateCaches();
        }

        // ── Внутреннее ──

        private setRootInclude(state: 'include' | 'exclude'): void {
                this.setFolderPolicy('', (existing) => ({ ...existing, include: state }));
        }

        /** Инвалидация кэшей вывода (правила + счётчики) при мутации модели. */
        private invalidateCaches(): void {
                this.rulesDirty = true;
                this.countersCache.clear();
        }

        /** Создать/обновить правило на пути; false — правило не изменилось. */
        private setFolderPolicy(path: string, update: (existing: FolderPolicy) => FolderPolicy): boolean {
                const idx = this.policy.folders.findIndex((f) => f.path === path);
                if (idx >= 0) {
                        const next = update(this.policy.folders[idx]);
                        if (JSON.stringify(next) === JSON.stringify(this.policy.folders[idx])) return false;
                        this.policy.folders[idx] = next;
                        this.invalidateCaches();
                        return true;
                }
                this.policy.folders.push(update({ path, include: 'inherit' }));
                this.invalidateCaches();
                return true;
        }
}

/**
 * Глубокий клон политики (structuredClone недоступен в ES2018-таргете).
 * [W2-T07] Клонирует и mirrorFolders — раньше ось уровней молча терялась
 * при getPolicy()/сохранении (записи модалки переживали только folders).
 */
function clonePolicy(p: SyncPolicy): SyncPolicy {
        return {
                version: p.version,
                mirror: p.mirror === true,
                folders: (p.folders ?? []).map((f) => ({
                        path: f.path,
                        include: f.include,
                        ...(f.target ? { target: { kind: f.target.kind, localPath: f.target.localPath } } : {}),
                })),
                ...(p.mirrorFolders
                        ? {
                                mirrorFolders: Object.fromEntries(
                                        Object.entries(p.mirrorFolders).map(([k, v]) => [
                                                k,
                                                { state: v.state, ...(v.level ? { level: v.level } : {}) },
                                        ]),
                                ) as Record<string, FolderMirrorRule>,
                        }
                        : {}),
                ...(p.preset ? { preset: p.preset } : {}),
        };
}

/**
 * [W2-T07] Легаси-вывод глобального уровня из 2.3.3-поля policy.mirror:
 * true ≡ light, false/отсутствует ≡ fetch (миграция §2.4, Д8=1 — апгрейд
 * никому не меняет поведение). Дубль migrateLegacyMirrorLevel без входа
 * deleteMissing (политика его не несёт — он глобальный).
 */
function legacyLevelOf(p: SyncPolicy): MirrorLevel {
        return p.mirror === true ? 'light' : 'fetch';
}

/**
 * [W2-T07 / F10] Канонический отпечаток политики для dirty-трекинга:
 * массивы правил сортируются — перестановка НЕ правка; «туда-обратно»
 * возвращает исходный отпечаток и dirty гаснет.
 */
function policyFingerprint(p: SyncPolicy): string {
        const folders = p.folders
                .map((f) => [f.path, f.include, f.target ? `${f.target.kind}:${f.target.localPath}` : null])
                .sort();
        const mirror = Object.entries(p.mirrorFolders ?? {})
                .map(([k, v]) => [k, v.state, v.level ?? null])
                .sort();
        return JSON.stringify([p.version, p.mirror === true, p.preset ?? null, folders, mirror]);
}

/** Пустая политика для инициализации (реэкспорт для main.ts). */
export { EMPTY_POLICY };
