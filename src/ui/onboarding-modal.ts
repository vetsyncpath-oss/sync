// src/ui/onboarding-modal.ts — онбординг первого запуска [W2-T06 / Д8=1].
//
// Канон: решение Д8=1 (онбординг-карусель на первый sync). Главный агент
// ваяет проводку в GitSyncPlugin.onload: триггер = `!settings.migratedV3`
// (первый sync после установки 3.0 — флаг выставляется ПОСЛЕ онбординга,
// чтобы пользователь не застрял в модалке при каждом запуске; повторно
// онбординг не показывается). OnboardingModalView — чистый DOM-слой, main
// создаёт Modal-обёртку, инстанцирует view(deps={manifest,workspaceSyncDefault,
// onChoose→modal.close+apply, onClose→modal.close}), modal.onOpen→view.render,
// modal.onClose→view.close.
//
// ПАТТЕРН: чистый DOM-view в стиле journal-modal.ts (W2-T08) и
// sync-popover.ts (W2-T03): только document.createElement + deps-инъекция,
// obsidian НЕ импортируется ВООБЩЕ — обёрткой-Modal владеет main.ts и зовёт
// view.render()/close() из onOpen/onClose. happy-dom-совместимо.
//
// i18n [правило волны W2]: подписи — синглтон i18n.t.onb (контракт
// OnboardingLabels в src/i18n/types.ts). ВСЕ строки уже в словарях en/ru
// (см. verified worklog W2-T06 — добавлены главным агентом в W2-T01prep);
// module-local TODO(i18n) на сегодня отсутствуют.

import { i18n } from '../i18n';

/** Выбор пользователя в онбординге [W2-T06]: 'full' | 'obsidian' | 'custom'
 *  — выбирает пресет политики; 'cancel' — пропустить (skip), применяется
 *  default-preset='fetch'. main.ts на 'cancel' НЕ запускает sync, только
 *  ставит migratedV3=true (повторно онбординг не появится). */
export type OnboardingChoice = 'full' | 'obsidian' | 'custom' | 'cancel';

/** Манифест источника для карточек онбординга [W2-T06]. Главный агент
 *  собирает из manifest-cache/HEAD-запроса: fileCount — из tree-walk
 *  источника; sizeMb — из totalBytes / 1024 / 1024, форматированное одной
 *  строкой (например, '12.3'); isMobile — Platform.isMobile. НЕ кэшируется:
 *  актуален на момент первого sync (после migratedV3=true больше не нужен). */
export interface OnboardingManifest {
        /** Число файлов в источнике (для cardFull). */
        fileCount: number;
        /** Общий размер, МБ (для cardFull) — уже форматированная строка. */
        sizeMb: string;
        /** Признак мобильного устройства (для mobileWarn). */
        isMobile: boolean;
}

/** Зависимости OnboardingModalView [W2-T06]. main.ts (Modal-обёртка) создаёт
 *  deps и инстанцирует view в modal.onOpen. onChoose/onClose — ТОЛЬКО эти
 *  колбэки, остальные данные — статичные поля. */
export interface OnboardingDeps {
        /** Контейнер модалки (Modal.contentEl обёртки из main.ts). */
        contentEl: HTMLElement;
        /** Манифест источника (fileCount/sizeMb/isMobile). */
        manifest: OnboardingManifest;
        /** Дефолт чекбокса workspace-sync (false = не синхрить интерфейс).
         *  main.ts берёт из settings.workspaceSync (или DEFAULT_SETTINGS). */
        workspaceSyncDefault: boolean;
        /** Выбор пользователя. Зовётся РОВНО ОДИН РАЗ (карточка-клик → 'full'/
         *  'obsidian'/'custom'; confirm → выбранная или 'full' default; cancel →
         *  'cancel'). Флаг chosen внутри view обрывает повторные клики.
         *  main.ts на onChoose: применяет пресет → saveSettings → запускает
         *  sync → modal.close() (последнее триггерит modal.onClose → view.close). */
        onChoose: (choice: OnboardingChoice, workspaceSync: boolean) => void;
        /** Закрытие view — зовётся из modal.onClose (Esc/фон/main-modal.close).
         *  Идемпотентен: флаг closed обрывает рекурсию «view.close → onClose →
         *  modal.close → onClose → view.close», очищает контейнер. */
        onClose: () => void;
}

/** DOM-конструктор без obsidian-расширений (паттерн journal-modal/sync-popover). */
function el<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        opts: { cls?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (opts.cls) node.className = opts.cls;
        if (opts.text !== undefined) node.textContent = opts.text;
        return node;
}

/**
 * Чистый DOM-view онбординга первого запуска [W2-T06 / Д8=1].
 *
 * render() строит полное дерево один раз (на modal.onOpen). Состояние
 * внутри view: selectedChoice (карточка — фидбек подсветки), workspaceSync
 * (текущее значение чекбокса), chosen (флаг «onChoose уже позван» —
 * обрывает повторные клики), closed (флаг «view уже закрыт» — обрывает
 * рекурсию close → onClose → modal.close → onClose).
 *
 * ИНВАРИАНТЫ:
 *  - onChoose зовётся РОВНО ОДИН РАЗ: карточка-клик / confirm / cancel —
 *    любая первая точка выбора ставит chosen=true, все последующие no-op.
 *  - close() идемпотентен: onClose зовётся РОВНО ОДИН РАЗ (флаг closed).
 *  - confirm без выбора карточки → 'full' (default, спека §4.4 Д8=1).
 *  - после close() любые клики — no-op (closed flag в точках выбора).
 *
 * СЕКЦИИ (спека §4.4, 7 штук):
 *   1. Заголовок: h2 title + .onb-subtitle.
 *   2. Три карточки (.onb-cards): cardFull (с fileCount/sizeMb)/cardObsidian/
 *      cardCustom; клик → onChoose(choice, workspaceSync); подсветка
 *      выбранной (cls .onb-card-selected).
 *   3. Workspace-чекбокс: i18n.t.onb.workspaceSync + workspaceSyncDesc;
 *      дефолт = deps.workspaceSyncDefault; change → обновляет workspaceSync.
 *   4. Mobile-предупреждение (if manifest.isMobile): .onb-mobile-warn
 *      (warning callout) — на мобильных архивы большого размера отклоняются.
 *   5. Hint уровень: .onb-level-hint (muted) — fetch по умолчанию.
 *   6. Change-later подпись: .onb-change-later (muted).
 *   7. Footer: .onb-btn-cancel + .onb-btn-confirm (.onb-btn-cta).
 */
export class OnboardingModalView {
        private readonly deps: OnboardingDeps;
        /** Выбранная карточка (для подсветки и confirm-расчёта default='full').
         *  null = карточка ещё не кликнута → confirm даст 'full'. */
        private selectedChoice: OnboardingChoice | null = null;
        /** Текущее состояние чекбокса workspace-sync. Обновляется change
         *  listener'ом; onChoose читает это поле (НЕ deps.workspaceSyncDefault). */
        private workspaceSync: boolean;
        /** Флаг «onChoose уже позван» — обрывает повторные клики (карточка после
         *  карточки, confirm после cancel и т.д.). */
        private chosen = false;
        /** Флаг «view уже закрыт» — обрывает рекурсию close→onClose→modal.close
         *  →onClose→view.close; после close() точки выбора тоже no-op. */
        private closed = false;

        constructor(deps: OnboardingDeps) {
                this.deps = deps;
                this.workspaceSync = deps.workspaceSyncDefault;
        }

        render(): void {
                const { contentEl } = this.deps;
                const t = i18n.t.onb;
                contentEl.replaceChildren();
                contentEl.classList.add('onb-modal');

                // 1. Заголовок: h2 + subtitle.
                const header = el('div', { cls: 'onb-header' });
                header.append(el('h2', { text: t.title }));
                header.append(el('p', { cls: 'onb-subtitle', text: t.subtitle }));
                contentEl.append(header);

                // 2. Три карточки — клик выбирает и сразу зовёт onChoose.
                // [P1/M18] fileCount=0/sizeMb='?' (манифест ещё не известен на
                // первый запуск) → честная подпись cardFullUnknown вместо
                // заглушки «0 files, ? MB».
                const cards = el('div', { cls: 'onb-cards' });
                const fullTitle = this.deps.manifest.fileCount > 0 && this.deps.manifest.sizeMb !== '?'
                        ? t.cardFull(this.deps.manifest.fileCount, this.deps.manifest.sizeMb)
                        : t.cardFullUnknown;
                cards.append(this.renderCard(
                        'full',
                        'onb-card onb-card-full',
                        fullTitle,
                        t.cardFullDesc,
                ));
                cards.append(this.renderCard(
                        'obsidian',
                        'onb-card onb-card-obsidian',
                        t.cardObsidian,
                        t.cardObsidianDesc,
                ));
                cards.append(this.renderCard(
                        'custom',
                        'onb-card onb-card-custom',
                        t.cardCustom,
                        t.cardCustomDesc,
                ));
                contentEl.append(cards);

                // 3. Workspace-чекбокс (между карточками и кнопками).
                contentEl.append(this.renderWorkspace());

                // 4. Mobile-предупреждение — ТОЛЬКО при manifest.isMobile.
                if (this.deps.manifest.isMobile) {
                        contentEl.append(el('div', { cls: 'onb-mobile-warn', text: t.mobileWarn }));
                }

                // 5. Hint уровень (muted).
                contentEl.append(el('div', { cls: 'onb-level-hint', text: t.levelHint }));

                // 6. Change-later подпись (muted).
                contentEl.append(el('div', { cls: 'onb-change-later', text: t.changeLater }));

                // 7. Footer: cancel + confirm (CTA).
                contentEl.append(this.renderFooter());
        }

        /** Закрытие view: идемпотентно (флаг closed), очищает контейнер и ровно
         *  один раз зовёт deps.onClose(). Рекурсия «view.close → onClose →
         *  modal.close → onClose → view.close» обрывается флагом. После close()
         *  любые клики по карточкам/кнопкам — no-op (closed гвард в choose()). */
        close(): void {
                if (this.closed) return;
                this.closed = true;
                this.deps.contentEl.replaceChildren();
                this.deps.onClose();
        }

        // ── private render ──

        /** Карточка пресета: title + desc; role=button/tabindex=0 для a11y;
         *  клик → choose(choice). Подсветка selected ставится через cls
         *  onb-card-selected (на случай, если selectedChoice уже выставлен до
         *  перерисовки — например, после re-render). */
        private renderCard(
                choice: OnboardingChoice,
                cls: string,
                title: string,
                desc: string,
        ): HTMLElement {
                const card = el('div', { cls });
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');
                card.append(el('div', { cls: 'onb-card-title', text: title }));
                card.append(el('div', { cls: 'onb-card-desc', text: desc }));
                if (this.selectedChoice === choice) {
                        card.classList.add('onb-card-selected');
                }
                card.addEventListener('click', () => this.choose(choice));
                return card;
        }

        /** Workspace-чекбокс: label с input[type=checkbox] + текст workspaceSync
         *  + desc. checked = this.workspaceSync (дефолт = deps.workspaceSyncDefault).
         *  change → обновляет this.workspaceSync; onChoose читает актуальное. */
        private renderWorkspace(): HTMLElement {
                const t = i18n.t.onb;
                const wrap = el('div', { cls: 'onb-workspace' });
                const label = el('label', { cls: 'onb-workspace-label' });
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'onb-workspace-cb';
                cb.checked = this.workspaceSync;
                cb.addEventListener('change', () => {
                        this.workspaceSync = cb.checked;
                });
                label.append(cb);
                label.append(el('span', { cls: 'onb-workspace-text', text: t.workspaceSync }));
                wrap.append(label);
                wrap.append(el('div', { cls: 'onb-workspace-desc', text: t.workspaceSyncDesc }));
                return wrap;
        }

        /** Footer: cancel (без warning) + confirm (CTA). cancel → choose('cancel');
         *  confirm → choose(selectedChoice ?? 'full') (default 'full'). */
        private renderFooter(): HTMLElement {
                const t = i18n.t.onb;
                const footer = el('div', { cls: 'onb-footer' });

                const cancel = el('button', { cls: 'onb-btn onb-btn-cancel', text: t.cancel });
                cancel.addEventListener('click', () => this.choose('cancel'));
                footer.append(cancel);

                const confirm = el('button', { cls: 'onb-btn onb-btn-confirm onb-btn-cta', text: t.confirm });
                confirm.addEventListener('click', () => this.choose(this.selectedChoice ?? 'full'));
                footer.append(confirm);

                return footer;
        }

        /** Точка выбора: ставит флаг chosen, обновляет подсветку карточки
         *  (визуальный фидбек перед закрытием модалки), зовёт onChoose ровно
         *  один раз. close() НЕ зовёт — modal.onClose (main.ts wrapper) это
         *  сделает, что обрывает рекурсию (onChoose → modal.close → onClose →
         *  view.close → onClose — но onClose позван один раз из-за флага closed). */
        private choose(choice: OnboardingChoice): void {
                if (this.chosen || this.closed) return;
                this.chosen = true;
                this.selectedChoice = choice;
                this.highlightCard(choice);
                this.deps.onChoose(choice, this.workspaceSync);
        }

        /** Подсветка выбранной карточки: убирает onb-card-selected со всех,
         *  ставит на совпавшую по cls `onb-card-<choice>`. */
        private highlightCard(choice: OnboardingChoice): void {
                const cards = this.deps.contentEl.querySelectorAll('.onb-card');
                cards.forEach((node) => {
                        const cardEl = node as HTMLElement;
                        const isSel = cardEl.classList.contains(`onb-card-${choice}`);
                        cardEl.classList.toggle('onb-card-selected', isSel);
                });
        }
}
