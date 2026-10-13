import type { SyncProgress } from '../sources/types';
// src/ui/sync-popover.ts — «штаб синхронизации» popover [W2-T03 / Д5=1].
//
// Канон: решение Д5=1 (popover как «штаб»: чип состояния/уровня + фазы
// конвейера + действия + сводка последней сессии + конфликты + ссылки
// на журнал/настройки). Открывается по клику на статус-бар (W2-T02
// закрыл BUG-6: стабильный handler на всю жизнь, актуальность состояния
// проверяется в момент клика; здесь — только DOM-слой popover'а).
//
// ПАТТЕРН: чистый DOM-view в стиле journal-modal.ts (W2-T08): только
// document.createElement + deps-инъекция, obsidian НЕ импортируется —
// обёртку-Menu/абсолют-контейнер создаёт main.ts, зовёт render() на
// open, update(state) при каждом setStatus и close() при закрытии.
// happy-dom-совместимо.
//
// i18n [правило волны W2]: подписи — синглтон i18n.t.pop (контракт
// PopoverLabels в src/i18n/types.ts); названия фаз/действий/ссылок — там
// же. Сводка последней сессии использует i18n.t.jrnl (JournalLabels —
// те же подписи, что и модалка журнала, единый источник правды). Чип
// уровня — общие mcChip* и mcTip* (используется и в статус-баре, W2-T02),
// имя уровня — общие mln* (для чипа/модалок/настроек). Статус-бейдж
// переиспользует общие sb* строки (sbSyncing/sbError/sbOffline/sbUnconfigured/
// sbConflicts); idle-подпись — pop.statusIdle (W2-T03).

import { i18n } from '../i18n';
import type { JournalEntry, JournalOutcome, JournalTrigger } from '../core/journal';
import type { MirrorLevel } from '../core/mirror';
import { tr } from './dom';
import { operationTable } from './operation-table';
import { sessionLabel } from './session-label';

/** Короткая подпись idle-бейджа — из словаря (раньше module-local TODO). */
const IDLE_BADGE = () => i18n.t.pop.statusIdle;

/** Состояние popover — снимок Coordinator/StatusBar на момент open/update.
 *  Source-of-truth: main.ts StatusBarManager.setStatus копирует сюда поля
 *  из SyncState + сессии (phase/file* из coordinator events). */
export interface PopoverState extends Pick<SyncProgress,'stage'|'activities'|'currentFailed'|'issues'|'lastActivityAt'|'networkBytes'> {
        status: 'idle' | 'syncing' | 'error' | 'offline' | 'conflicts' | 'unconfigured' | 'blocked';
        profilesMode?: boolean;
        blockedReason?: string;
        attention?:'deletions'|'conflicts';
        mirrorLevel: MirrorLevel;
        /** Pending failed files (retry-очередь) — источник видимости actionRetry. */
        pendingErrorCount: number;
        /** Незакрытые конфликты (для конфликт-секции / status-бейджа). */
        conflictsCount: number;
        /** Фаза конвейера (0=manifest,1=policy,2=diff,3=deletions,4=downloads,
         *  5=finalize); -1 = вне сессии (idle/error/etc. — секция прогресса
         *  не рендерится). */
        phase: number;
        /** Файловый прогресс в фазе downloads. */
        fileIndex?: number;
        fileTotal?: number;
        currentPath?: string;
        bytesTransferred?: number;
        totalBytes?: number;
        /** Последняя завершённая сессия (для idle-подписи/отладки); null — никогда. */
        lastSyncTime?: number | null;
        /** [W4-T04] Scheduler snapshot — для индикатора «следующая через N мин».
         *  null = scheduler не инициализирован (W4-T04 не активирован в main.ts). */
        scheduler?: {
                blockedReason?:string;
                interval: 'off' | 'startup-only' | '15m' | '30m' | '1h' | '2h';
                paused: boolean; pending?:boolean;running?:boolean;
                minutesUntilNext: number | null;
        } | null;
}

/** Экшены popover — main.ts подключает реальные колбэки. onSync/Cancel/
 *  Retry/Close — основное меню «штаба»; onPauseAuto — W4-фича (авто-
 *  синхронизация): в W2 кнопка рендерится активной, main решает
 *  enabled/disabled, когда авто-движка появится; onOpenJournal/Settings —
 *  быстрые ссылки внизу. */
export interface SyncPopoverDeps {
        /** Корневой элемент popover (Menu/абсолют-контейнер в main.ts). */
        contentEl: HTMLElement;
        /** Последняя сессия из журнала (null = нет ещё). */
        lastEntry: JournalEntry | null;
        /** Стейт — меняется → вызывающий зовёт update(). */
        state: PopoverState;
        onSync: () => void;
        onCancel: () => void;
        onRetry: (paths?:readonly string[]) => void;
        onExportDiagnostics?:()=>void;
        onPauseAuto: () => void;
        onOpenJournal: () => void;
        onOpenSettings: () => void;
        onOpenWorkspace?: () => void;
        onRecovery?: () => void;
        onClose: () => void;
        /** Форматирование времени — инжект (main подставит toLocaleString);
         *  в core/journal дат-форматирования нет принципиально. */
        formatTime: (epochMs: number) => string;
        /** Форматирование байтов — инжект (main подставит utils/format.formatBytes). */
        formatBytes: (bytes: number) => string;
}

/** Названия фаз по индексу — ключи в pop-словаре (порядок жёсткий:
 *  0=manifest → 1=policy → 2=diff → 3=deletions → 4=downloads → 5=finalize). */
const PHASE_KEYS = [
        'phaseManifest', 'phasePolicy', 'phaseDiff', 'phaseDownloads',
        'phaseDeletions', 'phaseFinalize',
] as const;
const PHASE_ORDER = [0, 1, 2, 4, 3, 5];

type TriggerKey = 'triggerManual' | 'triggerAuto' | 'triggerRetry' | 'triggerScan' | 'triggerForce';
type OutcomeKey = 'outcomeOk' | 'outcomeCancelled' | 'outcomeError';

/** Триггер сессии → ключ подписи в jrnl-словаре (переиспользуем из журнала). */
const TRIGGER_KEY: Record<JournalTrigger, TriggerKey> = {
        manual: 'triggerManual',
        auto: 'triggerAuto',
        retry: 'triggerRetry',
        scan: 'triggerScan',
        force: 'triggerForce',
};

/** Исход сессии → ключ подписи в jrnl-словаре. */
const OUTCOME_KEY: Record<JournalOutcome, OutcomeKey> = {
        ok: 'outcomeOk',
        cancelled: 'outcomeCancelled',
        error: 'outcomeError',
};

/** DOM-конструктор без obsidian-расширений (паттерн journal-modal.ts). */
function el<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        opts: { cls?: string; text?: string; ariaLabel?: string; title?: string } = {},
): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (opts.cls) node.className = opts.cls;
        if (opts.text !== undefined) node.textContent = opts.text;
        if (opts.ariaLabel !== undefined) node.setAttribute('aria-label', opts.ariaLabel);
        if (opts.title !== undefined) node.setAttribute('title', opts.title);
        return node;
}

/** Чип уровня зеркала: общие mcChip* и mcTip* (одинаковый с статус-баром, W2-T02).
 *  НЕ дублирует логику — берёт те же строки, другой cls-префикс (pop-*). */
function chipForLevel(level: MirrorLevel): { cls: string; text: string; tip: string } {
        const t = i18n.t;
        if (level === 'full') return { cls: 'pop-chip-full', text: t.mcChipFull, tip: t.mcTipFull };
        if (level === 'light') return { cls: 'pop-chip-light', text: t.mcChipLight, tip: t.mcTipLight };
        return { cls: 'pop-chip-fetch', text: t.mcChipFetch, tip: t.mcTipFetch };
}

/** Локализованное имя уровня (общее mln*, единый источник с модалкой журнала). */
function levelName(level: MirrorLevel): string {
        const t = i18n.t;
        return level === 'fetch' ? t.mlnFetch : level === 'light' ? t.mlnLight : t.mlnFull;
}

/** Длительность: <1с → durationMs, иначе целые секунды durationSec (как в журнале). */
function formatDuration(ms: number): string {
        const t = i18n.t.jrnl;
        return ms < 1000 ? t.durationMs(ms) : t.durationSec(Math.floor(ms / 1000));
}

/**
 * DOM-view «штаба синхронизации» [W2-T03 / Д5=1].
 *
 * render() строит полное дерево один раз (на open); update(state)
 * перестраивает дерево без дублирования (contentEl.replaceChildren() +
 * полный render с нуля — фазы всегда = 6, чипы 1, кнопки по состоянию).
 * close() идемпотентен (флаг обрывает рекурсию view.close → onClose →
 * Menu.close → onClose → view.close), очищает контейнер и ровно один
 * раз дёргает deps.onClose().
 *
 * СЕКЦИИ (спека §4.1, 7 штук):
 *   1. Шапка: title + status-бейдж (pop-status-<state>) + чип уровня
 *      (pop-chip pop-chip-fetch|light|full, общие mcChip* и mcTip*).
 *   2. Кнопка закрытия ✕ (pop-close, aria-label=pop.close, в углу).
 *   3. Прогресс конвейера — ТОЛЬКО при status='syncing': 6 фаз
 *      (pop-phase pop-phase-done|current|pending), под ними fileProgress/
 *      currentPath/bytesProgress при наличии полей в state.
 *   4. Действия: actionSync (не syncing), actionCancel (syncing, danger),
 *      actionRetry (pendingErrorCount>0 или lastEntry.errors>0),
 *      actionPauseAuto (всегда видна, muted — W4-фича).
 *   5. Сводка последней сессии (lastEntry): outcome-бейдж + время +
 *      длительность + движок + уровень + триггер + счётчики (ненулевые,
 *      через ' · ') + topErrors (<details>). lastEntry=null → noLastSession.
 *   6. Конфликты (status='conflicts' или lastEntry.conflicts>0).
 *   7. Ссылки: linkJournal + linkSettings.
 */
export class SyncPopoverView {
        private readonly deps: SyncPopoverDeps;
        /** Текущий стейт (обновляется через update; deps.state — стартовое).
         *  Канонический источник внутри view — это поле, не deps.state. */
        private state: PopoverState;
        private closed = false;
        private lastSessionNode?:HTMLElement;private lastSessionEntry?:JournalEntry|null;

        constructor(deps: SyncPopoverDeps) {
                this.deps = deps;
                this.state = deps.state;
        }

        render(): void {
                const { contentEl } = this.deps;
                const activeElement=contentEl.contains(document.activeElement)?document.activeElement as HTMLElement:undefined;
                const detailsState=Array.from(contentEl.querySelectorAll<HTMLDetailsElement>('details')).map(item=>({cls:item.className,open:item.open}));
                const focused=contentEl.contains(document.activeElement)?{cls:(document.activeElement as HTMLElement).className,text:document.activeElement?.textContent}:undefined;
                contentEl.replaceChildren();
                contentEl.classList.add('pop-popover');

                // 1. Шапка: заголовок + статус-бейдж + чип уровня.
                contentEl.append(this.renderHeader());

                // 2. Кнопка закрытия — абсолют в углу (рендерим в корне для CSS-позиции).
                contentEl.append(this.renderCloseButton());

                // 3. Прогресс конвейера — ТОЛЬКО при status='syncing'.
                if (this.state.status === 'syncing') {
                        contentEl.append(this.renderProgress());
                }

                // 3.5 [W4-T04] Scheduler indicator «следующая через N мин» —
                // рендерится когда есть snapshot и интервал != 'off'.
                if (this.state.scheduler && this.state.scheduler.interval !== 'off') {
                        contentEl.append(this.renderScheduler());
                }

                // 4. Действия.
                contentEl.append(this.renderActions());

                // 5. Сводка последней сессии.
                if(this.lastSessionEntry!==this.deps.lastEntry||!this.lastSessionNode){this.lastSessionNode=this.renderLastSession();this.lastSessionEntry=this.deps.lastEntry;}
                for(const button of Array.from(this.lastSessionNode.querySelectorAll<HTMLButtonElement>('.pop-targeted-retries button')))button.disabled=this.state.status==='syncing';
                contentEl.append(this.lastSessionNode);

                // 6. Конфликты — при status='conflicts' или lastEntry.conflicts>0.
                if (this.state.status === 'conflicts' || (this.deps.lastEntry?.conflicts ?? 0) > 0 || (this.deps.lastEntry?.deferredConflicts??0)>0) {
                        contentEl.append(this.renderConflicts());
                }

                // 7. Ссылки внизу.
                contentEl.append(this.renderLinks());
                for(const item of detailsState){const details=Array.from(contentEl.querySelectorAll<HTMLDetailsElement>('details')).find(node=>node.className===item.cls);if(item.cls&&details)details.open=item.open;}
                if(activeElement&&contentEl.contains(activeElement))activeElement.focus();
                else if(focused)Array.from(contentEl.querySelectorAll<HTMLElement>('button')).find(button=>button.className===focused.cls&&button.textContent===focused.text)?.focus();
        }

        /** Обновить состояние и перерисовать. Без дублирования DOM:
         *  replaceChildren() + render() с нуля — фазы всегда 6, чипы 1, и т.д.
         *  Идемпотентен по закрытии: после close() update() — no-op (контейнер
         *  уже пуст, onClose отзвонил; скрытая защита от гонок «setStatus пришёл
         *  после close»). */
        update(state: PopoverState): void {
                if (this.closed) return;
                this.state = state;
                this.render();
        }
        setLastEntry(entry:JournalEntry|null):void { if(this.closed)return;this.deps.lastEntry=entry;this.render(); }

        /** Закрытие: идемпотентно (флаг), чистит контейнер, ровно один раз
         *  зовёт deps.onClose(). Рекурсия «view.close → onClose → Menu.close →
         *  onClose → view.close» обрывается флагом closed. */
        close(): void {
                if (this.closed) return;
                this.closed = true;
                this.deps.contentEl.replaceChildren();
                this.deps.onClose();
        }

        // ── private render ──

        /** Текст статус-бейджа: переиспользует общие sb* строки (не дублирует
         *  логику статус-бара); idle — pop.statusIdle (словарь). */
        private statusBadgeText(): string {
                const t = i18n.t;
                const s = this.state;
                switch (s.status) {
                        case 'blocked':return tr('Запуск заблокирован','Run blocked');
                        case 'syncing': return t.sbSyncing;
                        case 'error': return s.attention?tr('Требует внимания','Needs attention'):s.pendingErrorCount > 0 ? t.sbErrorCount(s.pendingErrorCount) : t.sbError;
                        case 'conflicts': return t.sbConflicts(s.conflictsCount);
                        case 'offline': return t.sbOffline;
                        case 'unconfigured': return t.sbUnconfigured;
                        case 'idle':
                        default: return IDLE_BADGE();
                }
        }

        private renderHeader(): HTMLElement {
                const t = i18n.t.pop;
                const header = el('div', { cls: 'pop-header' });
                header.append(el('h2', { text: t.title }));
                header.append(el('span', {
                        cls: `pop-status pop-status-${this.state.status}`,
                        text: this.statusBadgeText(),
                }));
                if(this.state.blockedReason)header.append(el('p',{text:this.state.blockedReason}));
                if(this.state.profilesMode){header.append(el('span',{cls:'pop-chip',text:tr('Профили назначенных областей','Assigned scope profiles')}));return header;}
                const chip = chipForLevel(this.state.mirrorLevel);
                header.append(el('span', {
                        cls: `pop-chip ${chip.cls}`,
                        text: chip.text,
                        title: chip.tip,
                }));
                return header;
        }

        private renderCloseButton(): HTMLElement {
                const t = i18n.t.pop;
                const btn = el('button', {
                        cls: 'pop-close',
                        text: '✕',
                        ariaLabel: t.close,
                });
                btn.addEventListener('click', () => this.close());
                return btn;
        }

        private renderProgress(): HTMLElement {
                const t = i18n.t.pop;
                const wrap = el('div', { cls: 'pop-progress' });

                // 6 фаз конвейера: точка-чип на каждую. Текущая — pop-phase-current,
                // пройденные — pop-phase-done, будущие — pop-phase-pending.
                const phases = el('div', { cls: 'pop-phases' });
                const cur = PHASE_ORDER.indexOf(this.state.phase);
                if (cur < 0) wrap.append(el('p', { text: tr('Подготовка запуска…', 'Preparing run…') }));
                for (let i = 0; i < PHASE_KEYS.length; i++) {
                        const key = PHASE_KEYS[i];
                        const cls = i < cur ? 'pop-phase pop-phase-done'
                                : i === cur ? 'pop-phase pop-phase-current'
                                : 'pop-phase pop-phase-pending';
                        phases.append(el('span', { cls, text: t[key] }));
                }
                wrap.append(phases);

                // Под-фаза: файловый прогресс, текущий путь, байты — только если есть.
                const sub = el('div', { cls: 'pop-progress-sub' });
                if (this.state.phase===4 && this.state.fileIndex !== undefined && (this.state.fileTotal??0)>0) {
                        sub.append(el('div', {
                                cls: 'pop-file-progress',
                                text: t.fileProgress(this.state.fileIndex, this.state.fileTotal??0),
                        }));
                }
                if (this.state.currentPath&&!this.state.activities?.length) {
                        sub.append(el('div', {
                                cls: 'pop-current-path',
                                text: t.currentPath(this.state.currentPath),
                        }));
                }
                const bytes = this.state.bytesTransferred ?? 0;
                const totalBytes = this.state.totalBytes ?? 0;
                if (totalBytes > 0) {
                        const transferred = this.deps.formatBytes(bytes);
                        const totalStr = this.deps.formatBytes(totalBytes);
                        sub.append(el('div', {
                                cls: 'pop-bytes-progress',
                                text: t.bytesProgress(transferred, totalStr),
                        }));
                }
                if((this.state.networkBytes??0)>bytes)sub.append(el('small',{text:tr('Трафик файлов с учётом повторов: ','File traffic including retries: ')+this.deps.formatBytes(this.state.networkBytes!)}));
                if(this.state.stage==='cancelling')sub.append(el('p',{text:tr('Отмена: уже начатая запись должна завершиться. Применённые файлы сохраняются.','Cancelling: an active write must finish. Applied files are retained.')}));
                else if(this.state.stage)sub.append(el('p',{text:stageLabel(this.state.stage)}));
                for(const activity of this.state.activities??[]){
                        const line=el('div',{cls:'pop-active-file'});
                        line.append(el('code',{text:activity.path||activity.source||''}),el('span',{text:[activity.source,stageLabel(activity.stage),activity.attempt?tr('попытка ','attempt ')+activity.attempt+'/'+activity.maxAttempts:'',activity.host].filter(Boolean).join(' · ')}));
                        if(activity.items!==undefined)line.append(el('small',{text:tr('Файлов в каталоге: ','Files inventoried: ')+activity.items}));
                        if(activity.retryAt)line.append(el('small',{text:tr('Ожидание: ','Waiting: ')+Math.max(0,Math.ceil((activity.retryAt-Date.now())/1000))+' s'}));
                        else line.append(el('small',{text:tr('С последней активности: ','Since last activity: ')+Math.max(0,Math.floor((Date.now()-activity.lastActivityAt)/1000))+' s'}));
                        if(activity.capability==='buffered')line.append(el('small',{text:tr('Платформа возвращает файл целиком; байты видны после ответа. Отмена не останавливает запрос ОС.','The platform returns the whole file; bytes appear after the response. Cancel does not stop the OS request.')}));
                        wrap.append(line);
                }
                if(this.state.currentFailed)sub.append(el('p',{text:tr('Новые ошибки этого запуска: ','New failures in this run: ')+this.state.currentFailed}));
                if(this.state.issues?.length){const list=el('details',{cls:'pop-live-errors'});list.append(el('summary',{text:tr('Ошибки текущего запуска','Failures in this run')}));for(const row of this.state.issues.slice(-10))list.append(el('p',{text:row.path+' · '+(row.issue?.message??row.reason)}));wrap.append(list);}
                if (sub.children.length > 0) wrap.append(sub);
                return wrap;
        }

        private renderActions(): HTMLElement {
                const t = i18n.t.pop;
                const s = this.state;
                const wrap = el('div', { cls: 'pop-actions' });

                // actionSync — только не при syncing.
                if (s.status !== 'syncing') {
                        const b = el('button', { cls: 'pop-action pop-action-sync', text: s.status==='blocked'?tr('Повторить запуск','Retry run'):t.actionSync });
                        b.disabled=s.status==='unconfigured';
                        b.addEventListener('click', () => this.deps.onSync());
                        wrap.append(b);
                }

                // actionCancel — только при syncing, danger-стиль (cls pop-action-danger).
                if (s.status === 'syncing') {
                        const b = el('button', { cls: 'pop-action pop-action-danger', text: t.actionCancel });
                        b.addEventListener('click', () => this.deps.onCancel());
                        wrap.append(b);
                }

                // actionRetry — при pendingErrorCount>0 или lastEntry.errors>0.
                if (s.pendingErrorCount > 0 && s.status!=='syncing' && s.status!=='blocked' && s.status!=='unconfigured') {
                        const b = el('button', { cls: 'pop-action pop-action-retry', text: t.actionRetry });
                        b.addEventListener('click', () => this.deps.onRetry());
                        wrap.append(b);
                }

                // actionPauseAuto — W4-T04: теперь с scheduler-состоянием.
                //   - scheduler.interval='off' или отсутствует — кнопка НЕ рендерится
                //     (нет авто-движка; делать здесь нечего).
                //   - paused=false → подпись autoPause, клик → deps.onPauseAuto.
                //   - paused=true  → подпись autoResume, клик → deps.onPauseAuto
                //     (main.ts решает, что toggle с паузы = resume).
                const sched = this.state.scheduler;
                if (sched && sched.interval !== 'off') {
                        const isPaused = sched.paused;
                        const T = i18n.t;
                        const pause = el('button', {
                                cls: 'pop-action pop-action-muted',
                                text: isPaused ? T.autoResume : T.autoPause,
                        });
                        pause.addEventListener('click', () => this.deps.onPauseAuto());
                        wrap.append(pause);
                }

                return wrap;
        }

        /** [W4-T04] Индикатор «следующая через N мин» — короткий блок
         *  под прогрессом (или вместо него в idle). Paused-вариант —
         *  соответствующая подпись из словаря. */
        private renderScheduler(): HTMLElement {
                const t = i18n.t;
                const sched = this.state.scheduler!;
                const wrap = el('div', { cls: 'pop-scheduler' });
                if (sched.paused) {
                        wrap.append(el('span', { cls: 'pop-scheduler-state pop-scheduler-paused', text: t.autoPausedState }));
                        return wrap;
                }
                if(sched.blockedReason){wrap.append(el('span',{text:tr('Автозапуски остановлены: ','Automatic runs stopped: ')+sched.blockedReason+tr(' Исправьте причину и выполните ручной запуск.',' Fix the cause and run manually.')}));return wrap;}
                if(sched.pending){wrap.append(el('span',{text:tr('Автозапуск ожидает сеть, доступ или завершение текущей сессии.','Automatic run awaits network, access or the active session.')}));return wrap;}
                if (sched.minutesUntilNext === null) {
                        // interval='startup-only' после первого тика — nextTickAt=null.
                        // Но startup-only сам по себе не должен здесь оказаться (одноразовый),
                        // это страховочная ветка.
                        wrap.append(el('span', { cls: 'pop-scheduler-state', text: t.autoOffState }));
                        return wrap;
                }
                wrap.append(el('span', {
                        cls: 'pop-scheduler-state pop-scheduler-next',
                        text: t.autoNextIn(sched.minutesUntilNext),
                }));
                return wrap;
        }

        private renderLastSession(): HTMLElement {
                const t = i18n.t.pop;
                const jrnl = i18n.t.jrnl;
                const wrap = el('div', { cls: 'pop-last-session' });

                // lastEntry=null → noLastSession (без outcome-бейджа, без stats).
                if (this.deps.lastEntry === null) {
                        wrap.append(el('div', { cls: 'pop-no-session', text: t.noLastSession }));
                        return wrap;
                }

                const e = this.deps.lastEntry;
                wrap.append(el('div', { cls: 'pop-section-title', text: t.lastSession }));

                // Строка: время · outcome-бейдж · длительность · движок · уровень · триггер.
                const row = el('div', { cls: 'pop-last-row' });
                row.append(el('span', { cls: 'pop-when', text: this.deps.formatTime(e.startedAt) }));
                row.append(el('span', {
                        cls: `pop-outcome pop-outcome-${e.outcome}`,
                        text: sessionLabel(e,jrnl[OUTCOME_KEY[e.outcome]]),
                }));
                row.append(el('span', { cls: 'pop-duration', text: formatDuration(e.durationMs) }));
                row.append(el('span', { cls: 'pop-engine', text: e.sources?.join(', ') || e.engine }));
                if(!e.profilesMode)row.append(el('span', { cls: 'pop-level', text: levelName(e.mirrorLevel) }));
                row.append(el('span', { cls: 'pop-trigger', text: jrnl[TRIGGER_KEY[e.trigger]] }));
                wrap.append(row);
                if(e.blockedReason)wrap.append(el('p',{text:e.blockedReason}));
                if(e.pendingAfter)wrap.append(el('p',{text:tr('Нерешённых файлов после запуска: ','Unresolved files after this run: ')+e.pendingAfter+tr(' · автоповтор: ',' · automatic retry: ')+(e.retryScheduled??0)+tr(' · требуют исправления: ',' · require repair: ')+(e.blocked??0)}));
                if(e.notAttempted)wrap.append(el('p',{text:tr('Отложено из-за остановки: ','Deferred after stopping: ')+e.notAttempted}));
                if(e.results?.some(row=>row.status==='error')){
                        const actions=el('div',{cls:'pop-targeted-retries'});
                        for(const row of e.results.filter(row=>row.status==='error').slice(0,20)){const retry=el('button',{text:tr('Повторить: ','Retry: ')+row.path});retry.disabled=this.state.status==='syncing';retry.addEventListener('click',()=>this.deps.onRetry([row.path]));actions.append(retry);}wrap.append(actions);
                }
                if(e.results?.length){const details=el('details');details.append(el('summary',{text:tr('Результаты по файлам','File results')}),operationTable(e.results));wrap.append(details);}

                // Счётчики — только ненулевые, через ' · '.
                const stats = this.statsLine(e);
                if (stats !== '') {
                        wrap.append(el('div', { cls: 'pop-stats', text: stats }));
                }

                // topErrors — нативный <details>/<summary> (как в journal-modal.ts).
                if (e.topErrors.length > 0) {
                        const details = el('details', { cls: 'pop-errors' });
                        details.append(el('summary', { text: jrnl.topErrors }));
                        const ul = el('ul', { cls: 'pop-errors-list' });
                        for (const { message, count } of e.topErrors) {
                                ul.append(el('li', { text: `${message} ×${count}` }));
                        }
                        details.append(ul);
                        wrap.append(details);
                }
                return wrap;
        }

        /** Строка счётчиков: только ненулевые, через ' · '. Пустая сессия → ''. */
        private statsLine(e: JournalEntry): string {
                const t = i18n.t.jrnl;
                const parts: string[] = [];
                if (e.downloaded > 0) parts.push(t.statDownloaded(e.downloaded));
                if (e.updated > 0) parts.push(t.statUpdated(e.updated));
                if (e.deletedLight > 0) parts.push(t.statDeletedLight(e.deletedLight));
                if (e.deletedFull > 0) parts.push(t.statDeletedFull(e.deletedFull));
                if (e.overwritten > 0) parts.push(t.statOverwritten(e.overwritten));
                if (e.conflicts > 0) parts.push(t.statConflicts(e.conflicts));
                if (e.skipped > 0) parts.push(t.statSkipped(e.skipped));
                if (e.errors > 0) parts.push(t.statErrors(e.errors));
                if(e.received)parts.push(tr('Получено из источника: ','Read from source: ')+e.received);
                if(e.deferredConflicts)parts.push(tr('Ожидают решения: ','Awaiting decision: ')+e.deferredConflicts);
                if(e.blockedDeletions)parts.push(t.statBlocked(e.blockedDeletions));
                const deferred=(e.deferredDeletions??0)-(e.blockedDeletions??0);
                if(deferred>0)parts.push(t.statDeferred(deferred));
                return parts.join(' · ');
        }

        private renderConflicts(): HTMLElement {
                const t = i18n.t.pop;
                const wrap = el('div', { cls: 'pop-conflicts' });
                wrap.append(el('div', { cls: 'pop-section-title', text: t.conflictsSection }));
                wrap.append(el('div', { cls: 'pop-conflicts-hint', text: t.conflictsHint }));
                if((this.deps.lastEntry?.deferredConflicts??0)>0){
                        const decide=el('button',{text:tr('Разрешить конфликты при ручном запуске','Resolve conflicts in a manual run')});
                        decide.disabled=this.state.status==='syncing'||this.state.status==='blocked';decide.addEventListener('click',()=>this.deps.onSync());wrap.append(decide);
                }
                return wrap;
        }

        private renderLinks(): HTMLElement {
                const t = i18n.t.pop;
                const wrap = el('div', { cls: 'pop-links' });
                if(this.deps.onExportDiagnostics){const exportButton=el('button',{text:tr('Скачать диагностику','Download diagnostics')});exportButton.addEventListener('click',()=>this.deps.onExportDiagnostics!());wrap.append(exportButton);}
                if(this.deps.onOpenWorkspace){const b=el('button',{cls:'pop-link pop-link-workspace',text:tr('Рабочее окно','Workspace')});b.addEventListener('click',()=>this.deps.onOpenWorkspace!());wrap.append(b);}
                if(this.deps.onRecovery){const b=el('button',{cls:'pop-link pop-link-recovery',text:tr('Восстановление','Recovery')});b.addEventListener('click',()=>this.deps.onRecovery!());wrap.append(b);}
                const j = el('button', { cls: 'pop-link pop-link-journal', text: t.linkJournal });
                j.addEventListener('click', () => this.deps.onOpenJournal());
                wrap.append(j);
                const s = el('button', { cls: 'pop-link pop-link-settings', text: t.linkSettings });
                s.addEventListener('click', () => this.deps.onOpenSettings());
                wrap.append(s);
                return wrap;
        }
}

function stageLabel(stage:string):string{return ({preparing:tr('Подготовка','Preparing'),recovery:tr('Проверка восстановления','Checking recovery'),manifest:tr('Чтение каталога / архива','Reading inventory / archive'),'observe-local':tr('Проверка локальных версий','Checking local versions'),confirm:tr('Ожидается подтверждение','Awaiting confirmation'),'download-link':tr('Получение ссылки на файл','Obtaining download link'),download:tr('Получение файла','Receiving file'),waiting:tr('Ожидание повторной попытки','Waiting to retry'),verify:tr('Проверка содержимого','Verifying content'),'prepare-directory':tr('Проверка каталогов','Checking directories'),apply:tr('Сохранение / решение конфликта','Saving / resolving conflict'),checkpoint:tr('Сохранение состояния','Saving state'),finalize:tr('Завершение и освобождение ресурсов','Finalizing and releasing resources') } as Record<string,string>)[stage]??stage;}
