// ============================================================
// --- CORE/COORDINATOR (фаза 4-2) ---
// Единственный владелец конвейера синхронизации (дизайн §16):
//   acquire-мьютекс → guards → manifest → PathPolicy → diff →
//   confirm → pMap-загрузка (ConflictResolver) → удаления →
//   кэш-flush → статистика.
// Закрывает: Б-11 (forceResync = честный reset кэша с .bak и
// восстановлением при отмене на guard'ах), Б-20 (guards едины
// для всех входов), Б-10 (retry: дозревание nextRetryAt +
// удаление удавшихся, слияние без потерь), С-10 (однопоточный
// конвейер — параллельных писателей нет).
// Все тексты/модалки/статус-бар — за SyncUI; ядро чистое от
// obsidian/i18n (В5-1).
// ============================================================

import type {
        ConfirmSyncInfo,
        FailedFile,
        RemoteEntry,
        SyncPhase,
        SyncStats,
        SyncUI,
        VaultAdapter,
} from '../sources/types';
import { ManifestCache } from './manifest-cache';
import { FailedQueue } from './queue';
import { PathPolicy } from './path-policy';
import { ConflictResolver } from './conflict';
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
                isFolderCovered,
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
        nothingToRetry: string;
        retryNotDue: (pending: number) => string;
        /** [overhaul S6 / D-4] N записей припаркованы после исчерпания
         *  попыток (retry cap) — автоповторы прекращены; лечение — Force
         *  Resync или Clear Queue. */
        retryParked: (parked: number) => string;
        /** [W4-T02] Auto-сессия отложила N опасных удалений до ручного повтора. */
        deletionsDeferred: (n: number) => string;
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

/** Динамические опции (читаются на каждой сессии, не снапшотятся). */
export interface CoordinatorOptions {
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

        /** [P2/B6] Диагностический лог конвейера — только при verboseLogs().
         *  Аномалии (warn) и ошибки (error) — всегда, без гейта. */
        private debugLog(msg: string): void {
                if (this.deps.options.verboseLogs?.()) console.log(`[VaultSync] ${msg}`);
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
                const parked = this.deps.queue.poisonedCount();
                return (
                        `session end (build=${BUILD_TAG}): outcome=${stats.outcome ?? 'unknown'} ` +
                        `downloaded=${stats.downloaded} deleted=${stats.deleted} ` +
                        `conflicts=${stats.conflicts} skipped=${stats.skipped} ` +
                        `failed=${stats.failed} queue=${this.deps.queue.size()} parked=${parked} ` +
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
        async sync(opts: { forcedPaths?: Set<string>; forceAll?: boolean; trigger?: 'manual' | 'auto' } = {}): Promise<SyncStats | null> {
                const { ui, messages: m, options: o } = this.deps;

                if (this.running) { ui.notify(m.alreadyInProgress); return null; }
                if (!o.isOnline()) { ui.notify(m.offline); ui.setStatus('offline'); return null; }
                if (!o.isConfigured()) { ui.notify(m.notConfigured); ui.setStatus('unconfigured'); return null; }

                this.running = true;
                this.shouldCancel = false;
                this.checkpointCounter = 0;
                this.abortedThisSession = false;
                this.skippedUnsafeCount = 0;
                const controller = new AbortController();
                this.controller = controller;
                const startTime = Date.now();
                const stats: SyncStats = {
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

                ui.setStatus('syncing', { phase: 0, progressText: m.phaseManifest });

                try {
                        const manifestStart = Date.now();
                        const manifest = await this.deps.source.getManifest(controller.signal);
                        const safeEntries = manifest.filter((e) => this.filterRemoteEntry(e));
                        this.debugLog(`manifest: ${manifest.length} записей (${Date.now() - manifestStart}ms), после path-policy: ${safeEntries.length}`);

                        // [POLICY Phase 2, дизайн §5.3] per-source структура-политика:
                        // применяем ПОСЛЕ getManifest и ДО diff. Нет сохранённой
                        // политики (undefined) → EMPTY_POLICY = манифест без
                        // изменений (legacy-поведение, ни один существующий
                        // пользователь не меняет поведение). Записи, чей ЛОКАЛЬНЫЙ
                        // путь не прошёл валидацию (битые цели rename) или дал
                        // коллизию, выпадают с unsafeCount — видимы в §7.5-notice.
                        const syncPolicy = this.deps.syncPolicy;
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
                                mirrorModel.level === 'full' ||
                                Object.values(mirrorModel.folders).some((r) => r.state === 'custom' && r.level === 'full');
                        let scan: Awaited<ReturnType<typeof scanVaultTree>> | undefined;
                        if (fullActive && !opts.forcedPaths && !opts.forceAll && typeof this.deps.vault.list === 'function') {
                                scan = await scanVaultTree(this.deps.vault, {
                                        signal: controller.signal,
                                        // Прун поддеревьев: автоисключения (.trash, File Recovery)
                                        // и off-папки (Е2) — скан внутрь не заходит, папка →
                                        // blocked (выживающий потомок защищает родителя
                                        // от extra-удаления). Не-допустимые ПОЛИТИКОЙ ПУТЕЙ
                                        // файлы (.git/*, отключённые плагины) скан видит, но
                                        // planMirrorDeletions их не удаляет (isPathEligible).
                                        pruneFolder: (f) =>
                                                isAutoExcluded(f) || !isFolderCovered(mirrorModel, f),
                                });
                                this.debugLog(`mirror-scan: файлов=${scan.files.length}, папок=${scan.folders.length}, ` +
                                        `обрезано=${scan.blocked.length} (full активен)`);
                        }

                        const policyResult = applyPolicy(
                                safeEntries,
                                syncPolicy ?? EMPTY_POLICY,
                                this.deps.policy,
                                Object.keys(this.deps.cache.entries()),
                                {
                                        mirrorLevel: mirrorModel.level,
                                        scan,
                                        // [P1/BUG-13] хэш-матчинг смены rename-цели: путь кэша
                                        // → "alg:hash" (см. policy.ts шаг 3).
                                        cacheHashes: new Map(
                                                Object.entries(this.deps.cache.entries())
                                                        .map(([p, c]) => [p, `${c.alg}:${c.h}`] as const),
                                        ),
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

                        // Phase A (дизайн §5.4): переименования ДО diff — кэш и
                        // трансформированный манифест согласованы по ключам,
                        // переименованные файлы НЕ перекачиваются. Идемпотентно:
                        // повторная сессия не найдёт старых ключей кэша в toMove.
                        if (policyResult.toMove.length > 0) {
                                this.debugLog(`renames: ${policyResult.toMove.length} — ` +
                                        policyResult.toMove.slice(0, 10).map((m2) => `${m2.from} -> ${m2.to}`).join('; ') +
                                        (policyResult.toMove.length > 10 ? ' …' : ''));
                                await this.processRenames(policyResult.toMove);
                        }

                        // [POLICY Phase 2] Обратная карта local→remote: source.fetch
                        // по-прежнему получает REMOTE-путь (источник не знает о
                        // локальных переименованиях); запись в vault и ключи кэша —
                        // по LOCAL. Без политики карта пуста — путь не меняется.
                        const localToRemote = new Map<string, string>();
                        for (const [remotePath, localPath] of policyResult.renameMap) {
                                localToRemote.set(localPath, remotePath);
                        }

                        const entries = policyResult.transformedManifest;

                        let toDownload: RemoteEntry[];
                        let toDelete: string[] = [];
                        let orphans: string[] = [];
                        // [overhaul S2/M-1] cacheCleanup откладывается ДО решения
                        // пользователя (confirm / headless-отложение): раньше ключи
                        // чистились сразу после diff — отмена confirm не откатывала
                        // in-memory-мутацию, а finally{persist('checkpoint')} фиксировал
                        // её на диске. Файл, удалённый из источника, оставался на диске,
                        // но кэш-запись погибала → light-зеркало больше НИКОГДА не
                        // признавало его orphan (orphan-детекция строится из cacheKeys)
                        // — контракт «Лёгкого зеркала» молча нарушался после каждой
                        // отменённой сессии. Применение — сразу после точки решения.
                        let pendingCacheCleanup: string[] = [];
                        // [W1-T07] удаления с уровнями/причинами (confirm-секции,
                        // журнал) и лишние папки к удалению целиком.
                        let mirrorDeletions: MirrorDeletion[] = [];
                        let extraFolders: MirrorPlan['extraFolders'] = [];

                        // [P2/3.2] фаза 2 — дифф с кэшем (confirm-модалка — в этой же фазе:
                        // полоса честно остаётся на «Сравнении», пока пользователь решает).
                        ui.setStatus('syncing', { phase: 2, progressText: m.phaseDiff });
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
                                const d = await diff(this.deps.cache.entries(), entries, {
                                        deleteMissing: false,
                                        isAllowed: (p) => this.deps.policy.isPathAllowed(p),
                                        exists: (p) => this.deps.vault.exists(p),
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
                                        // [P1/BUG-12] кэш-хвосты чистятся и в forced-сессии:
                                        // раньше cacheCleanup применялся только в else-ветке,
                                        // и orphan-ключи (файл исчез из источника) жили
                                        // до следующей ОБЫЧНОЙ сессии — retry/scan их
                                        // продлевали бесконечно.
                                        for (const p of d.cacheCleanup) this.deps.cache.delete(p);
                                } else {
                                        toDownload = d.toDownload;
                                        mirrorDeletions = policyResult.mirrorPlan.deletions;
                                        extraFolders = policyResult.mirrorPlan.extraFolders;
                                        // Лишние папки — ПЕРВЫМИ (одно корзинное действие на
                                        // папку; файлы внутри уже поглощены и не дублируются).
                                        toDelete = [
                                                ...extraFolders.map((f) => f.path),
                                                ...mirrorDeletions.map((x) => x.path),
                                        ];
                                        orphans = d.orphans;
                                        // [overhaul S2/M-1] НЕ применяем сразу — до решения
                                        // пользователя (см. объявление pendingCacheCleanup).
                                        pendingCacheCleanup = d.cacheCleanup;
                                }
                        }

                        stats.totalFiles = toDownload.length + toDelete.length;
                        this.debugLog(`сессия: источник=${this.deps.source.kind}, кэш=${Object.keys(this.deps.cache.entries()).length} записей, ` +
                                `к загрузке=${toDownload.length}, к удалению=${toDelete.length}, orphans=${orphans.length}`);

                        if (toDownload.length === 0 && toDelete.length === 0) {
                                // [overhaul S2/M-1] нечего ждать от пользователя: решения не
                                // будет — чистка безопасна (орфаны уровня fetch остаются на
                                // диске по матрице §2.2, их ключи кэша корректно утилизируются).
                                for (const p of pendingCacheCleanup) this.deps.cache.delete(p);
                                if (orphans.length > 0) ui.notifyVerbose?.(m.orphanWarning(orphans.length), 10000);
                                stats.outcome = 'ok';
                                stats.duration = Date.now() - startTime;
                                await this.persist('session-end');
                                ui.setLastSyncTime(Date.now());
                                ui.setStatus('idle');
                                ui.notify(m.upToDate);
                                return stats;
                        }

                        if (!opts.forcedPaths && !opts.forceAll) {
                                // [REV-P4] классификация скачивания для разбивки в confirm-модалке:
                                // [overhaul S4 / S3-review #9] порядок после M-2:
                                // NEW/alg/MODIFIED (в порядке манифеста), затем MISSING_LOCAL
                                // (exists-проверки отдельным pMap-проходом). Подсчёт от
                                // порядка не зависит — считается по cache.get.
                                let newCount = 0;
                                let updatedCount = 0;
                                let restoredCount = 0;
                                for (const e of toDownload) {
                                        const c = this.deps.cache.get(e.path);
                                        if (!c) newCount++;
                                        else if (c.alg !== e.hashAlg || c.h !== e.hash) updatedCount++;
                                        else restoredCount++;
                                }
                                // [W2-T08] журнал: обновления считаются всегда,
                                // не только при показе confirm-модалки.
                                stats.updated = updatedCount;
                                const info: ConfirmSyncInfo = {
                                        toDownload: toDownload.length,
                                        toDelete: toDelete.length,
                                        orphans: orphans.length,
                                        downloadBytes: toDownload.reduce((s, e) => s + e.size, 0),
                                        newCount,
                                        updatedCount,
                                        restoredCount,
                                        movedCount: hasPolicy ? policyResult.toMove.length : 0,
                                        // [W1-T07] секции по уровням (матрица §2.2):
                                        // «Удалено (Лёгкое): N · (Полное): M» + лишние
                                        // папки; Д3 — честность про корзину.
                                        deleteLight: mirrorDeletions.filter((x) => x.level === 'light').length,
                                        deleteFull: mirrorDeletions.filter((x) => x.level === 'full').length + extraFolders.length,
                                        extraFolders: extraFolders.length,
                                        noRecovery: !o.useTrash(),
                                };

                                // [W4-T02] Headless-режим (auto-сессия):
                                //   - confirm-модалка НЕ показывается (решение В11=2);
                                //   - mirrorLevel fetch/light → опасные удаления ДРОПАЮТСЯ
                                //     (mirrorDeletions/extraFolders/toDelete = []), но
                                //     записываются в stats.deferredDeletions для журнала
                                //     и popover «ожидают ручного подтверждения» (А1).
                                //   - mirrorLevel full → удаления ВЫПОЛНЯЮТСЯ (А1: пользователь
                                //     сознательно выбрал уровень; защиты — useTrash + красный чип).
                                const trigger = opts.trigger ?? 'manual';
                                if (trigger === 'auto') {
                                        if (mirrorModel.level !== 'full') {
                                                stats.deferredDeletions = toDelete.length;
                                                toDelete = [];
                                                mirrorDeletions = [];
                                                extraFolders = [];
                                                if (stats.deferredDeletions > 0) {
                                                        ui.notify(m.deletionsDeferred(stats.deferredDeletions));
                                                }
                                        }
                                        // full-level: подтверждения нет, но удаления исполняются.
                                } else {
                                        if (!(await ui.confirmSync(info))) {
                                                ui.notify(m.cancelled);
                                                ui.setStatus('idle');
                                                return null;
                                        }
                                }
                        }

                        // [overhaul S2/M-1] ТОЧКА РЕШЕНИЯ пройдена (confirm дан / auto
                        // решил). Применяем чистку только если удаления НЕ отложены:
                        // при deferredDeletions ключи кэша обязаны жить — иначе
                        // отложенные зеркальные удаления не найдут orphan'ов при
                        // ручном повторе. Forced-ветка выше чистит свои хвосты сама
                        // (BUG-12: retry/scan без confirm — решение уже получено).
                        {
                                const trigger = opts.trigger ?? 'manual';
                                const deletionsDeferred = trigger === 'auto'
                                        && mirrorModel.level !== 'full'
                                        && (stats.deferredDeletions ?? 0) > 0;
                                if (!deletionsDeferred) {
                                        for (const p of pendingCacheCleanup) this.deps.cache.delete(p);
                                }
                        }

                        // [P2/3.2] фаза 3 — удаления (лишние папки + зеркальные).
                        if (toDelete.length > 0) {
                                ui.setStatus('syncing', { phase: 3, progressText: m.phaseDeletions });
                                ui.notify(m.deletingFiles(toDelete.length));
                                await this.processDeletions(toDelete, stats, this.deletionLevelsOf(extraFolders, mirrorDeletions));
                                // [W1-T07] журнал/статус: сколько папок ушло целиком
                                // (best-effort — как stats.deleted, ошибки удаления
                                // логируются processDeletions и не молчат).
                                stats.extraFoldersDeleted = extraFolders.length;
                        }

                        // [P2/3.2] фаза 4 — загрузки (пофайловый прогресс ниже докладывает
                        // bytes/fileCount в ту же фазу).
                        if (toDownload.length > 0) {
                                ui.setStatus('syncing', { phase: 4, progressText: m.phaseDownloads });
                                await this.processDownloads(toDownload, stats, controller.signal, localToRemote, mirrorModel);
                        }

                        // [P2/3.2] фаза 5 — финализация (persist/journal/статус).
                        ui.setStatus('syncing', { phase: 5, progressText: m.phaseFinalize });

                        // [4-4-fix] отмена «внутри батча»: pMap завершился штатно, но часть
                        // файлов пропущена — это отмена, а не успех.
                        // [W1-T01 / BUG-4] shouldCancel тоже: отмена «между файлами»
                        // (ранний выход мапера, break удалений/переименований) не
                        // бросает AbortError — без этого условия сессия доезжала
                        // до success-ветки и врала (lastSyncTime + success-Notice).
                        if (this.shouldCancel || this.abortedThisSession) {
                                stats.outcome = 'cancelled';
                                stats.duration = Date.now() - startTime;
                                await this.persist('checkpoint');
                                // [overhaul S6] итог сессии — всегда в консоль (диагностика
                                // присылаемых логов: замерший прогресс должен объясняться).
                                console.info(this.sessionEndLog(stats));
                                ui.notify(m.cancelled);
                                ui.setStatus('idle');
                                return stats;
                        }

                        stats.duration = Date.now() - startTime;
                        await this.persist('success-end');
                        this.debugLog(`сессия завершена за ${stats.duration}ms: downloaded=${stats.downloaded}, ` +
                                `deleted=${stats.deleted}, conflicts=${stats.conflicts}, skipped=${stats.skipped}, ` +
                                `failed=${stats.failed}, bytes=${stats.bytesTransferred}`);

                        // [4-review-fix] паритет со старым кодом: lastSyncTime
                        // обновляется и для частично-неудачной сессии
                        ui.setLastSyncTime(Date.now());
                        const failed = this.deps.queue.size();
                        stats.failed = failed;
                        if (failed > 0) {
                                stats.outcome = 'error';
                                ui.setStatus('error', { pendingCount: failed });
                                ui.notify(m.syncedWithErrors(failed), 10000);
                        } else if (stats.conflicts > 0) {
                                stats.outcome = 'ok';
                                // [W2-T02 / BUG-8] конфликты видны в статус-баре:
                                // клик по нему открывает popover (W2-T03) со списком.
                                // Приоритет: ошибки > конфликты > idle.
                                ui.setStatus('conflicts', { pendingCount: stats.conflicts });
                                ui.notify(m.success(stats.downloaded, stats.deleted, stats.conflicts, formatDuration(stats.duration)));
                        } else {
                                stats.outcome = 'ok';
                                ui.setStatus('idle');
                                ui.notify(m.success(stats.downloaded, stats.deleted, stats.conflicts, formatDuration(stats.duration)));
                        }
                        // [overhaul S6] итог сессии — всегда в консоль (не под verbose-гейтом):
                        // по одному логу видно, дошёл ли конвейер до конца, сколько записей
                        // осталось в очереди и сколько из них припарковано (симптом
                        // «останавливается на 20 из 150» диагностируется без угадывания
                        // версии и без verbose-флага). Ставится ПОСЛЕ итогового stats.failed
                        // и outcome — лог всегда видит финальные значения.
                        console.info(this.sessionEndLog(stats));
                        return stats;
                } catch (error: any) {
                        const aborted = error?.name === 'AbortError' || error?.aborted || this.shouldCancel;
                        if (aborted) {
                                stats.outcome = 'cancelled';
                                ui.notify(m.cancelled);
                                ui.setStatus('idle');
                        } else {
                                stats.outcome = 'error';
                                ui.setStatus('error');
                                ui.notify(m.syncFailed(error?.message ?? String(error)));
                        }
                        stats.failed = this.deps.queue.size();
                        stats.duration = Date.now() - startTime;
                        // [overhaul S6] итог сессии — всегда в консоль: нештатное
                        // завершение обязано оставлять след в логе (симптом «всё
                        // так же останавливается» больше не может быть безследным).
                        console.info(this.sessionEndLog(stats));
                        return stats;
                } finally {
                        this.running = false;
                        this.shouldCancel = false;
                        this.controller = null;
                        // Кэш всегда консистентен записанному (урок Б-02)
                        try { await this.persist('checkpoint'); } catch { /* ignore */ }
                        // [5-1] tmp-архивы и прочие сессионные ресурсы источника
                        try { await this.deps.source.dispose?.(); } catch { /* ignore */ }
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
        async retryFailed(): Promise<SyncStats | null> {
                const { ui, messages: m } = this.deps;
                // [P1/BUG-20] guard ДО confirm-модалки: при идущей синхронизации
                // пользователь раньше сначала отвечал на confirm, а уже потом
                // получал «уже выполняется» от sync(). Модалка — за guard'ом.
                if (this.running) { ui.notify(m.alreadyInProgress); return null; }
                const now = Date.now();
                // [overhaul S6 / D-4] двойная защита: parked-записи не «дозревают»
                // (nextRetryAt = MAX_SAFE_INTEGER) И исключаются явно — ни скачок
                // часов, ни иная логика выбора now не может вернуть их в оборот.
                const due = this.deps.queue.all().filter((f) => f.nextRetryAt <= now && f.poisoned !== true);
                if (due.length === 0) {
                        // [overhaul S6 / D-4] parked-записи не «дозревают» никогда
                        // (nextRetryAt = MAX_SAFE_INTEGER): молчаливое «нечего
                        // повторять» при непустой очереди сбивало с толку. Теперь
                        // причина называется явно, с путём лечения.
                        const parked = this.deps.queue.poisonedCount();
                        if (parked > 0) {
                                ui.notify(m.retryParked(parked), 10000);
                                return null;
                        }
                        ui.notify(this.deps.queue.size() > 0 ? m.retryNotDue(this.deps.queue.size()) : m.nothingToRetry);
                        return null;
                }
                if (this.deps.ui.confirmRetry && !(await this.deps.ui.confirmRetry(due.length))) return null;

                const forced = new Set(due.map((f) => f.path));
                // [4-review-fix] очередь обслуживается ТОЛЬКО самолечением в
                // processDownloads (удачная запись → queue.delete): тогда
                // «манифест-исключение» и «отмена посередине батча» не могут
                // вычистить непробованные/прерванные записи. Упавшие здесь уже
                // обновлены add() (retryCount++, новый backoff).
                const stats = await this.sync({ forcedPaths: forced });
                // [overhaul S6 / D-4] финал retry-сессии: если что-то припарковалось
                // за этот прогон (или было припарковано ранее) — прямо сказать,
                // что автоповторы для этих файлов прекращены.
                const parkedAfter = this.deps.queue.poisonedCount();
                if (stats !== null && parkedAfter > 0) {
                        ui.notify(m.retryParked(parkedAfter), 10000);
                }
                await this.persist('checkpoint');
                return stats;
        }

        /**
         * Полный resync (фикс Б-11): кэш сбрасывается в .bak, качается всё.
         * Отмена на guard'ах (null) → восстановление из .bak. Отмена
         * посередине → честный частичный кэш (лучше старого поведения,
         * которое теряло всё).
         */
        async forceResync(): Promise<SyncStats | null> {
                // [P1/BUG-20-class] guard ДО cache.reset(): при идущей сессии
                // бэкап-сброс выполнялся до того, как sync() отклонял запрос
                // (restoreBackup спасал, но это лишний цикл сброс/восстановление
                // на диске под ногами ЖИВОЙ сессии).
                if (this.running) { this.deps.ui.notify(this.deps.messages.alreadyInProgress); return null; }
                await this.deps.cache.reset();
                const stats = await this.sync({ forceAll: true });
                if (stats === null) {
                        await this.deps.cache.restoreBackup();
                }
                return stats;
        }

        /**
         * Поиск отсутствующих локально файлов (для scan-missing):
         * возвращает пути из манифеста, которых нет на диске.
         */
        async collectMissing(): Promise<string[] | null> {
                const { ui, messages: m, options: o } = this.deps;
                if (this.running) { ui.notify(m.alreadyInProgress); return null; }
                if (!o.isOnline()) { ui.notify(m.offline); ui.setStatus('offline'); return null; }
                if (!o.isConfigured()) { ui.notify(m.notConfigured); ui.setStatus('unconfigured'); return null; }

                this.running = true;
                try {
                        const controller = new AbortController();
                        this.controller = controller;
                        const manifest = await this.deps.source.getManifest(controller.signal);
                        const safeEntries = manifest.filter((e) => this.filterRemoteEntry(e));
                        // [POLICY Phase 2] scan-missing тоже уважает политику:
                        // exclusions и renames применяются к списку. toMove здесь
                        // НЕ выполняется — цель только перечислить отсутствующее;
                        // переименованный файл «отсутствует» на новом пути, но
                        // следующая sync() сначала выполнит move и не станет
                        // перекачивать его заново.
                        const pr = applyPolicy(
                                safeEntries,
                                this.deps.syncPolicy ?? EMPTY_POLICY,
                                this.deps.policy,
                                Object.keys(this.deps.cache.entries()),
                        );
                        const entries = pr.transformedManifest;
                        // [W1-T02] pMap кладёт исключение мапера В РЕЗУЛЬТАТ —
                        // тип слота: boolean | Error.
                        const flags: Array<boolean | Error> = await pMap(
                                entries,
                                async (e): Promise<boolean | Error> => this.deps.vault.exists(e.path),
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
                        return missing;
                } finally {
                        this.running = false;
                        this.controller = null;
                        try { await this.deps.source.dispose?.(); } catch { /* ignore */ }
                }
        }

        /** [7-d] Сколько путей источника отброшено как небезопасные в последней сессии. */
        getSkippedUnsafeCount(): number {
                return this.skippedUnsafeCount;
        }

        clearFailed(): void {
                this.deps.queue.clear();
        }

        // ============================================================
        // --- ВНУТРЕННЕЕ ---
        // ============================================================

        private filterRemoteEntry(e: RemoteEntry): boolean {
                if (!this.deps.policy.isPathSafe(e.path)) {
                        console.warn('[VaultSync] Skipping unsafe path:', e.path);
                        this.skippedUnsafeCount++; // [7-d] видимость в UI (§7.5)
                        return false;
                }
                return this.deps.policy.isPathAllowed(e.path);
        }

        private async processDownloads(
                files: RemoteEntry[],
                stats: SyncStats,
                signal: AbortSignal,
                localToRemote?: Map<string, string>,
                mirrorModel?: MirrorModel,
        ): Promise<void> {
                const { ui, messages: m, options: o, cache, conflict, queue, source, vault } = this.deps;
                // [Phase 5.1] пер-движковый лимит: override → движок → безлимит.
                // Git жёстко ограничен GitHub (~100 МБ); облачные диски и ZIP
                // пер-файловых лимитов не имеют — 99-МБ coordinator-дефолт
                // был протечкой git-ограничения в облачные движки.
                const maxFileSize = o.maxFileSizeBytes ?? source.maxFileSizeBytes ?? Infinity;
                const maxFileSizeLabel = formatBytes(maxFileSize);
                const concurrency = o.concurrency ?? DEFAULT_CONCURRENCY;
                const totalBytes = files.reduce((s, f) => s + f.size, 0);
                let transferred = 0;

                await pMap(files, async (file) => {
                        // [W1-T01 / BUG-4] ранний выход мапера обязан маркировать
                        // сессию отменённой: иначе отмена «между файлами» (без
                        // in-flight fetch → без AbortError) репортилась успехом.
                        if (this.shouldCancel) {
                                this.abortedThisSession = true;
                                return;
                        }
                        try {
                                if (file.size > maxFileSize) {
                                        queue.add(file, m.fileTooLarge(formatBytes(file.size), maxFileSizeLabel), Date.now());
                                        stats.failed++;
                                        return;
                                }
                                // [POLICY Phase 2] fetch — по REMOTE-пути (источник мапит
                                // файлы по нему); запись и кэш — по LOCAL.
                                const remotePath = localToRemote?.get(file.path);
                                const buffer = await source.fetch(
                                        remotePath === undefined ? file : { ...file, path: remotePath },
                                        signal,
                                );
                                await this.dirLock.ensure(vault, file.path);
                                // Матрица §9.1 (фиксы Б-01/Б-02): кэш-хэш = применённая версия.
                                // [W1-T06/T07] Per-файловый уровень зеркала: конфликты
                                // в light/full разрешаются матрицей §2.2 (стратегия —
                                // только для fetch), локаль при full — в корзину (Е1-а).
                                const fileLevel = mirrorModel ? levelOf(mirrorModel, file.path) : undefined;
                                const outcome = await conflict.safeWrite(file, buffer, cache.get(file.path)?.h, fileLevel);
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
                                        stats.bytesTransferred += buffer.byteLength;
                                        this.debugLog(`downloaded ok: "${file.path}" (${buffer.byteLength}B)`);
                                        // [4-4-fix] самолечение очереди: файл записан — прошлую ошибку снимаем
                                        queue.delete(file.path);
                                } else {
                                        // local-wins: кэш не трогаем — повторная попытка сохраняется
                                        stats.skipped++;
                                        ui.notify(m.conflictKeptLocal(file.path));
                                }
                                await this.checkpoint();
                        } catch (e: any) {
                                if (e?.aborted || this.shouldCancel) {
                                        this.abortedThisSession = true;
                                        return;
                                }
                                // [5-логи] полный контекст ошибки загрузки: путь, размер,
                                // попытка — для диагностики EEXIST и сетевых сбоев.
                                console.error(
                                        `[VaultSync] download FAILED: "${file.path}" (${file.size}B, hash=${file.hash.slice(0, 12)}…): ` +
                                                `${e?.message ?? String(e)}`,
                                );
                                queue.add(file, e?.message ?? String(e), Date.now());
                                stats.failed++;
                        }
                        transferred += file.size;
                        ui.setStatus('syncing', {
                                phase: 4,
                                progressText: `${stats.downloaded}`,
                                bytesTransferred: transferred,
                                totalBytes,
                        });
                }, concurrency);
        }

        /** [W2-T08] Карта путь → уровень для журнальных счётчиков исполненных
         *  удалений (матрица §2.2: лишние папки — всегда full). */
        private deletionLevelsOf(
                extraFolders: Array<{ path: string }>,
                mirrorDeletions: Array<{ path: string; level: MirrorLevel }>,
        ): Map<string, 'light' | 'full'> {
                const levels = new Map<string, 'light' | 'full'>();
                for (const f of extraFolders) levels.set(f.path, 'full');
                for (const x of mirrorDeletions) levels.set(x.path, x.level === 'full' ? 'full' : 'light');
                return levels;
        }

        private async processDeletions(paths: string[], stats: SyncStats, levelOf?: Map<string, 'light' | 'full'>): Promise<void> {
                const { vault, cache, options: o } = this.deps;
                for (const path of paths) {
                        // [W1-T01 / BUG-4] прерванные удаления — не успех: маркируем
                        // сессию отменённой (см. честную ветку в sync()).
                        if (this.shouldCancel) {
                                this.abortedThisSession = true;
                                break;
                        }
                        try {
                                if (o.useTrash() && vault.trash) await vault.trash(path);
                                else await vault.remove(path);
                                cache.delete(path);
                                stats.deleted++;
                                // [W2-T08] журнальные счётчики по уровням (только исполненные)
                                const lvl = levelOf?.get(path);
                                if (lvl === 'full') stats.deleteFull = (stats.deleteFull ?? 0) + 1;
                                else if (lvl === 'light') stats.deleteLight = (stats.deleteLight ?? 0) + 1;
                        } catch (e: any) {
                                console.error(`[VaultSync] Failed to delete ${path}:`, e?.message ?? e);
                        }
                }
                if (paths.length > 0) await this.cleanupEmptyDirectories(paths);
        }

        private async cleanupEmptyDirectories(deletedPaths: string[]): Promise<void> {
                const { vault, options: o } = this.deps;
                if (!vault.list) return; // адаптер без list (тесты) — пропускаем
                const dirsToCheck = new Set<string>();
                for (const path of deletedPaths) {
                        const lastSlash = path.lastIndexOf('/');
                        if (lastSlash > 0) dirsToCheck.add(path.substring(0, lastSlash));
                }
                // Глубокие primero
                const sortedDirs = Array.from(dirsToCheck).sort((a, b) => b.split('/').length - a.split('/').length);
                for (const dir of sortedDirs) {
                        try {
                                if (!(await vault.exists(dir))) continue;
                                const listed = await vault.list(dir);
                                if (listed.files.length === 0 && listed.folders.length === 0) {
                                        if (o.useTrash() && vault.trash) await vault.trash(dir);
                                        else await vault.remove(dir);
                                }
                        } catch { /* ignore */ }
                }
        }

        private async checkpoint(): Promise<void> {
                const interval = this.deps.options.checkpointInterval ?? DEFAULT_CHECKPOINT;
                this.checkpointCounter++;
                if (this.checkpointCounter >= interval) {
                        this.checkpointCounter = 0;
                        await this.persist('checkpoint');
                }
        }

        /** Кэш на диск + состояние настроек (очередь, счётчики). */
        private async persist(kind: 'checkpoint' | 'session-end' | 'success-end'): Promise<void> {
                await this.deps.cache.flush();
                await this.deps.options.persistState?.(kind);
        }

        /** [4-2] Горячая замена политики (настройки могли измениться). */
        setPolicy(policy: PathPolicy): void {
                this.deps.policy = policy;
        }

        /** [4-2] Смена sourceId (пользователь поменял repoUrl) — новый файл кэша. */
        setCache(cache: ManifestCache): void {
                this.deps.cache = cache;
        }

        /** [5-g] Горячая смена источника (git ↔ zip-url и смена URL). Старый — освобождается. */
        async setSource(source: import('../sources/types').SyncSource): Promise<void> {
                const old = this.deps.source;
                this.deps.source = source;
                try { await old.dispose?.(); } catch { /* ignore */ }
        }

        /** [POLICY Phase 3] Текущий источник (для модалки структуры-политики). */
        getCurrentSource(): import('../sources/types').SyncSource {
                return this.deps.source;
        }

        /** [POLICY Phase 2] Горячая замена структуры-политики (modal Save / смена источника). */
        setSyncPolicy(policy: SyncPolicy | undefined): void {
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
         * Ошибка отдельного move НЕ валит сессию: файл остаётся на старом пути,
         * diff скачает его на новый (кэш-ключ старого пути чистится cacheCleanup).
         */
        private async processRenames(moves: Array<{ from: string; to: string }>): Promise<void> {
                const { vault, cache, queue } = this.deps;
                for (const { from, to } of moves) {
                        // [W1-T01 / BUG-4] прерванные переименования — не успех.
                        if (this.shouldCancel) {
                                this.abortedThisSession = true;
                                break;
                        }
                        try {
                                if (!(await vault.exists(from))) continue;
                                if (await vault.exists(to)) continue;
                                await this.dirLock.ensure(vault, to);
                                await vault.rename(from, to);
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
                        } catch (e: any) {
                                console.error(`[VaultSync] rename FAILED ${from} → ${to}: ${e?.message ?? e}`);
                        }
                }
        }
}
