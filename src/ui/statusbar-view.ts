// src/ui/statusbar-view.ts — [W2-T02 / Д13=1] чистая display-логика статус-бара.
//
// Вся логика рендера (иконка + текст состояния, чип уровня зеркала, tooltip)
// вынесена из StatusBarManager (main.ts) в чистую функцию: main.ts нельзя
// импортировать в тестах (импорт 'obsidian' ломает node-env), а поведение
// статус-бара — контракт UI-реформы W2 (чип опасности Д13, BUG-6/7).
// DOM-часть в StatusBarManager остаётся тонкой: создать span-ы по сегментам.
//
// ЧИП УРОВНЯ ЗЕРКАЛА (Д13=1, решения В11-2/Д13): отображается во ВСЕХ
// состояниях, кроме 'unconfigured' (плагин не настроен — уровень показывать
// нечего). Классы: 'git-sync-mirror-chip mirror-fetch|mirror-light|mirror-full'.
// Стили/цвет чипа — W2-T09 (styles.ts); здесь только классы и тексты mc*.
// Tooltip чипа (aria-label) — mcTip*, отдельный от tooltip-а состояния.

import type { MirrorLevel } from '../core/mirror';
import { formatBytes } from '../utils/format';

/** Состояния статус-бара. Дублирует SyncState из main.ts: main.ts импортирует
 *  obsidian, поэтому чистый модуль объявляет совместимый тип сам. */
export type StatusBarState = 'idle' | 'syncing' | 'error' | 'offline' | 'conflicts' | 'unconfigured' | 'blocked';

/** Словарной срез, нужный статус-бару. Словари en/ru (Translations)
 *  удовлетворяют ему структурно — тесты подают настоящий словарь. */
export interface StatusBarTexts {
        sbBlocked?: string;
        sbAttention?:string;
	sbSyncing: string;
	sbSyncInProgress: string;
	sbError: string;
	sbErrorCount: (n: number) => string;
	sbSyncFailed: string;
	sbConflicts: (n: number) => string;
	sbConflictsTooltip: string;
	sbOffline: string;
	sbOfflineTooltip: string;
	sbUnconfigured: string;
	sbUnconfiguredTooltip: string;
	sbIdleTooltip: (lastSync: string) => string;
	mcChipFetch: string;
	mcChipLight: string;
	mcChipFull: string;
	mcTipFetch: string;
	mcTipLight: string;
	mcTipFull: string;
}

/** Один сегмент рендера: span с текстом и CSS-классами. */
export interface StatusBarSegment {
	text: string;
	cls: string;
	/** true → сегмент является чипом уровня зеркала (несёт свой tooltip). */
	chip?: boolean;
}

/** Результат view-функции: сегменты + атрибуты контейнера. */
export interface StatusBarView {
	segments: StatusBarSegment[];
	/** aria-label контейнера (tooltip состояния). */
	tooltip: string;
	/** CSS-класс контейнера: 'git-sync-status <state>'. */
	containerCls: string;
	/** aria-label чипа уровня зеркала; null — чип не рендерится. */
	chipTooltip: string | null;
}

export interface StatusBarViewOptions {
        attention?:'deletions'|'conflicts';
	pendingCount?: number;
	/** Текст фазы синхронизации (пусто → дефолт sbSyncing). */
	progressText?: string;
	/** Байтовый прогресс скачивания архива (механизм 2.3.3). */
	bytesTransferred?: number;
	totalBytes?: number;
	lastSyncText?: string;
	/** Уровень зеркала для чипа опасности (Д13=1). */
	mirrorLevel?: MirrorLevel;
	texts: StatusBarTexts;
}

/** Прогресс сессии: текст фазы + байты, если total известен (механизм 2.3.3,
 *  дословно из прежнего StatusBarManager.formatProgress). */
function progressTextOf(opts: StatusBarViewOptions, texts: StatusBarTexts): string {
	if (opts.progressText) {
		if ((opts.totalBytes ?? 0) > 0) {
			const transferred = formatBytes(opts.bytesTransferred ?? 0);
			const total = formatBytes(opts.totalBytes ?? 0);
			return `${opts.progressText} (${transferred}/${total})`;
		}
		return opts.progressText;
	}
	return texts.sbSyncing;
}

/**
 * Собрать модель отображения статус-бара (без DOM — тестируется напрямую).
 * Сегменты по порядку: [иконка] [текст?] [чип уровня зеркала?].
 */
export function statusBarView(state: StatusBarState, opts: StatusBarViewOptions): StatusBarView {
	const t = opts.texts;
	let icon: string;
	let text: string;
	let tooltip: string;
	switch (state) {
                case 'blocked':
                        icon='⛔';text=t.sbBlocked??t.sbError;tooltip=opts.progressText??text;break;
		case 'syncing':
			icon = '\u23F3';
			text = progressTextOf(opts, t);
			tooltip = t.sbSyncInProgress;
			break;
		case 'error':
			icon = '\u274C';
			text = opts.attention ? (t.sbAttention??t.sbError)+': '+(opts.pendingCount??0) : (opts.pendingCount ?? 0) > 0 ? t.sbErrorCount(opts.pendingCount ?? 0) : t.sbError;
			tooltip = t.sbSyncFailed;
			break;
		case 'conflicts':
			icon = '\u26A0\uFE0F';
			text = t.sbConflicts(opts.pendingCount ?? 0);
			tooltip = t.sbConflictsTooltip;
			break;
		case 'offline':
			// NB: '\u1F4F5' — исторический глиф 2.3.3 (греческая ὕ вместо
			// задуманного 📴 U+1F4F4): сохранён дословно, смена — вне W2-T02.
			icon = '\u1F4F5';
			text = t.sbOffline;
			tooltip = t.sbOfflineTooltip;
			break;
		case 'unconfigured':
			icon = '\u2699\uFE0F';
			text = t.sbUnconfigured;
			tooltip = t.sbUnconfiguredTooltip;
			break;
		case 'idle':
		default:
			icon = '\u2713';
			text = opts.lastSyncText ?? '';
			tooltip = t.sbIdleTooltip(text);
			break;
	}

	const segments: StatusBarSegment[] = [{ text: icon, cls: 'git-sync-icon' }];
	if (text) segments.push({ text, cls: 'git-sync-text' });

	// [W2-T02 / Д13=1] чип уровня зеркала: во всех состояниях кроме
	// 'unconfigured'. Реальный цвет добавит W2-T09 — здесь только классы.
	let chipTooltip: string | null = null;
	const level = opts.mirrorLevel;
	if (state !== 'unconfigured' && level !== undefined) {
		const chip = level === 'full'
			? { text: t.mcChipFull, cls: 'mirror-full', tip: t.mcTipFull }
			: level === 'light'
				? { text: t.mcChipLight, cls: 'mirror-light', tip: t.mcTipLight }
				: { text: t.mcChipFetch, cls: 'mirror-fetch', tip: t.mcTipFetch };
		segments.push({ text: chip.text, cls: `git-sync-mirror-chip ${chip.cls}`, chip: true });
		chipTooltip = chip.tip;
	}

	return { segments, tooltip, containerCls: `git-sync-status ${state}`, chipTooltip };
}
