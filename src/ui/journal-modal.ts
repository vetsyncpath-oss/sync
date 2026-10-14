// src/ui/journal-modal.ts — модалка «Журнал синхронизации» [W2-T08].
//
// Канон: решения Д7=1 (журнал просматривается из sync-popover), В6=3
// (единый источник данных — core/journal). DOM-слой в паттерне
// vault-tree-modal.ts: чистый рендер через document.createElement +
// deps-инъекция, obsidian НЕ импортируется вообще (в отличие от
// vault-tree-modal, которому нужен Modal/Menu/Notice) — обёрткой-Modal
// владеет main.ts и зовёт JournalModalView.render()/close() из
// onOpen()/onClose(). happy-dom-совместимо.
//
// РЕНДЕР: заголовок + кнопка закрытия; пустой журнал → empty-текст;
// иначе строка колонок (col*) и по одной СВЁРНУТОЙ строке на сессию:
//   время (injected formatTime) · outcome-бейдж (j-outcome-*) ·
//   длительность (<1с → durationMs, иначе durationSec) · движок ·
//   уровень · триггер · счётчики (только ненулевые, через ' · ') ·
//   topErrors разворачиваемым <details>. Никаких ASCII-таблиц —
//   простой список div'ами (подвижные колонки не нужны).
//
// i18n [правило волны W2]: подписи — deps.labels (контракт JournalLabels,
// main подставит i18n.t.jrnl). Названия уровней зеркала берём из ОБЩЕЙ
// mln*-секции синглтона i18n (единый источник имён уровней для чипа
// настроек/модалок, W2-T02) — в jrnl-контракте level-имён нет.

import type { JournalEntry, JournalOutcome, JournalTrigger } from '../core/journal';
import { i18n } from '../i18n';
import { jobHistory } from './job-cards';
import { operationTable } from './operation-table';
import { tr } from './dom';
import { sessionLabel } from './session-label';
import type { JournalLabels } from '../i18n/types';

// TODO(i18n): универсальной подписи «Закрыть» в словаре нет (в jrnl-секции
// её не закладывали); кнопка закрытия — нейтральный глиф ✕, независимый
// от локали. main при консолидации может вынести close-строку в Translations.
const CLOSE_GLYPH = '✕';

export interface JournalModalDeps {
	/** Контейнер модалки (Modal.contentEl обёртки из main.ts). */
	contentEl: HTMLElement;
	/** Записи журнала (FileJournal.load(): новые сверху). */
	entries: JournalEntry[];
	/** Подписи из i18n.t.jrnl (контракт JournalLabels). */
	labels: JournalLabels;
	/** Вызывается один раз при закрытии (main свяжет с Modal.close()). */
	onClose: () => void;
	/** Форматирование времени — инжект (main подставит toLocaleString);
	 * в core/journal дат-форматирования нет принципиально. */
	formatTime: (epochMs: number) => string;
}

/** DOM-конструктор без obsidian-расширений (паттерн vault-tree-modal). */
function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	opts: { cls?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (opts.cls) node.className = opts.cls;
	if (opts.text !== undefined) node.textContent = opts.text;
	return node;
}

type TriggerKey = 'triggerManual' | 'triggerAuto' | 'triggerRetry' | 'triggerScan' | 'triggerForce';
type OutcomeKey = 'outcomeOk' | 'outcomeCancelled' | 'outcomeError';

/** Триггер сессии → ключ подписи в jrnl-словаре. */
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

/** Уровень зеркала → локализованное имя из общей mln*-секции (W2-T02). */
function levelName(level: JournalEntry['mirrorLevel']): string {
	const t = i18n.t;
	return level === 'fetch' ? t.mlnFetch : level === 'light' ? t.mlnLight : t.mlnFull;
}

/** Длительность: <1с → durationMs, иначе целые секунды durationSec. */
function formatDuration(ms: number, t: JournalLabels): string {
	return ms < 1000 ? t.durationMs(ms) : t.durationSec(Math.floor(ms / 1000));
}

/**
 * Чистый DOM-view журнала сессий [W2-T08]. render() строит список один
 * раз (данные уже загружены — журналу не нужны async-состояния);
 * close() идемпотентен и дёргает deps.onClose() ровно один раз.
 */
export class JournalModalView {
	private readonly deps: JournalModalDeps;
	private closed = false;

	constructor(deps: JournalModalDeps) {
		this.deps = deps;
	}

	render(): void {
		const { contentEl, labels: t } = this.deps;
		contentEl.replaceChildren();
		contentEl.classList.add('jrnl-modal');

		const header = el('div', { cls: 'jrnl-header' });
		header.append(el('h2', { text: t.title }));
		const closeBtn = el('button', { cls: 'jrnl-close', text: CLOSE_GLYPH });
		closeBtn.addEventListener('click', () => this.close());
		header.append(closeBtn);
		contentEl.append(header);

		if (this.deps.entries.length === 0) {
			contentEl.append(el('div', { cls: 'jrnl-empty', text: t.empty }));
			return;
		}

		// Строка колонок — подписи col* словаря (мьютед-легенда над списком).
		contentEl.append(el('div', {
			cls: 'jrnl-cols',
			text: [t.colWhen, t.colDuration, t.colEngine, t.colLevel, t.colTrigger].join(' · '),
		}));

		const list = el('div', { cls: 'jrnl-list' });
		for (const entry of this.deps.entries) {
			list.append(this.renderEntry(entry));
		}
		contentEl.append(list);
	}

	private renderEntry(e: JournalEntry): HTMLElement {
		const t = this.deps.labels;
		const row = el('div', { cls: 'jrnl-row' });

		const main = el('div', { cls: 'jrnl-row-main' });
		main.append(el('span', { cls: 'jrnl-when', text: this.deps.formatTime(e.startedAt) }));
		// Цветной бейдж исхода: j-outcome-ok / j-outcome-cancelled / j-outcome-error.
		main.append(el('span', {
			cls: `jrnl-outcome j-outcome-${e.outcome}`,
			text: sessionLabel(e,t[OUTCOME_KEY[e.outcome]]),
		}));
		main.append(el('span', { cls: 'jrnl-duration', text: formatDuration(e.durationMs, t) }));
                main.append(el('span', { cls: 'jrnl-engine', text: e.sources?.join(', ') || e.engine }));
                if(!e.profilesMode)main.append(el('span', { cls: 'jrnl-level', text: levelName(e.mirrorLevel) }));
		main.append(el('span', { cls: 'jrnl-trigger', text: t[TRIGGER_KEY[e.trigger]] }));
		row.append(main);
                if(e.attemptOnly)row.append(el('p',{text:tr('Запуск не состоялся','Run did not start')}));
                if(e.blockedReason)row.append(el('p',{text:e.blockedReason}));
                if(e.jobResults?.length)row.append(jobHistory(e.jobResults,e.jobResultsTotal));
                if(e.results?.length){const details=el('details');details.append(el('summary',{text:tr('Результаты по файлам','File results')}),operationTable(e.results));if((e.resultsTotal??0)>e.results.length)details.append(el('p',{text:tr('Показаны первые ','Showing first ')+e.results.length+' / '+e.resultsTotal}));row.append(details);}

		const stats = this.statsLine(e);
		if (stats !== '') {
			row.append(el('div', { cls: 'jrnl-stats', text: stats }));
		}

		if (e.topErrors.length > 0) {
			// Разворачиваемый список частых ошибок — нативный <details>.
			const details = el('details', { cls: 'jrnl-errors' });
			details.append(el('summary', { text: t.topErrors }));
			const ul = el('ul', { cls: 'jrnl-errors-list' });
			for (const { message, count } of e.topErrors) {
				ul.append(el('li', { text: `${message} ×${count}` }));
			}
			details.append(ul);
			row.append(details);
		}
		return row;
	}

	/** Строка счётчиков: только ненулевые, через ' · '. Пустая сессия → ''. */
	private statsLine(e: JournalEntry): string {
		const t = this.deps.labels;
		const parts: string[] = [];
		if (e.downloaded > 0) parts.push(t.statDownloaded(e.downloaded));
                if(e.uploaded)parts.push(tr('Отправлено в Drive: ','Uploaded to Drive: ')+e.uploaded);
		if (e.updated > 0) parts.push(t.statUpdated(e.updated));
		if (e.deletedLight > 0) parts.push(t.statDeletedLight(e.deletedLight));
		if (e.deletedFull > 0) parts.push(t.statDeletedFull(e.deletedFull));
		if (e.overwritten > 0) parts.push(t.statOverwritten(e.overwritten));
		if (e.conflicts > 0) parts.push(t.statConflicts(e.conflicts));
		if (e.skipped > 0) parts.push(t.statSkipped(e.skipped));
		if (e.errors > 0) parts.push(t.statErrors(e.errors));
                if(e.received)parts.push(tr('Получено из источника: ','Read from source: ')+e.received);
                if(e.deferredConflicts)parts.push(tr('Ожидают решения: ','Awaiting decision: ')+e.deferredConflicts);
		const deferred = (e.deferredDeletions ?? 0) - (e.blockedDeletions ?? 0);
		if (deferred > 0) parts.push(t.statDeferred(deferred));
		if ((e.blockedDeletions ?? 0) > 0) parts.push(t.statBlocked(e.blockedDeletions!));
		return parts.join(' · ');
	}

	/**
	 * Закрытие view: идемпотентно (флаг), очищает контейнер и ровно один
	 * раз дёргает deps.onClose(). Рекурсия «view.close → onClose →
	 * Modal.close → onClose → view.close» обрывается флагом closed.
	 */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.deps.contentEl.replaceChildren();
		this.deps.onClose();
	}
}
