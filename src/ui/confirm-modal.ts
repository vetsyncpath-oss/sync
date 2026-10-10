// src/ui/confirm-modal.ts — единый confirm-modal [W2-T04].
//
// Канон: решения В5=1+2 (опасное действие — confirm; авто — модалка-
// оповещение из popover), spec §4.2 (рендер подтверждения). Один шаблон
// для sync/force/retry/scan — ДРАЙВЕР выбирает flow, рендер собирает
// ТОЛЬКО ненулевые секции (раньше 4 разные html-сборки в main.ts).
//
// DOM-слой в паттерне journal-modal.ts: чистый рендер через
// document.createElement + deps-инъекция, obsidian НЕ импортируется
// ВООБЩЕ (типы Modal/App — зона main.ts). main.ts создаёт Modal-обёртку,
// инстанцирует ConfirmModalView(deps), зовёт render() из onOpen и
// close() из onClose; результат читает через waitForResult().
//
// ИНВАРИАНТ ИДЕМПОТЕНТНОСТИ: ровно один resolve (proceed → true /
// cancel → false / modal-close — cancel). Повторные клики игнорируются
// флагом resolved — Promise не «дёргается» дважды.
//
// BUG-10: имя движка — deps.engine (НЕ хардкод 'GitHub'). Рендерится
// отдельной строкой cls 'cfm-engine' под заголовком.
//
// i18n [правило волны W2]: подписи — i18n.t.cfm (контракт ConfirmLabels,
// владелец словаря — main). Недостающих ключей в cfm НЕТ; единственная
// module-local TODO — нейтральный engine-label 'Engine: %s' (отдельной
// строки в словаре нет, нейтральная ASCII-подпись локаль-независима).

import { i18n } from '../i18n';
import { formatBytes } from '../utils/format';

export type ConfirmFlow = 'sync' | 'force' | 'retry' | 'scan';

/** Данные для рендера — main.ts собирает их из ConfirmSyncInfo/scan. */
export interface ConfirmSections {
        blockedDeletions?: number;
        /** Скачиваний всего (NEW + MODIFIED + MISSING_LOCAL). */
        toDownload?: number;
        /** Из них обновлений (MODIFIED). */
        toUpdate?: number;
        /** Из них новых (NEW). */
        newCount?: number;
        /** Из них отсутствующих локально (MISSING_LOCAL). */
        toRestore?: number;
        /** Удалений лёгкого уровня (mirror=light). */
        deleteLight?: number;
        /** Удалений полного уровня (mirror=full: файлы + лишние папки). */
        deleteFull?: number;
        /** Перезаписей локальных версий при конфликте на уровне full. */
        overwrite?: number;
        /** Previously synced files absent remotely that will be retained locally. */
        orphans?: number;
        /** Суммарный объём скачивания, байт. */
        downloadBytes?: number;
        /** Пути — уже отсортированы caller'ом; рендерим топ-10. */
        paths?: string[];
        /** !useTrash → удаления безвозвратны (noRecovery-предупреждение). */
        noRecovery?: boolean;
}

export interface ConfirmModalDeps {
        /** Контейнер модалки (Modal.contentEl обёртки из main.ts). */
        contentEl: HTMLElement;
        /** Тип подтверждения — определяет заголовок. */
        flow: ConfirmFlow;
        /** BUG-10: имя движка (НЕ хардкод 'GitHub'). */
        engine: string;
        /** Секции рендера (ненулевые показываются). */
        sections: ConfirmSections;
        /** Proceed-клик → main.ts закрывает Modal (Modal.close). */
        onProceed: () => void;
        /** Cancel-клик / Modal.onClose (Esc/фон) → main.ts закрывает Modal. */
        onCancel: () => void;
}

// [W2-T04] Подпись движка — из словаря (cfm.engineLabel); имя движка
// подставляется (BUG-10: НЕ хардкод 'GitHub').
const ENGINE_LABEL = () => i18n.t.cfm.engineLabel;

const TITLE_KEY: Record<ConfirmFlow, 'titleSync' | 'titleForce' | 'titleRetry' | 'titleScan'> = {
        sync: 'titleSync',
        force: 'titleForce',
        retry: 'titleRetry',
        scan: 'titleScan',
};

/** DOM-конструктор без obsidian-расширений (паттерн journal-modal). */
function el<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        opts: { cls?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (opts.cls) node.className = opts.cls;
        if (opts.text !== undefined) node.textContent = opts.text;
        return node;
}

/** true, если в секциях есть зеркальные/перезаписывающие удаления —
 *  определяет warning-стиль proceed-кнопки и danger-предупреждение. */
function hasDeletes(s: ConfirmSections): boolean {
        return (
                (s.deleteLight ?? 0) > 0 ||
                (s.deleteFull ?? 0) > 0 ||
                (s.overwrite ?? 0) > 0
        );
}

/**
 * Чистый DOM-view confirm-модалки [W2-T04]. render() собирает секции один
 * раз; waitForResult() — Promise-based API (proceed → true, cancel → false,
 * идемпотентно). close() — внешнее закрытие Modal'а (Esc/фон), трактуется
 * как cancel; тоже идемпотентен.
 */
export class ConfirmModalView {
        private readonly deps: ConfirmModalDeps;
        private resolved = false;
        private resultValue: boolean | null = null;
        private resolver: ((value: boolean) => void) | null = null;
        private promise: Promise<boolean> | null = null;

        constructor(deps: ConfirmModalDeps) {
                this.deps = deps;
        }

        render(): void {
                const { contentEl, flow, engine, sections } = this.deps;
                const t = i18n.t.cfm;
                contentEl.replaceChildren();
                contentEl.classList.add('cfm-modal');

                // Заголовок: flow → словарный ключ (titleSync/Force/Retry/Scan).
                contentEl.append(el('h2', { cls: 'cfm-title', text: t[TITLE_KEY[flow]] }));

                // BUG-10: имя движка — НЕ хардкод 'GitHub'. Под заголовком, cls 'cfm-engine'.
                contentEl.append(el('div', { cls: 'cfm-engine', text: `${ENGINE_LABEL()}: ${engine}` }));

                // Секции: только ненулевые (zero → не показываем).
                const sectionsEl = el('div', { cls: 'cfm-sections' });
                if ((sections.blockedDeletions ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec', text: t.sectionBlocked(sections.blockedDeletions!) }));
                }
                if ((sections.toDownload ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec cfm-sec-download', text: t.sectionDownload(sections.toDownload!) }));
                        if ((sections.downloadBytes ?? 0) > 0) {
                                sectionsEl.append(el('div', { cls: 'cfm-bytes', text: t.bytesLine(formatBytes(sections.downloadBytes!)) }));
                        }
                }
                if ((sections.toUpdate ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec cfm-sec-update', text: t.sectionUpdate(sections.toUpdate!) }));
                }
                if ((sections.newCount ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec cfm-sec-new', text: t.sectionNew(sections.newCount!) }));
                }
                if ((sections.toRestore ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec cfm-sec-restore', text: t.sectionRestore(sections.toRestore!) }));
                }
                if ((sections.deleteLight ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec cfm-sec-delete-light', text: t.sectionDeleteLight(sections.deleteLight!) }));
                }
                if ((sections.deleteFull ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec cfm-sec-delete-full', text: t.sectionDeleteFull(sections.deleteFull!) }));
                }
                if ((sections.overwrite ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec cfm-sec-overwrite', text: t.sectionOverwrite(sections.overwrite!) }));
                }
                if ((sections.orphans ?? 0) > 0) {
                        sectionsEl.append(el('div', { cls: 'cfm-sec cfm-sec-orphan', text: t.sectionOrphan(sections.orphans!) }));
                }
                contentEl.append(sectionsEl);

                // Пути: топ-10 (caller уже отсортировал); если >10 — pathsMore(N-10).
                if ((sections.paths?.length ?? 0) > 0) {
                        const wrap = el('div', { cls: 'cfm-paths' });
                        wrap.append(el('div', { cls: 'cfm-paths-title', text: t.pathsTitle }));
                        const ul = el('ul', { cls: 'cfm-paths-list' });
                        const top = sections.paths!.slice(0, 10);
                        for (const p of top) {
                                ul.append(el('li', { text: p }));
                        }
                        wrap.append(ul);
                        if (sections.paths!.length > 10) {
                                wrap.append(el('div', { cls: 'cfm-paths-more', text: t.pathsMore(sections.paths!.length - 10) }));
                        }
                        contentEl.append(wrap);
                }

                // Опасность: есть удаления → dangerWarning; noRecovery → доп. noRecovery.
                if (hasDeletes(sections)) {
                        contentEl.append(el('div', { cls: 'cfm-danger', text: t.dangerWarning }));
                }
                if (sections.noRecovery) {
                        contentEl.append(el('div', { cls: 'cfm-norecovery', text: t.noRecovery }));
                }

                // Кнопки: cancel (НЕ danger), proceed (warning iff есть удаления).
                const btnContainer = el('div', { cls: 'cfm-buttons' });
                const cancelBtn = el('button', { cls: 'cfm-cancel', text: t.cancel });
                cancelBtn.addEventListener('click', () => this.resolve(false));
                const proceedCls = hasDeletes(sections)
                        ? 'cfm-proceed cfm-proceed-warning'
                        : 'cfm-proceed cfm-proceed-cta';
                const proceedBtn = el('button', { cls: proceedCls, text: t.proceed });
                proceedBtn.addEventListener('click', () => this.resolve(true));
                btnContainer.append(cancelBtn, proceedBtn);
                contentEl.append(btnContainer);
        }

        /**
         * Promise-based API (главный consumer — main.ts). proceed → true,
         * cancel/close → false. Идемпотентен: повторный вызов возвращает
         * ту же Promise; клики после resolve игнорируются.
         */
        waitForResult(): Promise<boolean> {
                if (!this.promise) {
                        this.promise = new Promise<boolean>((r) => {
                                this.resolver = r;
                        });
                        // Гонка: render-клик мог прийти ДО waitForResult — досолвим тут.
                        if (this.resolved && this.resultValue !== null) {
                                const v = this.resultValue;
                                queueMicrotask(() => this.resolver?.(v));
                        }
                }
                return this.promise;
        }

        /**
         * Внешнее закрытие Modal'а (Esc/фон по Modal.onClose в main.ts).
         * Трактуется как cancel (false). Идемпотентно — повторный вызов
         * (например, после proceed-клика, который уже дёрнул onProceed →
         * Modal.close → onClose → view.close) обрывается флагом resolved.
         */
        close(): void {
                this.resolve(false);
        }

        /** Единая точка resolve; идемпотентна. true → onProceed, false → onCancel. */
        private resolve(value: boolean): void {
                if (this.resolved) return;
                this.resolved = true;
                this.resultValue = value;
                if (value) this.deps.onProceed();
                else this.deps.onCancel();
                this.resolver?.(value);
        }
}
