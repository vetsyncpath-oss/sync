import { runtimePackage } from './runtime-package';
import { cancellable } from './cancellable';
import { ResourceGate } from './resource-gate';
import { SyncFault, syncIssue, diagnosticText } from './sync-issue';
import type { PipelineStage, FileActivity, TransferEvent } from '../sources/types';
import { NetError } from './net';
import { resolveFileRule, validateFileRules } from './file-rules';
// ============================================================
// --- CORE/COORDINATOR (фаза 4-2) ---
// Единственный владелец конвейера синхронизации (дизайн §16):
//   acquire-мьютекс → guards → manifest → PathPolicy → diff →
//   confirm → pMap-загрузка (ConflictResolver) → удаления →
//   кэш-flush → статистика.
// Force downloads retain the baseline; retries respect their due times.
// Session ownership includes final persistence and source disposal.
// A durable operation journal and vault-wide runner belong to the next stage.
// Все тексты/модалки/статус-бар — за SyncUI; ядро чистое от
// obsidian/i18n (В5-1).
// ============================================================

import type {
        ConfirmSyncInfo,
        FailedFile,
        RemoteEntry,
        SyncPhase,
        SyncStats,
        SyncPlanRow,
        SyncUI,
        VaultAdapter,
} from '../sources/types';
import { ManifestCache } from './manifest-cache';
import { FailedQueue } from './queue';
import { PathPolicy } from './path-policy';
import { ConflictResolver, buildStampedPath, bytesEqual, formatConflictTimestamp } from './conflict';
import { DirLock } from './dirlock';
import { diff } from './diff';
import { applyPolicy, EMPTY_POLICY, type SyncPolicy } from './policy';
// [W1-T07] Единая модель зеркала (уровни × охват, матрица §2.2):
// уровень из настроек, скан vault при full, per-файловый уровень для
// конфликт-резолвера. Двойная система удалений (deleteMissing-тумблер
// против policy.mirror, BUG-5) умерла — единственный источник удалений
// теперь policyResult.mirrorPlan.
import {
                isAutoExcluded,
                shouldTraverseFolder,
                levelOf,
                normalizeMirrorModel,
                scanVaultTree,
                type MirrorDeletion,
                type MirrorLevel,
                type MirrorModel,
                type MirrorPlan,
} from './mirror';
import { pMap } from '../utils/concurrency';
import { formatBytes, formatDuration } from '../utils/format';
// [overhaul S6] тег сборки: каждая сессия маркируется в консоли — по логу
// всегда видно, какая версия конвейера исполняется (урок инцидента «всё
// так же»: деливерабл не содержал собранного main.js, а логи были
// неотличимы от старой версии).
import { BUILD_TAG } from './build';
import { validateManifest, verifyRemoteData } from './source-validation';
import { createOperationPlan, type OperationPlan, type PlannedMove } from './operation-plan';
import { assertLocal, MISSING, versionOf, type LocalVersion } from './local-version';
import { crc32Hex, gitBlobSha1Hex } from './hasher';
import type { DurableMutations } from './durable-mutations';

/** Локализуемые сообщения конвейера (инъекция из main.ts). */
export interface CoordinatorMessages {
        alreadyInProgress: string;
        offline: string;
        notConfigured: string;
        upToDate: string;
        cancelled: string;
        syncFailed: (msg: string) => string;
        deletingFiles: (n: number) => string;
        orphanWarning: (n: number) => string;
        syncedWithErrors: (n: number) => string;
        success: (downloaded: number, deleted: number, conflicts: number, duration: string) => string;
        fileTooLarge: (size: string, limit: string) => string;
        conflictKeptLocal: (path: string) => string;
        conflictBoth: (path: string) => string;
        conflictsDeferred?: string;
        nothingToRetry: string;
        retryNotDue: (pending: number) => string;
        /** [overhaul S6 / D-4] N записей припаркованы после исчерпания
         *  попыток (retry cap) — автоповторы прекращены; лечение — Force
         *  Resync или Clear Queue. */
        retryParked: (parked: number) => string;
        /** [W4-T02] Auto-сессия отложила N опасных удалений до ручного повтора. */
        deletionsDeferred: (n: number) => string;
        deletionsBlocked?: (n: number) => string;
        /** [P2/3.2] Фазы конвейера — текст статус-бара на границах фаз
         *  (манифест → политика → дифф → удаления → загрузки → финализация).
         *  Popover рисует полосу по индексу фазы (SyncProgress.phase), эти
         *  строки — человеческий текст той же полосы в статус-баре. */
        phaseManifest: string;
        phasePolicy: string;
        phaseDiff: string;
        phaseDeletions: string;
        phaseDownloads: string;
        phaseFinalize: string;
}

/** Policy options are captured per session; liveness and revision checks stay live. */
export interface CoordinatorOptions {
        /** In-memory semantic configuration epoch; credentials are never persisted here. */
        configurationRevision?(): number;
        preparedRevision?(): number;
        /** [W1-T07 / BUG-5] Глобальный уровень зеркала из настроек
         *  (fetch/light/full). Единственный вход модели удалений;
         *  легаси-тумблер deleteMissing умер (семантика миграции §2.4:
         *  deleteMissing=true ⇒ 'light'). */
        mirrorLevel(): MirrorLevel;
        useTrash(): boolean;
        isOnline(): boolean;
        isConfigured(): boolean;
        /** Лимит одного файла, байт: override (тесты/спец-сценарии).
         * Движковый лимит консультируется у источника (Git: 99 МБ — GitHub
         * hard limit; облака/ZIP: без лимита); безлимит по умолчанию. */
        maxFileSizeBytes?: number;
        /** Конкурентность загрузки. Default 4. */
        concurrency?: number;
        bufferBudgetBytes?:number;
        sourceCircuits?():Record<string,{retryAt:number;failures:number}>;
        /** Checkpoint кэша/состояния каждые N файлов. Default 10. */
        checkpointInterval?: number;
        /** Персистентность (очередь/счётчики) — колбэк main.ts. */
        persistState?(kind: 'checkpoint' | 'session-end' | 'success-end'): void | Promise<void>;
        /** [W4-T02] Подробные уведомления (А5, Д6=1+2). verboseNotices=false
         *  (дефолт) → в auto-режиме низкоприоритетные notifyVerbose дропаются. */
        verboseNotices?(): boolean;
        /** [P2/B6] Диагностический лог конвейера (console.log). false/undefined
         *  (дефолт) → per-сессионный шум [VaultSync]-строк заглушен; аномалии
         *  и ошибки остаются (console.warn/error всегда). Единый флаг с
         *  verboseNotices — «подробность» одна на всё (§5.22 пост-аудита). */
        verboseLogs?(): boolean;
}

export interface CoordinatorDeps {
        mutations?: DurableMutations;
        source: import('../sources/types').SyncSource;
        vault: VaultAdapter;
        cache: ManifestCache;
        queue: FailedQueue;
        policy: PathPolicy;
        conflict: ConflictResolver;
        ui: SyncUI;
        messages: CoordinatorMessages;
        options: CoordinatorOptions;
        /** [POLICY Phase 2] per-source структура-политика (дизайн §5.3);
         * undefined = нет сохранённой политики → legacy-поведение
         * (deleteMissing-настройка решает удаления, переименований нет). */
        syncPolicy?: SyncPolicy;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_CHECKPOINT = 10;

export class Coordinator {
        private running = false;
        private shouldCancel = false;
        private controller: AbortController | null = null;
        private checkpointCounter = 0;
        // [4-4-fix] пофайловая отмена: сессия завершилась досрочно
        private abortedThisSession = false;
        // [7-d] журнал §7.5: сколько записей источника отброшено как небезопасные
        private skippedUnsafeCount = 0;
        private readonly dirLock = new DirLock();
        private persistChain: Promise<void> = Promise.resolve();
        private failedDeletions = 0;
        private activeDeps?: CoordinatorDeps;
        private sessionRevision?: number;
        private plan?: OperationPlan;
        private traceStats?:SyncStats;
        private traceLast=new Map<string,string>();
        private trace(event:TransferEvent,path?:string,source?:string):void{
                const stats=this.traceStats;if(!stats)return;source??=event.source;
                const key=JSON.stringify([path,source]),state=JSON.stringify([event.stage,event.attempt,event.retryAt]);if(this.traceLast.get(key)===state)return;this.traceLast.set(key,state);
                const list=stats.trace??=[];list.push({...event,at:Date.now(),path,source});if(list.length>500){list.shift();stats.traceDropped=(stats.traceDropped??0)+1;}
        }
        private sessionStage:PipelineStage='preparing';
        private participatingPaths?:Set<string>;
        private activeFailures():FailedFile[] {return this.current.queue.all().filter(file=>this.current.policy.isPathAllowed(file.path)&&(!this.participatingPaths||this.participatingPaths.has(file.path)));}
        private activeFailureCount(): number { return this.activeFailures().length; }
        private get current(): CoordinatorDeps { return this.activeDeps ?? this.deps; }

        private captureSession(): void {
                const deps = this.deps, options = deps.options;
                const mirror = options.mirrorLevel(), trash = options.useTrash();
                this.sessionRevision = options.preparedRevision?.() ?? options.configurationRevision?.();
                this.activeDeps = { ...deps, policy: deps.policy.snapshot(), conflict: deps.conflict.snapshot(),
                        syncPolicy: deps.syncPolicy && structuredClone(deps.syncPolicy), messages: { ...deps.messages },
                        options: { ...options, mirrorLevel: () => mirror, useTrash: () => trash } };
        }
        private guard(path?: string, incoming = false): void {
                this.controller?.signal.throwIfAborted();
                if (this.sessionRevision !== this.deps.options.configurationRevision?.()) {
                        this.cancel(); throw new DOMException('Configuration changed during sync', 'AbortError');
                }
                if (path && (!this.current.policy.isPathSafe(path) || this.current.policy.isProtectedPath(path)
                        || (incoming ? !this.current.policy.isConflictCopy(path) : !this.current.policy.isPathAllowed(path)))) throw new Error(`Protected mutation path: ${path}`);
        }

        /** [P2/B6] Диагностический лог конвейера — только при verboseLogs().
         *  Аномалии (warn) и ошибки (error) — всегда, без гейта. */
        private debugLog(msg: string): void {
                if (this.current.options.verboseLogs?.()) console.log(`[VaultSync] ${msg}`);
        }

        /**
         * [overhaul S6] Однострочный итог сессии — ВСЕГДА в консоль (info).
         * Старт/финиш каждой сессии маркируется тегом сборки: присланный
         * пользователем лог самодостаточен для диагностики (версия кода,
         * полнота конвейера, размер очереди и parked-записи) — без
         * verbose-флага и без угадываний. Формат:
         *   session end (build=s6): outcome=ok downloaded=12 deleted=0
         *   conflicts=0 skipped=0 failed=0 queue=0 parked=0 bytes=… duration=…ms
         */
        private sessionEndLog(stats: SyncStats): string {
                const parked = this.current.queue.poisonedCount();
                return (
                        `session end (build=${BUILD_TAG}): outcome=${stats.outcome ?? 'unknown'} ` +
                        `downloaded=${stats.downloaded} deleted=${stats.deleted} ` +
                        `conflicts=${stats.conflicts} skipped=${stats.skipped} ` +
                        `failed=${stats.failed} queue=${this.current.queue.size()} parked=${parked} ` +
                        `bytes=${stats.bytesTransferred} duration=${stats.duration}ms`
                );
        }

        // deps.policy/deps.cache заменяемы через setPolicy/setCache (настройки/источник)
        constructor(private deps: CoordinatorDeps) {}

        isRunning(): boolean {
                return this.running;
        }

        cancel(): void {
                this.shouldCancel = true;
                this.controller?.abort();
        }

        // ============================================================
        // --- ОСНОВНОЙ КОНВЕЙЕР ---
        // ============================================================

        /**
         * Сессия синхронизации. null = не стартовала (guard/отмена на
         * подтверждении); иначе — честная статистика, включая отмену
         * посередине (кэш отражает только реально записанное).
         */
        async sync(opts: { forcedPaths?: Set<string>; forceAll?: boolean; trigger?: 'manual' | 'auto'; missingOnly?:boolean;onlyForcedPaths?:boolean } = {}): Promise<SyncStats | null> {
                opts = { ...opts, forcedPaths: opts.forcedPaths && new Set(opts.forcedPaths) };
                const { ui, messages: m } = this.current;
                let o = this.current.options;

                if (this.running) { ui.notify(m.alreadyInProgress); return null; }
                if (!o.isOnline()) { ui.notify(m.offline); ui.setStatus('offline'); return null; }
                if (!o.isConfigured()) { ui.notify(m.notConfigured); ui.setStatus('unconfigured'); return null; }

                this.running = true;
                this.shouldCancel = false;
                this.checkpointCounter = 0;
                this.failedDeletions = 0;
                this.abortedThisSession = false;
                this.skippedUnsafeCount = 0;
                const controller = new AbortController();
                this.controller = controller;
                const startTime = Date.now();
                const stats: SyncStats = {
                        sessionId:crypto.randomUUID(),problems:[],pendingBefore:0,pendingAfter:0,networkBytes:0,notAttempted:0,
                        results: [], updated: 0, received: 0,
                        totalFiles: 0, downloaded: 0, deleted: 0, skipped: 0,
                        failed: 0, bytesTransferred: 0, duration: 0, conflicts: 0,
                };

                // [overhaul S6] Идентификация сборки — ВСЕГДА (не под verbose-гейтом):
                // одна строка на сессию, по которой в присланном логе видно,
                // исполняется ли актуальный код (см. src/core/build.ts).
                console.info(
                        `[VaultSync] session start: build=${BUILD_TAG}, trigger=${opts.trigger ?? 'manual'}, ` +
                                `forced=${opts.forcedPaths?.size ?? 0}, forceAll=${String(Boolean(opts.forceAll))}`,
                );

                try {
                        this.traceLast.clear();this.traceStats=stats;this.trace({stage:'recovery'});this.sessionStage='recovery';this.captureSession();
                        o = this.current.options;
                        this.guard();
                        validateFileRules(this.current.syncPolicy?.fileRules);
                        ui.setStatus('syncing', { phase: 0, stage:'recovery',lastActivityAt:Date.now(), progressText: m.phaseManifest });
                        const mutations = this.current.mutations;
                        if (mutations) {
                                const recovered = await mutations.recover(this.current.cache.namespace,controller.signal);
                                mutations.projectCache(this.current.cache.namespace, this.current.cache);
                                for (const record of recovered) {
                                        const effect = record.effect;
                                        if (effect?.kind === 'set') {
                                                const failed = this.current.queue.all().find(file => file.path === effect.remote.path && file.hash === effect.remote.hash);
                                                if (failed) this.current.queue.delete(failed.path);
                                        }
                                }
                        }
                        this.sessionStage='manifest';const manifestStart = Date.now();
                        await this.current.cache.flush();
                        const inventory = await this.current.source.getManifest(controller.signal,event=>{this.trace(event);ui.setStatus('syncing',{phase:0,stage:event.stage,bytesTransferred:event.bytes??0,totalBytes:event.totalBytes??0,lastActivityAt:Date.now(),activities:[{...event,path:'',lastActivityAt:Date.now()}]});});
                        validateManifest(inventory);
                        const manifest = inventory.map(entry => Object.freeze({ ...entry }));
                        if (manifest.some(entry => !this.current.policy.isPathSafe(entry.path))) throw new Error('Unsafe source inventory');
                        const safeEntries = manifest.filter((e) => this.filterRemoteEntry(e));
                        this.debugLog(`manifest: ${manifest.length} записей (${Date.now() - manifestStart}ms), после path-policy: ${safeEntries.length}`);

                        // [POLICY Phase 2, дизайн §5.3] per-source структура-политика:
                        // применяем ПОСЛЕ getManifest и ДО diff. Нет сохранённой
                        // политики (undefined) → EMPTY_POLICY = манифест без
                        // изменений (legacy-поведение, ни один существующий
                        // пользователь не меняет поведение). Записи, чей ЛОКАЛЬНЫЙ
                        // путь не прошёл валидацию (битые цели rename) или дал
                        // коллизию, выпадают с unsafeCount — видимы в §7.5-notice.
                        const syncPolicy = this.current.syncPolicy;
                        const hasPolicy = syncPolicy !== undefined;

                        // [W1-T07] Модель зеркала сессии: глобальный уровень из
                        // настроек + per-source охват (mirrorFolders) из политики.
                        // Санитизация — на случай битого data.json. Без политики
                        // folders = {} — действует глобальный уровень.
                        const mirrorModel: MirrorModel = normalizeMirrorModel({
                                level: o.mirrorLevel(),
                                folders: syncPolicy?.mirrorFolders ?? {},
                        });

                        // [P2/3.2] фаза 1 — политика (скан full + applyPolicy + renames).
                        ui.setStatus('syncing', { phase: 1, progressText: m.phasePolicy });

                        // [W1-T07 / R7] Скан vault нужен ТОЛЬКО когда full активен
                        // хотя бы где-то (глобально или custom-override) и сессия
                        // вообще выполняет удаления (retry/force — паритет старого
                        // поведения: без удалений). Отмена во время скана →
                        // Error{aborted} → честная ветка cancelled (W1-T01).
                        const fullActive =
                                syncPolicy?.fileRules?.some(r => r.delete === 'mirror') || mirrorModel.level === 'full' ||
                                Object.values(mirrorModel.folders).some((r) => r.state === 'custom' && r.level === 'full');
                        let scan: Awaited<ReturnType<typeof scanVaultTree>> | undefined;
                        if (fullActive && !opts.forcedPaths && !opts.forceAll && typeof this.current.vault.list === 'function') {
                                scan = await scanVaultTree(this.current.vault, {
                                        signal: controller.signal,
                                        // Прун поддеревьев: автоисключения (.trash, File Recovery)
                                        // и off-папки без выбранных потомков — папка →
                                        // blocked (выживающий потомок защищает родителя
                                        // от extra-удаления). Не-допустимые ПОЛИТИКОЙ ПУТЕЙ
                                        // файлы (.git/*, отключённые плагины) скан видит, но
                                        // planMirrorDeletions их не удаляет (isPathEligible).
                                        pruneFolder: (f) =>
                                                isAutoExcluded(f) || this.current.policy.isProtectedPath(f) || !shouldTraverseFolder(mirrorModel, f),
                                });
                                this.debugLog(`mirror-scan: файлов=${scan.files.length}, папок=${scan.folders.length}, ` +
                                        `обрезано=${scan.blocked.length} (full активен)`);
                        }

                        const policyResult = applyPolicy(
                                safeEntries,
                                syncPolicy ?? EMPTY_POLICY,
                                this.current.policy,
                                Object.keys(this.current.cache.entries()),
                                {
                                        mirrorLevel: mirrorModel.level,
                                        scan,
                                },
                        );
                        this.skippedUnsafeCount += policyResult.unsafeCount;
                        if (hasPolicy || policyResult.mirrorPlan.stats.orphan + policyResult.mirrorPlan.stats.localOnly > 0) {
                                const mp = policyResult.mirrorPlan.stats;
                                this.debugLog(`policy: правило=${syncPolicy?.folders.length ?? 0}, mirror-уровень=${mirrorModel.level}, ` +
                                        `excluded=${policyResult.excludedCount}, unsafe=${policyResult.unsafeCount}, ` +
                                        `toMove=${policyResult.toMove.length}, итог манифест=${policyResult.transformedManifest.length}, ` +
                                        `зеркало: orphan=${mp.orphan}, local-only=${mp.localOnly}, extra=${mp.extraFolders}, ` +
                                        `пропущено off=${mp.skippedOff}/уровень=${mp.skippedFetch}/защита=${mp.skippedProtected}/` +
                                        `ineligible=${mp.skippedIneligible}/fileExcl=${mp.skippedExcluded}`);
                        }

                        // Validate the plan before the preview; perform moves only after acceptance.
                        if (policyResult.unsafeCount > 0) throw new Error('Unsafe or ambiguous local mapping');

                        // [POLICY Phase 2] Обратная карта local→remote: source.fetch
                        // по-прежнему получает REMOTE-путь (источник не знает о
                        // локальных переименованиях); запись в vault и ключи кэша —
                        // по LOCAL. Без политики карта пуста — путь не меняется.
                        const localToRemote = new Map<string, string>();
                        for (const [remotePath, localPath] of policyResult.renameMap) {
                                localToRemote.set(localPath, remotePath);
                        }

                        const entries = policyResult.transformedManifest;
                        validateManifest(entries);

                        let toDownload: RemoteEntry[];
                        let toDelete: string[] = [];
                        let orphans: string[] = [];
                        // [W1-T07] удаления с уровнями/причинами (confirm-секции,
                        // журнал) и лишние папки к удалению целиком.
                        let mirrorDeletions: MirrorDeletion[] = [];
                        let extraFolders: MirrorPlan['extraFolders'] = [];

                        // [P2/3.2] фаза 2 — дифф с кэшем (confirm-модалка — в этой же фазе:
                        // полоса честно остаётся на «Сравнении», пока пользователь решает).
                        ui.setStatus('syncing', { phase: 2, progressText: m.phaseDiff });
                        if(opts.missingOnly){const missing=await pMap(entries,async entry=>(await this.current.vault.exists(entry.path))?undefined:entry.path,DEFAULT_CONCURRENCY);const error=missing.find(value=>value instanceof Error);if(error)throw error;opts.forcedPaths=new Set(missing.filter((value):value is string=>typeof value==='string'));opts.onlyForcedPaths=true;}
                        if(opts.forcedPaths&&!opts.missingOnly){const groups=new Set([...opts.forcedPaths].map(runtimePackage).filter(Boolean));for(const file of entries)if(groups.has(runtimePackage(file.path)))opts.forcedPaths.add(file.path);}
                        if (opts.forceAll) {
                                // forceResync: качаем всё; удаления/чистка кэша не выполняются
                                toDownload = entries;
                        } else {
                                // [W1-T07 / BUG-5] авторитет удалений — ЕДИНЫЙ: модель
                                // зеркала (policyResult.mirrorPlan, матрица §2.2).
                                // Легаси-развилка «тумблер deleteMissing против
                                // policy.mirror» умерла; diff зовётся всегда с
                                // deleteMissing:false и отдаёт только загрузки,
                                // кэш-чистку и orphans (для предупреждения).
                                const d = await diff(this.current.cache.entries(), entries, {
                                        deleteMissing: false,
                                        isAllowed: (p) => this.current.policy.isPathAllowed(p),
                                        exists: (p) => this.current.vault.exists(p),
                                });
                                this.debugLog(`diff: к загрузке=${d.toDownload.length} (up-to-date=${d.upToDate}), ` +
                                        `удалить=${policyResult.mirrorPlan.deletions.length + policyResult.mirrorPlan.extraFolders.length}, ` +
                                        `orphans=${d.orphans.length}, cacheCleanup=${d.cacheCleanup.length}`);
                                stats.skipped = d.upToDate;

                                if (opts.forcedPaths) {
                                        // retry/scan: принудительный список + обычные изменения;
                                        // удаления не выполняются (паритет старого поведения)
                                        const inList = new Set(d.toDownload.map((e) => e.path));
                                        toDownload = [...d.toDownload];
                                        let forcedUpToDate = 0;
                                        for (const e of entries) {
                                                if (opts.forcedPaths.has(e.path) && !inList.has(e.path)) {
                                                        toDownload.push(e);
                                                        forcedUpToDate++;
                                                }
                                        }
                                        // forced-файлы, бывшие up-to-date, не считаем дважды
                                        stats.skipped = Math.max(0, d.upToDate - forcedUpToDate);
                                        // Forced download is not permission to forget unresolved orphans.
                                } else {
                                        toDownload = d.toDownload;
                                        mirrorDeletions = policyResult.mirrorPlan.deletions;
                                        extraFolders = policyResult.mirrorPlan.extraFolders;
                                        // Enumerate file removals; never recursively delete a directory.
                                        toDelete = [
                                                ...extraFolders.flatMap((f) => f.filesInside),
                                                ...mirrorDeletions.map((x) => x.path),
                                        ];
                                        orphans = d.orphans;
                                }
                        }

                        const ruleFor = (path: string) => resolveFileRule(path, syncPolicy?.fileRules);
                        if(opts.onlyForcedPaths)toDownload=toDownload.filter(file=>opts.forcedPaths?.has(file.path));
                        const enforceRemote = (path: string) => (!opts.onlyForcedPaths||opts.forcedPaths?.has(path))&&(ruleFor(path).write === 'remote'
                                || (ruleFor(path).write === undefined && levelOf(mirrorModel, path) === 'full'));
                        const skippedRows:SyncPlanRow[]=[];
                        toDownload=toDownload.filter(entry=>{
                                if(ruleFor(entry.path).write==='preserve'){stats.skipped++;skippedRows.push({action:'skip',path:entry.path,source:entry.provider,reason:'preserve'});stats.results!.push({path:entry.path,source:entry.provider,status:'skipped',reason:'preserve'});return false;}
                                const limit=Math.min(o.maxFileSizeBytes??Infinity,this.current.source.maxFileSizeBytes??Infinity,this.current.source.fileSizeLimit?.(entry)??Infinity,(o.bufferBudgetBytes??256*1024*1024)/4);
                                if(entry.size<=limit)return true;
                                const issue=syncIssue(new SyncFault('file-too-large',m.fileTooLarge(formatBytes(entry.size),formatBytes(limit))),'preparing');
                                this.current.queue.add(entry,issue.message,Date.now(),'blocked',0,issue);stats.failed++;stats.results!.push({path:entry.path,remotePath:entry.sourcePath,source:entry.provider,status:'error',reason:issue.code,issue});skippedRows.push({action:'blocked',path:entry.path,source:entry.provider,reason:'file-too-large'});return false;
                        });
                        const oversized=new Set(skippedRows.filter(row=>row.reason==='file-too-large').map(row=>row.path));
                        const observations = new Map<string, LocalVersion>();
                        const localDigests = new Map<string, string>();
                        const entryByPath = new Map(entries.map(entry => [entry.path, entry]));
                        const paths = new Set([...toDownload.map(entry => entry.path),
                                ...entries.filter(entry => enforceRemote(entry.path)&&!oversized.has(entry.path)).map(entry => entry.path), ...toDelete,
                                ...policyResult.toMove.flatMap(move => [move.from, move.to])]);
                        this.sessionStage='observe-local';ui.setStatus('syncing',{phase:2,stage:'observe-local',lastActivityAt:Date.now()});
                        const observed = await pMap([...paths], async path => {
                                this.guard();
                                if (!(await this.current.vault.exists(path))) { observations.set(path, MISSING); return; }
                                const localStat=await this.current.vault.stat(path);
                                if(localStat&&(localStat.size>(o.maxFileSizeBytes??64*1024*1024)))throw new SyncFault('file-too-large',`Local file exceeds the safe comparison buffer limit: ${path}`,'session');
                                const bytes = await this.current.vault.readBinary(path);
                                const version = await versionOf(bytes); observations.set(path, version);
                                const entry = entryByPath.get(path);
                                if (entry?.hashAlg === 'sha256' && version.kind === 'file') localDigests.set(path, version.sha256);
                                else if (entry?.hashAlg === 'git-sha1') localDigests.set(path, await gitBlobSha1Hex(bytes));
                                else if (entry?.hashAlg === 'crc32') localDigests.set(path, crc32Hex(bytes));
                        }, DEFAULT_CONCURRENCY);
                        const observationError = observed.find(result => result instanceof Error);
                        if (observationError instanceof Error) throw observationError;
                        this.guard();
                        // A full rule checks actual local content, even when remote metadata did not change.
                        for (const entry of entries) if (enforceRemote(entry.path) && !oversized.has(entry.path) && !toDownload.some(file => file.path === entry.path)) {
                                const actual = observations.get(entry.path)!;
                                const baseline = mutations?.store.baseline(this.current.cache.namespace, entry.path);
                                const digest = localDigests.get(entry.path);
                                const matches = digest !== undefined ? digest.toLowerCase() === entry.hash.toLowerCase()
                                        : actual.kind === 'file' && baseline?.localSha256 === actual.sha256
                                                && baseline.remote.hashAlg === entry.hashAlg && baseline.remote.hash === entry.hash;
                                if (!matches) { toDownload.push(entry); stats.skipped = Math.max(0, stats.skipped - 1); }
                        }
                        // Preserve remains protected even during force/retry. Create-only never replaces an existing file.

                        toDownload = toDownload.filter(entry => {
                                const mode = ruleFor(entry.path).write;
                                const skip = mode === 'preserve' || (mode === 'create' && observations.get(entry.path)?.kind === 'file');
                                if (skip) {
                                        stats.skipped++;
                                        skippedRows.push({action:'skip',path:entry.path,source:entry.provider,reason:mode==='preserve'?'preserve':'create-only'});
                                        stats.results!.push({path:entry.path,source:entry.provider,status:'skipped',reason:mode==='preserve'?'preserve':'create-only'});
                                }
                                return !skip;
                        });
                        this.participatingPaths=new Set(entries.filter(entry=>(!opts.onlyForcedPaths||opts.forcedPaths?.has(entry.path))&&ruleFor(entry.path).write!=='preserve'&&(ruleFor(entry.path).write!=='create'||observations.get(entry.path)?.kind==='missing')).map(entry=>entry.path));
                        stats.pendingBefore=this.activeFailureCount();
                        const failures = new Map(this.current.queue.all().map(file => [file.path, file]));
                        toDownload = toDownload.filter(file => {
                                const failed = failures.get(file.path);
                                if (!failed || opts.forceAll || opts.forcedPaths?.has(file.path)) return true;
                                if (failed.hash !== file.hash) return true;
                                return !failed.poisoned && failed.nextRetryAt <= Date.now();
                        });

                        const levels = new Map(entries.map(entry => [entry.path, levelOf(mirrorModel, entry.path)]));
                        const requestedDeletions = [...toDelete];
                        for (const [path, level] of this.deletionLevelsOf(extraFolders, mirrorDeletions)) levels.set(path, level);
                        const plan = createOperationPlan({ id: globalThis.crypto.randomUUID(), revision: this.sessionRevision,
                                downloads: toDownload, deletions: toDelete, moves: policyResult.toMove,
                                observations, levels, cache: this.current.cache.entries(), remotePaths: localToRemote,
                                immutableInventory: this.current.source.deletionSafety === 'immutable', trigger: opts.trigger ?? 'manual' });
                        this.plan = plan;
                        toDownload = plan.downloads.map(file => ({ ...file.entry }));
                        toDelete = plan.deletions.map(file => file.path);
                        stats.blockedDeletions = plan.summary.blocked;
                        stats.deferredDeletions = plan.summary.deferred;
                        const sourceName = (path:string) => {
                                const owner=resolveFileRule(path,syncPolicy?.fileRules).source ?? syncPolicy?.defaultSource;
                                return this.current.source.sources?.find(source=>source.id===owner)?.name;
                        };
                        const operations: SyncPlanRow[] = [
                                ...plan.downloads.map(file=>({action:file.kind==='replace'?(ruleFor(file.entry.path).write==='update'?'check':'update'):file.kind,
                                        path:file.entry.path,remotePath:file.entry.sourcePath??file.remotePath,source:file.entry.provider,
                                        reason:file.kind!=='replace'?'missing':ruleFor(file.entry.path).write==='remote'?'match-source':ruleFor(file.entry.path).write==='update'?'baseline-check':'source-changed'} as SyncPlanRow)),
                                ...plan.moves.map(move=>({action:'move' as const,path:move.to,remotePath:move.from,source:sourceName(move.to),reason:'mapping' as const})),
                                ...requestedDeletions.map(path=>({action:plan.summary.blocked?'blocked':plan.summary.deferred?'defer':'delete',path,source:sourceName(path),reason:plan.summary.blocked?'unverified':plan.summary.deferred?'background':'absent'} as SyncPlanRow)),
                                ...skippedRows,
                        ];
                        if(plan.summary.deferred) for(const path of requestedDeletions)stats.results!.push({path,source:sourceName(path),status:'pending',reason:plan.summary.blocked?'unverified':'background'});
                        stats.totalFiles = toDownload.length + toDelete.length + plan.moves.length;
                        this.debugLog(`сессия: источник=${this.current.source.kind}, кэш=${Object.keys(this.current.cache.entries()).length} записей, ` +
                                `к загрузке=${toDownload.length}, к удалению=${toDelete.length}, orphans=${orphans.length}`);

                        if (toDownload.length === 0 && toDelete.length === 0 && plan.moves.length === 0 && !stats.deferredDeletions) {
                                // Preserve ownership until a successful deletion or explicit dismissal.
                                if (orphans.length > 0) ui.notifyVerbose?.(m.orphanWarning(orphans.length), 10000);
                                stats.outcome='ok';
                                return stats;
                        }

                        if (opts.trigger!=='auto') {
                                const { newFiles: newCount, updates: updatedCount, restores: restoredCount } = plan.summary;
                                const info: ConfirmSyncInfo = {
                                        operations,
                                        sources:this.current.source.sources?.map(source=>source.name),
                                        deferredDeletions:plan.summary.deferred,
                                        toDownload: toDownload.length,
                                        toDelete: toDelete.length,
                                        orphans: stats.blockedDeletions ? 0 : orphans.filter(path => !toDelete.includes(path)).length,
                                        blockedDeletions: stats.blockedDeletions,
                                        downloadBytes: toDownload.reduce((s, e) => s + e.size, 0),
                                        newCount,
                                        updatedCount,
                                        restoredCount,
                                        movedCount: plan.moves.length,
                                        // [W1-T07] секции по уровням (матрица §2.2):
                                        // «Удалено (Лёгкое): N · (Полное): M» + лишние
                                        // папки; Д3 — честность про корзину.
                                        deleteLight: plan.summary.deleteLight,
                                        deleteFull: plan.summary.deleteFull,
                                        extraFolders: 0,
                                        noRecovery: false,
                                };

                                this.sessionStage='confirm';ui.setStatus('syncing',{phase:2,stage:'confirm',lastActivityAt:Date.now()});
                                if (!(await cancellable(ui.confirmSync(info,controller.signal),controller.signal))) {stats.outcome='cancelled';return null;}
                        }

                        this.guard();
                        this.sessionStage='preparing';if(this.current.mutations) {
                                const capacity=await this.current.mutations.store.capacity();
                                if(capacity.used+plan.downloads.length+plan.moves.length+plan.deletions.length>capacity.limit)throw new SyncFault('history-quota','Operation history has insufficient capacity for this plan; no payloads downloaded','session');
                                await this.current.mutations.recovery.preflight([...plan.downloads.map(file=>file.expected),...plan.moves.map(file=>file.expected),...plan.deletions.map(file=>file.expected)]);
                        }
                        for(const file of plan.downloads)await this.preflightParents(file.entry.path);
                        if (plan.moves.length > 0) await this.processRenames(plan.moves,stats);

                        // [P2/3.2] фаза 4 — загрузки (пофайловый прогресс ниже докладывает
                        // bytes/fileCount в ту же фазу).
                        if (toDownload.length > 0) {
                                ui.setStatus('syncing', { phase: 4, progressText: m.phaseDownloads });
                                this.sessionStage='download';await this.processDownloads(toDownload, stats, controller.signal, localToRemote, mirrorModel, opts.trigger !== 'auto');
                        }

                        // Failed/unverified payloads cannot authorize unrelated destructive work.
                        if (toDelete.length > 0 && !stats.deferredConflicts && stats.failed === 0 && this.activeFailureCount() === 0 && !this.shouldCancel) {
                                ui.setStatus('syncing', { phase: 3, progressText: m.phaseDeletions });
                                await this.processDeletions(toDelete, stats, this.deletionLevelsOf(extraFolders, mirrorDeletions));
                        } else if (toDelete.length > 0) {
                                stats.deferredDeletions = (stats.deferredDeletions ?? 0) + toDelete.length;
                        }

                        // [P2/3.2] фаза 5 — финализация (persist/journal/статус).
                        ui.setStatus('syncing', { phase: 5, progressText: m.phaseFinalize });

                        stats.outcome=this.shouldCancel||this.abortedThisSession?'cancelled':'ok';
                        return stats;
                } catch (error: unknown) {
                        const aborted=(error as {name?:string;aborted?:boolean})?.name==='AbortError'||(error as {aborted?:boolean})?.aborted||this.shouldCancel;
                        if(aborted)stats.outcome='cancelled';
                        else { const issue=syncIssue(error,this.sessionStage);issue.scope='session';stats.problem=issue.message;stats.problems!.push(issue);stats.outcome='error'; }
                        return stats;
                } finally {
                        try {
                                this.trace({stage:'finalize'});ui.setStatus('syncing',{phase:5,stage:'finalize',lastActivityAt:Date.now()});
                                try { await this.persist('checkpoint'); }
                                catch(error){const issue=syncIssue(error,'checkpoint');issue.scope='session';stats.problem=issue.message;stats.problems!.push(issue);stats.outcome='error';}
                                try { await this.current.mutations?.store.compact(); }
                                catch(error) { console.warn('[VaultSync] Journal compaction deferred; existing history retained:',diagnosticText(error)); }
                                try { await this.current.source.dispose?.(); } catch(error) { console.warn('[VaultSync] Source cleanup deferred:',diagnosticText(error)); }
                                stats.pendingAfter=this.activeFailureCount();
                                stats.retryScheduled=this.activeFailures().filter(file=>!file.poisoned).length;
                                stats.blocked=this.activeFailures().filter(file=>file.poisoned).length;
                                stats.duration=Date.now()-startTime;
                                if(stats.outcome==='ok'&&(stats.failed>0||stats.pendingAfter>0||stats.notAttempted||stats.deferredDeletions))stats.outcome='error';
                                if(stats.outcome==='ok'&&!stats.deferredDeletions&&!stats.deferredConflicts) {ui.setLastSyncTime(Date.now());try{await this.persist('success-end');}catch(error){const issue=syncIssue(error,'checkpoint');issue.scope='session';stats.problem=issue.message;stats.problems!.push(issue);stats.outcome='error';}}
                                stats.duration=Date.now()-startTime;
                                if(stats.outcome==='cancelled'){ui.setStatus('idle');ui.notify(m.cancelled);}
                                else if(stats.problem){ui.setStatus('error',{pendingCount:stats.pendingAfter});ui.notify(m.syncFailed(stats.problem),10000);}
                                else if(stats.failed>0){ui.setStatus('error',{pendingCount:stats.failed});ui.notify(m.syncedWithErrors(stats.failed),10000);}
                                else if(stats.pendingAfter>0){ui.setStatus('error',{pendingCount:stats.pendingAfter});ui.notify(m.retryNotDue(stats.pendingAfter),10000);}
                                else if(stats.notAttempted){ui.setStatus('error',{pendingCount:stats.notAttempted});ui.notify(m.retryNotDue(stats.notAttempted),10000);}
                                else if(stats.deferredDeletions){ui.setStatus('conflicts',{pendingCount:stats.deferredDeletions,attention:'deletions'});ui.notify(stats.blockedDeletions?(m.deletionsBlocked?.(stats.blockedDeletions)??m.deletionsDeferred(stats.blockedDeletions)):m.deletionsDeferred(stats.deferredDeletions),10000);}
                                else if(stats.deferredConflicts){ui.setStatus('conflicts',{pendingCount:stats.deferredConflicts});ui.notify(m.conflictsDeferred??'Conflicts need a manual run',10000);}
                                else {ui.setStatus(stats.conflicts?'conflicts':'idle',{pendingCount:stats.conflicts});ui.notify(stats.totalFiles?m.success(stats.downloaded,stats.deleted,stats.conflicts,formatDuration(stats.duration)):m.upToDate);}
                                console.info(this.sessionEndLog(stats));
                        } finally {
                                this.activeDeps=undefined;this.plan=undefined;this.participatingPaths=undefined;this.traceStats=undefined;
                                this.sessionRevision=undefined;this.running=false;this.shouldCancel=false;this.controller=null;
                        }
                }
        }

        // ============================================================
        // --- СПЕЦИАЛЬНЫЕ СЕССИИ ---
        // ============================================================

        /**
         * Retry-сессия (фикс Б-10): берутся ТОЛЬКО дозревшие по nextRetryAt
         * записи; они НЕ извлекаются из очереди заранее — повторная ошибка
         * наращивает retryCount через add(), удавшиеся удаляются после.
         */
        async retryFailed(trigger:'manual'|'auto'='manual',paths?:readonly string[]): Promise<SyncStats | null> {
                const { ui, messages: m } = this.current;
                // [P1/BUG-20] guard ДО confirm-модалки: при идущей синхронизации
                // пользователь раньше сначала отвечал на confirm, а уже потом
                // получал «уже выполняется» от sync(). Модалка — за guard'ом.
                if (this.running) { ui.notify(m.alreadyInProgress); return null; }
                const now = Date.now();
                // [overhaul S6 / D-4] двойная защита: parked-записи не «дозревают»
                // (nextRetryAt = MAX_SAFE_INTEGER) И исключаются явно — ни скачок
                // часов, ни иная логика выбора now не может вернуть их в оборот.
                const due = this.current.queue.all().filter((f) => this.current.policy.isPathAllowed(f.path)&&(!paths||paths.includes(f.path))&&(trigger==='manual'||(f.nextRetryAt <= now && f.poisoned !== true)));
                if (due.length === 0) {
                        // [overhaul S6 / D-4] parked-записи не «дозревают» никогда
                        // (nextRetryAt = MAX_SAFE_INTEGER): молчаливое «нечего
                        // повторять» при непустой очереди сбивало с толку. Теперь
                        // причина называется явно, с путём лечения.
                        const parked = this.current.queue.poisonedCount();
                        if (parked > 0) {
                                ui.notify(m.retryParked(parked), 10000);
                                return null;
                        }
                        ui.notify(this.current.queue.size() > 0 ? m.retryNotDue(this.current.queue.size()) : m.nothingToRetry);
                        return null;
                }


                const forced = new Set(due.map((f) => f.path));
                // [4-review-fix] очередь обслуживается ТОЛЬКО самолечением в
                // processDownloads (удачная запись → queue.delete): тогда
                // «манифест-исключение» и «отмена посередине батча» не могут
                // вычистить непробованные/прерванные записи. Упавшие здесь уже
                // обновлены add() (retryCount++, новый backoff).
                const stats = await this.sync({ forcedPaths: forced, trigger,onlyForcedPaths:true });
                // [overhaul S6 / D-4] финал retry-сессии: если что-то припарковалось
                // за этот прогон (или было припарковано ранее) — прямо сказать,
                // что автоповторы для этих файлов прекращены.
                const parkedAfter = this.current.queue.poisonedCount();
                if (stats !== null && parkedAfter > 0) {
                        ui.notify(m.retryParked(parkedAfter), 10000);
                }
                return stats;
        }

        /** Re-download selected source files while retaining the last applied baseline. */
        async forceResync(): Promise<SyncStats | null> {
                if (this.running) { this.current.ui.notify(this.current.messages.alreadyInProgress); return null; }
                // Refresh payloads without destroying ownership or local baselines.
                return this.sync({ forceAll: true });
        }

        /**
         * Поиск отсутствующих локально файлов (для scan-missing):
         * возвращает пути из манифеста, которых нет на диске.
         */
        async collectMissing(): Promise<string[] | null> {
                const { ui, messages: m, options: o } = this.current;
                if (this.running) { ui.notify(m.alreadyInProgress); return null; }
                if (!o.isOnline()) { ui.notify(m.offline); ui.setStatus('offline'); return null; }
                if (!o.isConfigured()) { ui.notify(m.notConfigured); ui.setStatus('unconfigured'); return null; }

                this.running = true;
                try {
                        const controller = new AbortController();
                        this.controller = controller;
                        this.captureSession(); this.guard();
                        await this.current.cache.flush();
                        const inventory = await this.current.source.getManifest(controller.signal,event=>{this.trace(event);ui.setStatus('syncing',{phase:0,stage:event.stage,bytesTransferred:event.bytes??0,totalBytes:event.totalBytes??0,lastActivityAt:Date.now(),activities:[{...event,path:'',lastActivityAt:Date.now()}]});});
                        validateManifest(inventory);
                        const manifest = inventory.map(entry => Object.freeze({ ...entry }));
                        this.guard();
                        const safeEntries = manifest.filter((e) => this.filterRemoteEntry(e));
                        // [POLICY Phase 2] scan-missing тоже уважает политику:
                        // exclusions и renames применяются к списку. toMove здесь
                        // НЕ выполняется — цель только перечислить отсутствующее;
                        // переименованный файл «отсутствует» на новом пути, но
                        // следующая sync() сначала выполнит move и не станет
                        // перекачивать его заново.
                        const pr = applyPolicy(
                                safeEntries,
                                this.current.syncPolicy ?? EMPTY_POLICY,
                                this.current.policy,
                                Object.keys(this.current.cache.entries()),
                        );
                        const entries = pr.transformedManifest;
                        // [W1-T02] pMap кладёт исключение мапера В РЕЗУЛЬТАТ —
                        // тип слота: boolean | Error.
                        const flags: Array<boolean | Error> = await pMap(
                                entries,
                                async (e): Promise<boolean | Error> => this.current.vault.exists(e.path),
                                8
                        );
                        // [W1-T02] pMap НЕ пробрасывает исключение мапера, а кладёт
                        // его В РЕЗУЛЬТАТ на позиции элемента (см. utils/concurrency.ts
                        // — смена той семантики отдельным решением). Error — truthy:
                        // !flags[i] === false, и файл с ВРЕМЕННОЙ ошибкой exists()
                        // навсегда и ТИХО выпадал из восстановления. Здесь ошибка
                        // проверки = «существование не подтверждено» → missing.
                        let existsFailed = 0;
                        const missing = entries
                                .filter((_, i) => {
                                        if (flags[i] instanceof Error) {
                                                existsFailed++;
                                                return true;
                                        }
                                        return !flags[i];
                                })
                                .map((e) => e.path);
                        if (existsFailed > 0) {
                                console.warn(`[VaultSync] collectMissing: exists() упал для ${existsFailed} из ${entries.length} записей — включены в missing-набор`);
                        }
                        this.guard();
                        return missing;
                } finally {
                        try { await this.current.source.dispose?.(); } catch { /* ignore */ }
                        this.activeDeps = undefined;
                        this.sessionRevision = undefined;
                        this.running = false;
                        this.shouldCancel = false;
                        this.controller = null;
                }
        }

        /** [7-d] Сколько путей источника отброшено как небезопасные в последней сессии. */
        getSkippedUnsafeCount(): number {
                return this.skippedUnsafeCount;
        }

        clearFailed(): void {
                this.current.queue.clear();
        }

        // ============================================================
        // --- ВНУТРЕННЕЕ ---
        // ============================================================

        private filterRemoteEntry(e: RemoteEntry): boolean {
                if (!this.current.policy.isPathSafe(e.path)) {
                        console.warn('[VaultSync] Skipping unsafe path:', e.path);
                        this.skippedUnsafeCount++; // [7-d] видимость в UI (§7.5)
                        return false;
                }
                return this.current.policy.isInventoryPathAllowed(e.path);
        }

        private async preflightParents(path:string):Promise<void>{
                const parts=path.split('/');for(let i=1;i<parts.length;i++){
                        const parent=parts.slice(0,i).join('/'),stat=await this.current.vault.stat(parent);
                        if(stat?.type==='file')throw new SyncFault('path-collision',`Parent is a file: ${parent}`,'session');
                }
        }

        private sourceLabel(path:string):string|undefined {
                const policy=this.current.syncPolicy,owner=resolveFileRule(path,policy?.fileRules).source??policy?.defaultSource;
                return this.current.source.sources?.find(source=>source.id===owner)?.name;
        }

        private async processDownloads(
                files: RemoteEntry[],
                stats: SyncStats,
                signal: AbortSignal,
                localToRemote?: Map<string, string>,
                mirrorModel?: MirrorModel,
                allowAsk = true,
        ): Promise<void> {
                const { ui, messages: m, options: o, cache, conflict, queue, source, vault } = this.current;
                // [Phase 5.1] пер-движковый лимит: override → движок → безлимит.
                // Git жёстко ограничен GitHub (~100 МБ); облачные диски и ZIP
                // пер-файловых лимитов не имеют — 99-МБ coordinator-дефолт
                // был протечкой git-ограничения в облачные движки.
                const maxFileSize = o.maxFileSizeBytes ?? source.maxFileSizeBytes ?? Infinity;
                const maxFileSizeLabel = formatBytes(maxFileSize);
                const requestedConcurrency = Number.isSafeInteger(o.concurrency) && o.concurrency! > 0
                        ? o.concurrency! : DEFAULT_CONCURRENCY;
                const concurrency=Math.min(requestedConcurrency,source.maxConcurrentDownloads??Infinity);
                const totalBytes = files.reduce((s, f) => s + f.size, 0);
                let transferred = 0;
                let processed=0;let lastPublish=0;let pendingPublish:ReturnType<typeof setTimeout>|undefined;
                const activities=new Map<string,FileActivity>(),sourceFailures=new Map<string,number>();
                const circuits=o.sourceCircuits?.()??{},circuitKey=(file:RemoteEntry)=>JSON.stringify([cache.namespace,file.connectionId??source.kind]);
                if(allowAsk)for(const file of files)delete circuits[circuitKey(file)];
                const probes=new Map<string,ResourceGate>();for(const file of files)if(circuits[circuitKey(file)])probes.set(circuitKey(file),new ResourceGate(1));
                const pauseSource=(file:RemoteEntry,issue:import('../sources/types').SyncIssue)=>{
                        if(issue.code==='integrity'||(!issue.retryable&&issue.code!=='access-denied'))return;
                        const id=file.connectionId??source.kind,count=(sourceFailures.get(id)??0)+1;sourceFailures.set(id,issue.code==='access-denied'?3:count);
                        if((sourceFailures.get(id)??0)>=3||probes.has(circuitKey(file)))circuits[circuitKey(file)]={failures:count,retryAt:Math.max(Date.now()+60_000,issue.retryAt&&issue.retryAt<Number.MAX_SAFE_INTEGER?issue.retryAt:0)};
                };
                const isPaused=(file:RemoteEntry)=>(sourceFailures.get(file.connectionId??source.kind)??0)>=3||(circuits[circuitKey(file)]?.retryAt??0)>Date.now();
                const deferSource=(file:RemoteEntry)=>{stats.notAttempted=(stats.notAttempted??0)+1;stats.results?.push({path:file.path,remotePath:file.sourcePath,source:file.provider,status:'pending',reason:'source-paused'});processed++;publish(true);};
                const budget=new ResourceGate(o.bufferBudgetBytes??256*1024*1024);
                const publish=(force=false)=>{const now=Date.now();if(!force&&now-lastPublish<150){pendingPublish??=setTimeout(()=>{pendingPublish=undefined;publish(true);},150-(now-lastPublish));return;}if(pendingPublish){clearTimeout(pendingPublish);pendingPublish=undefined;}lastPublish=now;
                        ui.setStatus('syncing',{phase:4,progressText:`${processed}/${files.length}`,stage:this.shouldCancel?'cancelling':'download',fileIndex:processed,fileTotal:files.length,
                                currentPath:[...activities.keys()][0]??'',bytesTransferred:transferred+[...activities.values()].reduce((sum,item)=>sum+Math.min(item.bytes??0,files.find(f=>f.path===item.path)?.size??0),0),
                                networkBytes:stats.networkBytes,totalBytes,activities:[...activities.values()],lastActivityAt:Math.max(startActivity,...[...activities.values()].map(item=>item.lastActivityAt)),
                                currentFailed:stats.failed,issues:stats.results?.filter(row=>row.status==='error').slice(-50)});};
                const startActivity=Date.now();
                const heartbeat=setInterval(()=>publish(true),1000);
                let persistenceFailure:Error|undefined;

                const report=(file:RemoteEntry,event:TransferEvent)=>{this.trace(event,file.path,file.provider);const previous=activities.get(file.path);activities.set(file.path,{...previous,...event,retryAt:event.stage==='waiting'?event.retryAt:undefined,path:file.path,source:file.provider,lastActivityAt:Date.now()});if(event.byteDelta!==undefined&&event.stage==='download')stats.networkBytes=(stats.networkBytes??0)+event.byteDelta;publish();};
                const processOne = async (file:RemoteEntry,staged?:ArrayBuffer) => {
                        // [W1-T01 / BUG-4] ранний выход мапера обязан маркировать
                        // сессию отменённой: иначе отмена «между файлами» (без
                        // in-flight fetch → без AbortError) репортилась успехом.
                        if (this.shouldCancel) {
                                this.abortedThisSession = true;
                                return;
                        }
                        const sourceId=file.connectionId??source.kind;
                        if(isPaused(file)){deferSource(file);return;}
                        let release:(()=>void)|undefined,probeRelease:(()=>void)|undefined;
                        let phase:PipelineStage='download';
                        const observe=(event:TransferEvent)=>report(file,event);
                        observe({stage:'download',bytes:0});publish(true);
                        try {
                                if(persistenceFailure){stats.notAttempted=(stats.notAttempted??0)+1;return;}
                                if(probes.has(circuitKey(file))){probeRelease=await probes.get(circuitKey(file))!.acquire(1,signal);if(isPaused(file)){deferSource(file);processed--;return;}}
                                if(!staged)release=await budget.acquire(Math.max(file.size,1)*4,signal);
                                const previousFailure = queue.all().find(f => f.path === file.path);
                                if (previousFailure && previousFailure.hash !== file.hash) queue.delete(file.path);
                                if (file.size > Math.min(maxFileSize,source.fileSizeLimit?.(file)??Infinity,(o.bufferBudgetBytes??256*1024*1024)/4)) {
                                        queue.add(file, m.fileTooLarge(formatBytes(file.size), maxFileSizeLabel), Date.now(),'blocked');
                                        stats.results?.push({path:file.path,source:file.provider,status:'error',reason:'file-too-large'});
                                        stats.failed++;
                                        return;
                                }
                                // [POLICY Phase 2] fetch — по REMOTE-пути (источник мапит
                                // файлы по нему); запись и кэш — по LOCAL.
                                const remotePath = localToRemote?.get(file.path);
                                const buffer = staged ?? await source.fetch(
                                        remotePath === undefined ? file : { ...file, path: remotePath },
                                        signal,observe,
                                );
                                if(!staged){transferred+=buffer.byteLength;phase='verify';observe({stage:phase,bytes:0});await verifyRemoteData(file, buffer);stats.received=(stats.received??0)+1;}
                                delete circuits[circuitKey(file)];probeRelease?.();probeRelease=undefined;
                                signal.throwIfAborted();
                                phase='prepare-directory';observe({stage:phase});
                                await this.dirLock.ensure(vault, file.path);
                                // Матрица §9.1 (фиксы Б-01/Б-02): кэш-хэш = применённая версия.
                                // [W1-T06/T07] Per-файловый уровень зеркала: конфликты
                                // в light/full разрешаются матрицей §2.2 (стратегия —
                                // только для fetch); replacement preserves a recovery copy first.
                                const fileLevel = mirrorModel ? levelOf(mirrorModel, file.path) : undefined;
                                const planned = this.plan!.downloads.find(operation => operation.entry.path === file.path)!;
                                const mutations = this.current.mutations;
                                const namespace = cache.namespace;
                                const transaction = {
                                        appliedLocalSha256: mutations?.store.baseline(namespace, file.path)?.localSha256,
                                        write: async (path: string, data: ArrayBuffer, _expected: ArrayBuffer | null, incoming = false) => {
                                                const expected = incoming ? MISSING : planned.expected;
                                                const guard = () => {if(persistenceFailure)throw persistenceFailure;this.guard(path, incoming);};
                                                guard();
                                                if (mutations) await mutations.write(namespace, {
                                                        id: incoming ? `${planned.id}-incoming` : planned.id, planId: this.plan!.id, path, before: expected,
                                                        effect: { kind: 'set', remote: { ...planned.entry }, remotePath: planned.remotePath, mode: incoming ? 'incoming' : 'applied' }, guard,
                                                }, data, signal);
                                                else {
                                                        await assertLocal(vault, path, expected); guard();
                                                        if (expected.kind === 'file') {
                                                                const before = await vault.readBinary(path);
                                                                if (bytesEqual(before, data)) return;
                                                                if (vault.compareAndWrite) {
                                                                        const result = await vault.compareAndWrite(path, data, before, signal);
                                                                        if (result === false) throw new Error('Local file changed before replacement');
                                                                        if (result === true) return;
                                                                }
                                                        }
                                                        await assertLocal(vault, path, expected); guard(); await vault.writeBinary(path, data);
                                                }
                                        },
                                };
                                phase='apply';observe({stage:phase});
                                const outcome = await conflict.safeWrite(file, buffer, cache.get(file.path)?.h, fileLevel, signal, transaction,
                                        resolveFileRule(file.path, this.current.syncPolicy?.fileRules).write,
                                        resolveFileRule(file.path, this.current.syncPolicy?.fileRules).conflict, allowAsk);
                                if (outcome.kind === 'skipped' && outcome.requiresDecision) stats.deferredConflicts=(stats.deferredConflicts ?? 0)+1;
                                stats.results?.push({path:file.path,remotePath:file.sourcePath??planned.remotePath,source:file.provider,conflictPath:outcome.kind==='conflict'?outcome.conflictPath:undefined,status:outcome.updateCache?(outcome.primaryChanged===false&&outcome.kind==='written'?'unchanged':'applied'):outcome.kind==='skipped'&&outcome.requiresDecision?'pending':'skipped',reason:outcome.kind==='skipped'&&outcome.requiresDecision?'decision-required':outcome.kind==='conflict'&&outcome.primaryChanged===false?'incoming-copy':outcome.updateCache?'accepted':'local-preserved'});
                                if (outcome.kind === 'conflict') {
                                        stats.conflicts++;
                                        if (outcome.mirror === 'full') {
                                                stats.overwritten = (stats.overwritten ?? 0) + 1;
                                        }
                                        ui.notify(m.conflictBoth(file.path), 8000);
                                }
                                if (outcome.updateCache) {
                                        cache.set(file.path, { h: file.hash, s: file.size, alg: file.hashAlg, t: Date.now() });
                                        stats.downloaded++;
                                        if (planned.expected.kind === 'file' && outcome.primaryChanged !== false) stats.updated = (stats.updated ?? 0) + 1;
                                        stats.bytesTransferred += buffer.byteLength;
                                        this.debugLog(`downloaded ok: "${file.path}" (${buffer.byteLength}B)`);
                                        // [4-4-fix] самолечение очереди: файл записан — прошлую ошибку снимаем
                                        queue.delete(file.path);
                                } else {
                                        // local-wins: кэш не трогаем — повторная попытка сохраняется
                                        stats.skipped++;
                                        ui.notify(m.conflictKeptLocal(file.path));
                                }
                                phase='checkpoint';observe({stage:phase});
                                await this.checkpoint();
                        } catch (e: any) {
                                if (e?.aborted || e?.name === 'AbortError' || this.shouldCancel) {
                                        this.abortedThisSession = true;
                                        return;
                                }
                                if(phase==='checkpoint'||persistenceFailure){
                                        if(!persistenceFailure){
                                                persistenceFailure=Object.assign(new Error('Checkpoint failed after file processing; sync stopped without re-queuing applied files'),{cause:e});
                                                console.error('[VaultSync] checkpoint FAILED:',e);
                                        }
                                        throw persistenceFailure;
                                }
                                // [5-логи] полный контекст ошибки загрузки: путь, размер,
                                // попытка — для диагностики EEXIST и сетевых сбоев.
                                console.error(
                                        `[VaultSync] ${phase} FAILED: "${file.path}" (${file.size}B, hash=${file.hash.slice(0, 12)}…): ` +
                                                `${diagnosticText(e)}`,
                                );
                                const issue=syncIssue(e,phase);
                                if(issue.scope==='session'){persistenceFailure=e;stats.problem=issue.message;stats.problems!.push(issue);throw e;}

                                queue.add(file, `${phase}: ${issue.message}`, Date.now(),issue.retryable?'transient':'blocked',e instanceof NetError?e.retryAfterMs:undefined,issue);
                                issue.retryAt=queue.all().find(item=>item.path===file.path)?.nextRetryAt;pauseSource(file,issue);
                                stats.results?.push({path:file.path,remotePath:file.sourcePath,source:file.provider,status:'error',reason:issue.code,issue});
                                stats.failed++;
                        }
                        finally {probeRelease?.();release?.();activities.delete(file.path);processed++;publish(true);}
                };
                const packages=new Map<string,RemoteEntry[]>(),units:RemoteEntry[][]=[];
                for(const file of files){const key=runtimePackage(file.path);if(!key){units.push([file]);continue;}let unit=packages.get(key);if(!unit){unit=[];packages.set(key,unit);units.push(unit);}unit.push(file);}
                const processUnit=async(unit:RemoteEntry[])=>{
                        if(unit.length===1)return processOne(unit[0]);
                        if(unit.some(isPaused)){unit.forEach(deferSource);return;}
                        if(persistenceFailure||signal.aborted){stats.notAttempted=(stats.notAttempted??0)+unit.length;return;}
                        let release:(()=>void)|undefined,failedFile=unit[0],stage:PipelineStage='download';
                        const staged=new Map<string,ArrayBuffer>();let ready=false;
                        try {
                                const weight=unit.reduce((sum,file)=>sum+Math.max(file.size,1)*4,0);
                                if(weight>budget.limit)throw new SyncFault('file-too-large','Changed runtime package exceeds the staging buffer budget');
                                release=await budget.acquire(weight,signal);
                                for(const file of unit){failedFile=file;this.guard();stage='download';report(file,{stage,bytes:0});publish(true);
                                        if(file.size>Math.min(maxFileSize,source.fileSizeLimit?.(file)??Infinity))throw new SyncFault('file-too-large','Source file size limit exceeded');
                                        const remotePath=localToRemote?.get(file.path),data=await source.fetch(remotePath===undefined?file:{...file,path:remotePath},signal,event=>report(file,event));
                                        transferred+=data.byteLength;stage='verify';report(file,{stage,bytes:0});await verifyRemoteData(file,data);stats.received=(stats.received??0)+1;staged.set(file.path,data);activities.delete(file.path);
                                }
                                stage='apply';for(const file of unit){failedFile=file;await assertLocal(vault,file.path,this.plan!.downloads.find(item=>item.entry.path===file.path)!.expected);await vault.assertWritable?.(file.path);}ready=true;
                        }catch(error){
                                if(signal.aborted){this.abortedThisSession=true;return;}
                                const issue=syncIssue(error,stage);
                                if(issue.scope==='session'){persistenceFailure=error as Error;throw error;}
                                queue.add(failedFile,`${stage}: ${issue.message}`,Date.now(),issue.retryable?'transient':'blocked',error instanceof NetError?error.retryAfterMs:undefined,issue);
                                pauseSource(failedFile,issue);stats.failed++;stats.results?.push({path:failedFile.path,source:failedFile.provider,remotePath:failedFile.sourcePath,status:'error',reason:issue.code,issue});
                                for(const file of unit)if(file!==failedFile){stats.notAttempted=(stats.notAttempted??0)+1;stats.results?.push({path:file.path,source:file.provider,status:'pending',reason:'package-not-ready'});}
                                processed+=unit.length;return;
                        }finally{if(!ready){release?.();for(const file of unit)activities.delete(file.path);publish(true);}}
                        try{for(let i=0;i<unit.length;i++){
                                const before=stats.failed;await processOne(unit[i],staged.get(unit[i].path));staged.delete(unit[i].path);
                                if(stats.failed>before||persistenceFailure||signal.aborted){for(const file of unit.slice(i+1)){stats.notAttempted=(stats.notAttempted??0)+1;stats.results?.push({path:file.path,source:file.provider,status:'pending',reason:'package-not-ready'});processed++;}break;}
                        }}finally{release?.();for(const file of unit)activities.delete(file.path);publish(true);}
                };
                const mayAsk=(unit:RemoteEntry[])=>allowAsk&&unit.some(file=>{
                        const rule=resolveFileRule(file.path,this.current.syncPolicy?.fileRules),planned=this.plan!.downloads.find(p=>p.entry.path===file.path);
                        return planned?.expected.kind==='file'&&(rule.conflict??conflict.getStrategy())==='ask'&&(rule.write===undefined||rule.write==='changes');
                });
                const ordinary=units.filter(unit=>!mayAsk(unit)),questions=units.filter(mayAsk);
                let results:(void|Error)[]=[];
                try{results=[...await pMap(ordinary,processUnit,concurrency),...await pMap(questions,processUnit,concurrency)];}
                finally{clearInterval(heartbeat);if(pendingPublish)clearTimeout(pendingPublish);}

                const unexpected = results.find(result => result instanceof Error);
                if (unexpected instanceof Error) throw unexpected;
        }

        /** [W2-T08] Карта путь → уровень для журнальных счётчиков исполненных
         *  удалений (матрица §2.2: лишние папки — всегда full). */
        private deletionLevelsOf(
                extraFolders: Array<{ path: string; filesInside: string[] }>,
                mirrorDeletions: Array<{ path: string; level: MirrorLevel }>,
        ): Map<string, 'light' | 'full'> {
                const levels = new Map<string, 'light' | 'full'>();
                for (const f of extraFolders) for (const path of f.filesInside) levels.set(path, 'full');
                for (const x of mirrorDeletions) levels.set(x.path, x.level === 'full' ? 'full' : 'light');
                return levels;
        }

        private async processDeletions(paths: string[], stats: SyncStats, levelOf?: Map<string, 'light' | 'full'>): Promise<void> {
                const { vault, cache, options: o } = this.current;
                for (const path of paths) {
                        // [W1-T01 / BUG-4] прерванные удаления — не успех: маркируем
                        // сессию отменённой (см. честную ветку в sync()).
                        if (this.shouldCancel) {
                                this.abortedThisSession = true;
                                break;
                        }
                        try {
                                const planned = this.plan!.deletions.find(operation => operation.path === path)!;
                                this.guard(path);
                                await assertLocal(vault, path, planned.expected);
                                if (!this.current.policy.isPathSafe(path) || !this.current.policy.isPathAllowed(path)) throw new Error('Protected deletion path');
                                if (planned.expected.kind === 'missing') {
                                        if (this.current.mutations) await this.current.mutations.delete(cache.namespace, {
                                                id: planned.id, planId: this.plan!.id, path, before: planned.expected, effect: { kind: 'delete', path }, guard: () => this.guard(path),
                                        }, o.useTrash());
                                        cache.delete(path); continue;
                                }
                                const local = await vault.readBinary(path);
                                const recoveryPath = await buildStampedPath(path, 'conflict', formatConflictTimestamp(Date.now()), candidate => vault.exists(candidate));
                                this.controller?.signal.throwIfAborted();
                                await vault.writeBinary(recoveryPath, local);
                                const current = await vault.readBinary(path);
                                if (!bytesEqual(current, local)) throw new Error('Local file changed before deletion');
                                this.controller?.signal.throwIfAborted();
                                if (this.current.mutations) await this.current.mutations.delete(cache.namespace, {
                                        id: planned.id, planId: this.plan!.id, path, before: planned.expected, effect: { kind: 'delete', path }, guard: () => this.guard(path),
                                }, o.useTrash());
                                else { this.guard(path); await assertLocal(vault, path, planned.expected); this.guard(path);
                                        if (o.useTrash() && vault.trash) await vault.trash(path); else await vault.remove(path); }
                                cache.delete(path);
                                stats.deleted++;
                                stats.results?.push({path,source:this.sourceLabel(path),status:'applied',reason:'absent'});
                                // [W2-T08] журнальные счётчики по уровням (только исполненные)
                                const lvl = levelOf?.get(path);
                                if (lvl === 'full') stats.deleteFull = (stats.deleteFull ?? 0) + 1;
                                else if (lvl === 'light') stats.deleteLight = (stats.deleteLight ?? 0) + 1;
                        } catch (e: any) {
                                if (this.shouldCancel || e?.name === 'AbortError') { this.abortedThisSession = true; break; }
                                stats.failed++;
                                this.failedDeletions++;
                                const issue=syncIssue(e,'apply');stats.results?.push({path,source:this.sourceLabel(path),status:'error',reason:issue.code,issue});if(issue.scope==='session')throw e;
                                console.error(`[VaultSync] Failed to delete ${path}:`, e?.message ?? e);
                        }
                }
                // Empty-directory cleanup needs a host non-recursive primitive. A list/remove
                // pair can otherwise remove files created after the listing.
        }

        private async checkpoint(): Promise<void> {
                const interval = this.current.options.checkpointInterval ?? DEFAULT_CHECKPOINT;
                this.checkpointCounter++;
                if (this.checkpointCounter >= interval) {
                        this.checkpointCounter = 0;
                        await this.persist('checkpoint');
                }
        }

        /** Кэш на диск + состояние настроек (очередь, счётчики). */
        private persist(kind: 'checkpoint' | 'session-end' | 'success-end'): Promise<void> {
                const cache = this.current.cache;
                const persistState = this.current.options.persistState;
                const result = this.persistChain.then(async () => {
                        await cache.flush();
                        await persistState?.(kind);
                });
                this.persistChain = result.catch(() => {});
                return result;
        }

        /** [4-2] Горячая замена политики (настройки могли измениться). */
        setPolicy(policy: PathPolicy): void {
                if (this.running) this.cancel();
                this.deps.policy = policy;
        }

        /** [4-2] Смена sourceId (пользователь поменял repoUrl) — новый файл кэша. */
        setCache(cache: ManifestCache): void {
                if (this.running) throw new Error('Cannot replace cache during an active session');
                this.deps.cache = cache;
        }

        /** [5-g] Горячая смена источника (git ↔ zip-url и смена URL). Старый — освобождается. */
        async setSource(source: import('../sources/types').SyncSource): Promise<void> {
                if (this.running) throw new Error('Cannot replace source during an active session');
                const old = this.current.source;
                this.deps.source = source;
                try { await old.dispose?.(); } catch { /* ignore */ }
        }

        /** [POLICY Phase 3] Текущий источник (для модалки структуры-политики). */
        getCurrentSource(): import('../sources/types').SyncSource {
                return this.current.source;
        }

        /** [POLICY Phase 2] Горячая замена структуры-политики (modal Save / смена источника). */
        setSyncPolicy(policy: SyncPolicy | undefined): void {
                if (this.running) this.cancel();
                this.deps.syncPolicy = policy;
        }

        /**
         * [POLICY Phase 2, дизайн §5.4] Переименования ДО diff. Для каждого move:
         *   1. источник не существует на диске → skip (diff увидит MISSING_LOCAL);
         *   2. цель существует → skip (diff + конфликт-резолвер: keep-both,
         *      дизайн §5.6 — обе версии выживают);
         *   3. DirLock.ensure(цель) → vault.rename(from→to) → переложить ключи
         *      кэша И записи failed-очереди (иначе retry-сессия не найдёт файл,
         *      а add() сбросил бы retryCount — mergeBack сохраняет статус).
         * A failed move stops the session; it cannot silently authorize later deletions.
         */
        private async processRenames(moves: readonly PlannedMove[], stats:SyncStats): Promise<void> {
                const { vault, cache, queue } = this.current;
                for (const { from, to, expected, id } of moves) {
                        // [W1-T01 / BUG-4] прерванные переименования — не успех.
                        if (this.shouldCancel) {
                                this.abortedThisSession = true;
                                break;
                        }
                        try {
                                if (!this.current.policy.isPathSafe(from) || !this.current.policy.isPathAllowed(from)
                                        || !this.current.policy.isPathSafe(to) || !this.current.policy.isPathAllowed(to)) throw new Error('Protected rename path');
                                this.guard(from); this.guard(to);
                                await assertLocal(vault, from, expected); await assertLocal(vault, to, MISSING);
                                await this.dirLock.ensure(vault, to);
                                this.controller?.signal.throwIfAborted();
                                if (this.current.mutations) await this.current.mutations.move(cache.namespace, {
                                        id, planId: this.plan!.id, path: to, before: expected,
                                        effect: { kind: 'move', from, to, entry: cache.get(from) }, guard: () => { this.guard(from); this.guard(to); },
                                }, from);
                                else { await assertLocal(vault, from, expected); await assertLocal(vault, to, MISSING); this.guard(to); await vault.rename(from, to); }
                                const entry = cache.get(from);
                                if (entry) {
                                        cache.delete(from);
                                        cache.set(to, entry);
                                }
                                const failed = queue.all().find((f) => f.path === from);
                                if (failed) {
                                        queue.delete(from);
                                        queue.mergeBack([{ ...failed, path: to }]);
                                }
                                stats.results?.push({path:to,remotePath:from,source:this.sourceLabel(to),status:'applied',reason:'mapping'});
                        } catch (e: any) {
                                if(e?.name!=='AbortError'){const issue=syncIssue(e,'apply');stats.results?.push({path:to,remotePath:from,source:this.sourceLabel(to),status:'error',reason:issue.code,issue});stats.failed++;}
                                console.error(`[VaultSync] rename FAILED ${from} → ${to}: ${e?.message ?? e}`);
                                throw e;
                        }
                }
        }
}
