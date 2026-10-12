import { WORKSPACE_CSS } from './sync-workspace-styles';
// src/ui/styles.ts — рантайм-инъекция CSS плагина (Phase 4.1).
//
// ПРОБЛЕМА: styles.css грузится Obsidian'ом как ОТДЕЛЬНЫЙ файл папки плагина.
// Если пользователь обновил только main.js (частая практика), vts-* стили
// пропадают — кнопки наезжают, вкладки теряют вид.
//
// РЕШЕНИЕ: полный набор стилей плагина зашит в бандл константой и вводится
// <style id="cloud-vault-sync-injected"> при загрузке плагина (idempotent:
// при наличии рядом styles.css правила идентичны, дубликат безвреден).
// styles.css сохраняется для стандартных установок (Obsidian грузит его сам).
//
// [UI-POLISH 3.3] Переработка читаемости всех пользовательских поверхностей
// (жалоба: «многие modals имеют сложноусваиваемый формат»):
//   1. ЕДИНЫЙ ЯЗЫК БЕЙДЖЕЙ: pop-status / pop-chip / pop-outcome / jrnl-outcome
//      — inline-flex + padding + radius + фон варианта (раньше только цвет
//      текста, бейджи не читались как статусы).
//   2. CONFIRM-MODAL: секции — карточка (secondary-фон, рамка, отступы),
//      строки с межстрочным воздухом и hover; danger/norecovery — левый
//      красный борт; CTA/warning-кнопки залиты цветом.
//   3. JOURNAL: строки карточками с hover, время — моно, outcome — бейдж
//      с фоном, легенда колонок — uppercase-cap; summary — клик-стиль.
//   4. ONBOARDING: карточки 1px-рамка + радиус 8 + focus-visible (a11y,
//      tabindex=0 уже был), выбранная — двойная рамка (box-shadow-ринг);
//      CTA-кнопка залита.
//   5. НОВЫЕ ПРАВИЛА для классов без стилей: .pop-status (бейдж статуса
//      popover — раньше стили были только у мёртвого .pop-status-badge),
//      .vts-multi-btn (кнопка мультивыбора), .git-sync-chip-outcome (база),
//      .onb-workspace-cb (accent-color чекбокса), .git-sync-token-toggle
//      hover, стили <p>/<code> для yes/no- и конфликт-модалок
//      (git-sync-confirm-message), .vts-confirm-modal p.
//   6. УДАЛЕН МЁРТВЫЙ CSS (25 правил, код их не использует — см. некролог
//      внизу файла); контракты tests/styles-coverage.test.ts сохранены:
//      .pop-popover position:relative первым свойством, .pop-header
//      padding-right, .cfm-buttons flex+gap, .onb-footer flex, .vts-row
//      height:26px (= ROW_HEIGHT_PX), .pop-phase — подписанная пилюля
//      (::before-точка 8px, не width на самом элементе).
//
// Правка ЭТОГО файла — единственный источник: styles.css регенерируется
// scripts/gen-styles-css.mjs (npm run gen:styles / входит в npm run build).

/** Все стили плагина (дубликат styles.css). Инъекция — injectPluginCss(). */
export const PLUGIN_CSS = `/* ============================================================
   Cloud Vault Sync — стили плагина
   [UI-POLISH 3.3] единый язык бейджей + читаемые модалки.
   Токены: только переменные Obsidian var(--*), без хардкодов.
   ============================================================ */

/* --- Статус-бар --- */
.git-sync-status {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.git-sync-status .git-sync-icon {
    font-size: 0.9em;
}

.git-sync-status.syncing       { color: var(--text-accent); }
.git-sync-status.error         { color: var(--text-error); }
.git-sync-status.conflicts     { color: var(--text-warning); }
.git-sync-status.offline       { color: var(--text-faint); }
.git-sync-status.unconfigured  { color: var(--text-warning); }
.git-sync-status.idle          { color: var(--text-success); }

.git-sync-text { white-space: nowrap; }

/* [W2-T02] Чип уровня зеркала в статус-баре (Д13=1) */
.git-sync-mirror-chip { font-size: 0.85em; padding: 1px 6px; border-radius: 3px; margin-left: 4px; font-weight: 600; }
.git-sync-mirror-chip.mirror-fetch { color: var(--text-muted); background: var(--background-modifier-hover); }
.git-sync-mirror-chip.mirror-light { color: var(--text-warning); background: var(--background-modifier-warning); }
.git-sync-mirror-chip.mirror-full  { color: var(--text-error); background: var(--background-modifier-error); }

/* ============================================================
   [W2-T04] Confirm-modal (cfm) — подтверждение sync/force/retry/scan.
   [UI-POLISH] секции — карточка; строки дышат; опасное — с бортом.
   ============================================================ */

.cfm-modal { padding: 2px 0; }
.cfm-title { margin: 0 0 2px; font-size: 1.35em; }
.cfm-engine {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 0.9em;
    margin: 2px 0 10px;
    padding: 2px 10px;
    border-radius: 4px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
}

.cfm-sections {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 8px 0;
    padding: 10px 12px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
}
.cfm-sec { padding: 5px 8px; border-radius: 4px; line-height: 1.45; }
.cfm-sec:hover { background: var(--background-modifier-hover); }
.cfm-sec-download, .cfm-sec-update, .cfm-sec-new, .cfm-sec-restore { color: var(--text-normal); }
.cfm-sec-delete-light { color: var(--text-warning); }
.cfm-sec-delete-full  { color: var(--text-error); font-weight: 600; }
.cfm-sec-overwrite, .cfm-sec-orphan { color: var(--text-warning); }

.cfm-bytes { color: var(--text-muted); font-size: 0.9em; padding: 0 8px 4px; }

.cfm-paths { margin: 10px 0 2px; }
.cfm-paths-title { font-weight: 600; margin-bottom: 2px; }
.cfm-paths-list { margin: 4px 0; padding: 6px 8px 6px 1.4em; max-height: 180px; overflow-y: auto; background: var(--background-secondary); border-radius: 4px; }
.cfm-paths-list li { font-family: var(--font-monospace); font-size: 0.85em; color: var(--text-muted); margin: 2px 0; word-break: break-all; }
.cfm-paths-more { color: var(--text-faint); font-style: italic; font-size: 0.85em; margin-top: 4px; }

.cfm-danger {
    background: var(--background-modifier-error);
    border-left: 3px solid var(--text-error);
    padding: 8px 10px;
    border-radius: 4px;
    margin: 10px 0 4px;
    color: var(--text-error);
}
.cfm-norecovery {
    background: var(--background-modifier-error);
    border-left: 3px solid var(--text-error);
    padding: 8px 10px;
    border-radius: 4px;
    margin: 4px 0;
    color: var(--text-error);
    font-weight: 600;
}

.cfm-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
.cfm-cancel { white-space: nowrap; }
.cfm-proceed { white-space: nowrap; }
.cfm-proceed-cta { background: var(--interactive-accent); color: var(--text-on-accent); box-shadow: 0 1px 2px var(--background-modifier-box-shadow); }
.cfm-proceed-cta:hover { background: var(--interactive-accent-hover); }
.cfm-proceed-warning { color: var(--text-error) !important; border-color: var(--text-error) !important; background: var(--background-modifier-error); font-weight: 600; }

/* ============================================================
   [W2-T08] Journal-modal (jrnl) — журнал сессий.
   [UI-POLISH] строки-карточки с hover, outcome — бейдж с фоном,
   время — моно, легенда — uppercase, summary — клик-стиль.
   ============================================================ */

.jrnl-modal { padding: 2px 0; }
.jrnl-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.jrnl-header h2 { margin: 0; }
.jrnl-close {
    cursor: pointer;
    background: none;
    border: none;
    box-shadow: none;
    height: auto;
    padding: 2px 8px;
    font-size: 1em;
    line-height: 1.2;
    opacity: 0.6;
    border-radius: 4px;
}
.jrnl-close:hover { opacity: 1; background: var(--background-modifier-hover); }

.jrnl-cols {
    color: var(--text-faint);
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--background-modifier-border);
    padding: 6px 4px;
    margin-top: 8px;
}
.jrnl-list { max-height: 50vh; overflow-y: auto; }
.jrnl-row { padding: 8px 6px; border-radius: 4px; }
.jrnl-row:hover { background: var(--background-modifier-hover); }
.jrnl-row + .jrnl-row { border-top: 1px solid var(--background-modifier-border); }
.jrnl-row-main { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; row-gap: 2px; }
.jrnl-when { color: var(--text-muted); font-size: 0.85em; font-family: var(--font-monospace); white-space: nowrap; }
.jrnl-outcome {
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: 4px;
    font-weight: 500;
    font-size: 0.85em;
    white-space: nowrap;
}
.j-outcome-ok { color: var(--text-success, var(--text-accent)); background: var(--background-modifier-success, var(--background-modifier-hover)); }
.j-outcome-cancelled { color: var(--text-muted); background: var(--background-modifier-hover); }
.j-outcome-error { color: var(--text-error); background: var(--background-modifier-error); }
.jrnl-duration, .jrnl-engine, .jrnl-trigger { color: var(--text-muted); font-size: 0.85em; white-space: nowrap; }
.jrnl-level { color: var(--text-muted); font-size: 0.85em; white-space: nowrap; }
.jrnl-stats { color: var(--text-muted); font-size: 0.85em; margin-top: 3px; }
.jrnl-errors { margin-top: 4px; font-size: 0.85em; }
.jrnl-errors summary { cursor: pointer; color: var(--text-muted); padding: 2px 0; border-radius: 4px; }
.jrnl-errors summary:hover { color: var(--text-normal); }
.jrnl-errors-list { margin: 2px 0 4px; padding-left: 1.4em; color: var(--text-error); }
.jrnl-empty { color: var(--text-muted); font-style: italic; padding: 24px; text-align: center; }

/* ============================================================
   [W2-T06] Onboarding-modal (onb) — первый запуск.
   [UI-POLISH] карточки: 1px-рамка, радиус 8, focus-visible-ринг
   (tabindex=0 уже был — фокус теперь виден), выбранная — ринг.
   ============================================================ */

.onb-modal { padding: 2px 0; }
.onb-header h2 { margin: 0 0 4px; }
.onb-subtitle { color: var(--text-muted); margin: 0 0 14px; }
.onb-cards { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
.onb-card {
    padding: 12px 14px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.onb-card:hover { border-color: var(--text-accent); background: var(--background-modifier-hover); }
.onb-card:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 2px; }
.onb-card-selected {
    border-color: var(--text-accent);
    background: var(--background-modifier-active);
    box-shadow: 0 0 0 1px var(--interactive-accent);
}
.onb-card-full     { border-left: 3px solid var(--text-accent); }
.onb-card-obsidian { border-left: 3px solid var(--text-success, var(--text-accent)); }
.onb-card-custom   { border-left: 3px solid var(--text-warning); }
.onb-card-title { font-weight: 600; font-size: 1.05em; }
.onb-card-desc { color: var(--text-muted); font-size: 0.9em; margin-top: 2px; }

.onb-workspace { margin: 12px 0; }
.onb-workspace-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.onb-workspace-cb { accent-color: var(--interactive-accent); width: 16px; height: 16px; }
.onb-workspace-text { font-weight: 500; }
.onb-workspace-desc { color: var(--text-muted); font-size: 0.85em; margin-top: 2px; }

.onb-mobile-warn {
    background: var(--background-modifier-warning);
    border-left: 3px solid var(--text-warning);
    padding: 8px 10px;
    border-radius: 4px;
    color: var(--text-warning);
    font-size: 0.9em;
    margin: 8px 0;
}
.onb-level-hint, .onb-change-later { color: var(--text-faint); font-size: 0.85em; margin: 8px 0 0; }

.onb-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; flex-wrap: wrap; }
.onb-btn, .onb-btn-cancel, .onb-btn-confirm { white-space: nowrap; }
.onb-btn-cta { background: var(--interactive-accent); color: var(--text-on-accent); }
.onb-btn-cta:hover { background: var(--interactive-accent-hover); }

/* ============================================================
   [W2-T03] Popover «штаб синхронизации» (pop).
   [P1/M14] .pop-popover — позиционированный предок для .pop-close
   (absolute-кнопка раньше улетала в угол окна).
   [UI-POLISH] .pop-status — НОВОЕ правило: бейдж статуса (раньше стили
   были только у мёртвого .pop-status-badge — статус рендерился голым
   текстом). .pop-chip/.pop-outcome — тоже бейджи с фоном.
   ============================================================ */

.pop-popover { position: relative; min-width: 320px; max-width: 440px; padding: 4px 2px; }
.pop-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding-right: 40px; flex-wrap: wrap; }
.pop-header h2 { margin: 0; font-size: 1.25em; }

/* Единый бейдж-примитив статусов (см. шапку файла). */
.pop-status, .pop-chip, .pop-outcome {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
    font-size: 0.85em;
    white-space: nowrap;
}
.pop-status { background: var(--background-secondary); }
.pop-status-syncing { color: var(--text-accent); background: var(--background-modifier-hover); }
.pop-status-idle { color: var(--text-muted); }
.pop-status-error, .pop-status-conflicts, .pop-status-offline { color: var(--text-error); background: var(--background-modifier-error); }
.pop-status-unconfigured { color: var(--text-warning); background: var(--background-modifier-warning); }

.pop-chip { font-weight: 600; background: var(--background-modifier-hover); }
.pop-chip-fetch { color: var(--text-muted); }
.pop-chip-light { color: var(--text-warning); background: var(--background-modifier-warning); }
.pop-chip-full  { color: var(--text-error); background: var(--background-modifier-error); }

/* [P1/M14] Кнопка закрытия: нейтрализуем браузерный/obsidian-хром. */
.pop-close { position: absolute; top: 6px; right: 6px; cursor: pointer; opacity: 0.6; background: none; border: none; box-shadow: none; height: auto; padding: 2px 8px; font-size: 1em; line-height: 1.2; z-index: 2; border-radius: 4px; }
.pop-close:hover { opacity: 1; background: var(--background-modifier-hover); }

.pop-progress { margin: 8px 0; }
/* [P1/M14] Фазы конвейера: ПОДПИСАННЫЕ пилюли с точкой (::before). */
.pop-phases { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0; }
.pop-phase { display: inline-flex; align-items: center; gap: 4px; font-size: 0.8em; color: var(--text-muted); white-space: nowrap; }
.pop-phase::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--background-modifier-border); flex: none; }
.pop-phase-done { opacity: 0.75; }
.pop-phase-done::before { background: var(--text-success, var(--text-accent)); }
.pop-phase-current { color: var(--text-normal); font-weight: 500; }
.pop-phase-current::before { background: var(--text-accent); transform: scale(1.25); }
.pop-phase-pending { opacity: 0.4; }

.pop-file-progress, .pop-current-path, .pop-bytes-progress { color: var(--text-muted); font-size: 0.9em; margin-top: 4px; }
.pop-current-path { font-family: var(--font-monospace); font-size: 0.8em; word-break: break-all; }
.pop-progress-sub { margin-top: 4px; }

.pop-actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }
.pop-actions button { padding: 6px 14px; border-radius: 4px; }
.pop-action, .pop-action-sync, .pop-action-retry { white-space: nowrap; }
.pop-action-danger { color: var(--text-error); border-color: var(--text-error); background: var(--background-modifier-error); }
.pop-action-muted { color: var(--text-muted); }

.pop-scheduler { margin: 6px 0; }
.pop-scheduler-state { color: var(--text-muted); font-size: 0.9em; }
.pop-scheduler-next { color: var(--text-accent); }
.pop-scheduler-paused { color: var(--text-warning); }

.pop-last-session { border-top: 1px solid var(--background-modifier-border); padding-top: 8px; margin-top: 8px; }
.pop-section-title { font-weight: 600; margin-bottom: 4px; }
.pop-last-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; row-gap: 2px; }
.pop-when { color: var(--text-muted); font-size: 0.85em; font-family: var(--font-monospace); white-space: nowrap; }
.pop-outcome-ok { color: var(--text-success, var(--text-accent)); background: var(--background-modifier-success, var(--background-modifier-hover)); }
.pop-outcome-cancelled { color: var(--text-muted); background: var(--background-modifier-hover); }
.pop-outcome-error { color: var(--text-error); background: var(--background-modifier-error); }
.pop-duration, .pop-engine, .pop-trigger { color: var(--text-muted); font-size: 0.85em; white-space: nowrap; }
.pop-level { color: var(--text-muted); font-size: 0.85em; white-space: nowrap; }
.pop-stats { color: var(--text-muted); font-size: 0.85em; margin-top: 2px; }
.pop-errors { background: var(--background-modifier-error); padding: 6px 8px; border-radius: 4px; margin: 8px 0; }
.pop-errors summary { cursor: pointer; }
.pop-errors-list { margin: 2px 0; padding-left: 1.4em; color: var(--text-error); font-size: 0.85em; }
.pop-no-session { color: var(--text-muted); font-style: italic; }
.pop-conflicts {
    background: var(--background-modifier-warning);
    border-left: 3px solid var(--text-warning);
    padding: 8px 10px;
    border-radius: 4px;
    margin: 8px 0;
}
.pop-conflicts-hint { color: var(--text-muted); font-size: 0.85em; }

/* Ссылки-кнопки внизу popover — лёгкие текстовые ссылки. */
.pop-links { display: flex; gap: 12px; margin-top: 12px; border-top: 1px solid var(--background-modifier-border); padding-top: 8px; }
.pop-link { background: none; border: none; box-shadow: none; height: auto; padding: 2px 4px; cursor: pointer; color: var(--text-accent); }
.pop-link:hover { text-decoration: underline; }
.pop-link-journal, .pop-link-settings { color: var(--text-accent); cursor: pointer; }

/* ============================================================
   [POLICY Phase 3 / W2-T07] Vault Tree Sync (vts) — модалка
   структуры-политики. [P1/M20] высота строки = ROW_HEIGHT_PX (26):
   без неё spacer'ы расходились с деревом, скролл «дёргался».
   [UI-POLISH] табы/фильтры/кнопки — hover + focus-visible.
   ============================================================ */

.vts-modal { display: flex; flex-direction: column; height: 70vh; }
.vts-modal > h2 { margin: 0 0 6px; }
.vts-header { display: flex; flex-direction: column; gap: 8px; padding: 0 0 8px; border-bottom: 1px solid var(--background-modifier-border); }
.vts-header-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; row-gap: 6px; }
.vts-preset { max-width: 220px; min-width: 140px; }

.vts-tabbar { display: flex; gap: 2px; margin-top: 8px; border-bottom: 1px solid var(--background-modifier-border); }
.vts-tab { padding: 6px 14px; border: none; border-bottom: 2px solid transparent; background: none; cursor: pointer; color: var(--text-muted); font-weight: 500; border-radius: 4px 4px 0 0; }
.vts-tab:hover { color: var(--text-normal); background: var(--background-modifier-hover); }
.vts-tab:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
.vts-tab.vts-tab-active { color: var(--text-normal); border-bottom-color: var(--interactive-accent); }

.vts-filterbar { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; padding: 6px 0; row-gap: 4px; }
.vts-filter { padding: 2px 10px; border-radius: 10px; border: 1px solid var(--background-modifier-border); background: none; cursor: pointer; color: var(--text-muted); font-size: 0.85em; white-space: nowrap; flex: none; }
.vts-filter:hover { border-color: var(--interactive-accent); color: var(--text-normal); }
.vts-filter:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 1px; }
.vts-filter.vts-filter-active { background: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent); }
.vts-expand-btn { font-size: 1em; line-height: 1; padding: 2px 8px; }
/* [UI-POLISH] Кнопка мультивыбора (A2): пунктирная рамка отличает её
   от статусных фильтров; активная — сплошная. Раньше класс был без CSS. */
.vts-multi-btn { border-style: dashed; }
.vts-multi-btn.vts-filter-active { border-style: solid; }
.vts-search { margin-left: auto; min-width: 140px; max-width: 220px; }

.vts-tree-wrap { flex: 1 1 auto; overflow: auto; border: 1px solid var(--background-modifier-border); border-radius: 4px; }
.vts-tree { list-style: none; padding: 4px 0; margin: 0; }
.vts-spacer { width: 100%; }

.vts-row { display: flex; align-items: center; gap: 6px; padding: 0 8px; height: 26px; line-height: 1; cursor: default; user-select: none; }
.vts-row:hover { background: var(--background-modifier-hover); }
.vts-row.vts-selected { background: var(--background-modifier-active); }
.vts-row.vts-state-excluded > .vts-label { text-decoration: line-through; color: var(--text-faint); }

.vts-twisty { display: inline-block; width: 1em; cursor: pointer; text-align: center; flex: none; }
.vts-twisty.vts-leaf { visibility: hidden; }
.vts-checkbox { margin: 0; cursor: pointer; flex: none; }
.vts-icon { flex: none; line-height: 1; }
.vts-icon-folder, .vts-icon-file { flex: none; }
.vts-icon-folder { opacity: 0.85; }
.vts-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vts-row .vts-label { flex: 0 1 auto; min-width: 80px; }
.vts-rename-hint { color: var(--text-accent); font-size: 0.85em; margin-left: 6px; white-space: nowrap; }

/* Цветовые статусы: НАДПИСИ цветом, без глифов-точек/ромбов. */
.vts-st { font-size: 0.85em; white-space: nowrap; }
.vts-c-ok { color: var(--text-success); }
.vts-c-warn { color: var(--text-warning); }
.vts-c-accent { color: var(--text-accent); }
.vts-c-danger { color: var(--text-error); font-weight: 600; }
.vts-c-faint { color: var(--text-faint); }
.vts-c-sep { color: var(--text-faint); font-size: 0.85em; }

.vts-row-status { margin-left: auto; display: inline-flex; gap: 6px; align-items: baseline; }
.vts-folder-status { margin-left: auto; display: inline-flex; gap: 0; align-items: baseline; font-size: 0.85em; }

/* [W2-T07] Бейджи уровней (Е3): ⚡/⚡⚡ на custom-папках. */
.vts-badge { font-size: 0.8em; padding: 0 4px; margin-left: 4px; border-radius: 3px; font-weight: 600; }
.vts-badge-light { color: var(--text-warning); background: var(--background-modifier-warning); }
.vts-badge-full  { color: var(--text-error); background: var(--background-modifier-error); }
.vts-row-menu-btn { font-size: 1.1em; padding: 0 6px; opacity: 0.5; cursor: pointer; background: none; border: none; }
.vts-row-menu-btn:hover { opacity: 1; }
.vts-multi-count { color: var(--text-accent); font-weight: 600; margin-left: 8px; }

.vts-empty { padding: 16px; text-align: center; color: var(--text-muted); }
.vts-error-msg { color: var(--text-error); }
.vts-loading { padding: 24px; text-align: center; color: var(--text-muted); }

/* [Phase 4.1] Футер модалки (Save/Close внизу). */
.vts-footer { display: flex; align-items: center; gap: 8px; padding: 8px 0 0; border-top: 1px solid var(--background-modifier-border); flex-wrap: wrap; }
.vts-footer-status { flex: 1 1 200px; font-size: 0.85em; color: var(--text-muted); }
.vts-footer-level { color: var(--text-muted); font-size: 0.9em; margin-top: 8px; }
.vts-footer-btns { display: flex; gap: 6px; flex: none; }
.vts-footer-btns .vts-btn { min-width: 84px; }
.vts-read-only .vts-checkbox, .vts-read-only .vts-btn { opacity: 0.6; }

/* [overhaul v4 / Этап 2] File exclusions panel */
.vts-file-exclusions { margin: 8px 0 4px; padding: 8px 10px; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-secondary); }
.vts-file-exclusions h4 { margin: 0 0 6px 0; font-size: 0.95em; }
.vts-exclusion-list { list-style: none; padding: 0; margin: 6px 0; }
.vts-exclusion-list .vts-exclusion-item { display: flex; align-items: center; gap: 6px; padding: 3px 0; flex-wrap: wrap; }
.vts-exclusion-list .vts-exclusion-item code { background: var(--background-modifier-hover); padding: 1px 6px; border-radius: 3px; font-size: 0.9em; }
.vts-exclusion-scope { color: var(--text-muted); font-size: 0.85em; }
.vts-exclusion-remove { background: transparent; border: none; cursor: pointer; color: var(--text-error); font-size: 16px; line-height: 1; padding: 0 4px; }
.vts-exclusion-remove:hover { color: var(--text-error); text-shadow: 0 0 4px var(--text-error); }
.vts-exclusion-form { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.vts-exclusion-input { flex: 1 1 200px; min-width: 120px; padding: 4px 8px; border: 1px solid var(--background-modifier-border); border-radius: 3px; background: var(--background-primary); color: var(--text-normal); }
.vts-exclusion-input:focus { border-color: var(--interactive-accent); outline: none; }
.vts-exclusion-add { white-space: nowrap; }
.vts-exclusion-presets { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.vts-preset-btn { font-size: 0.8em; padding: 2px 8px; background: var(--background-modifier-hover); border: 1px solid var(--background-modifier-border); border-radius: 3px; cursor: pointer; }
.vts-preset-btn:hover { background: var(--background-modifier-active); border-color: var(--interactive-accent); }

.vts-btn { cursor: pointer; white-space: nowrap; padding: 4px 12px; border-radius: 4px; }
.vts-btn:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 1px; }
.vts-btn-cta { background: var(--interactive-accent); color: var(--text-on-accent); }
.vts-btn-cta:hover { background: var(--interactive-accent-hover); }
.vts-btn-warning { color: var(--text-warning); }

/* --- [Phase 5] Specific-sync sub-модалка (переименовать/переместить) --- */
.vts-specific-modal { padding: 12px; min-width: 420px; }
.vts-specific-modal h3 { margin-top: 0; }
.vts-specific-modal > p { color: var(--text-muted); margin: 6px 0 10px; line-height: 1.45; word-break: break-all; }
.vts-specific-current { display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 8px; background: var(--background-secondary); border-radius: 4px; }
.vts-specific-section { padding: 8px 0; border-top: 1px solid var(--background-modifier-border); }
.vts-specific-section h4 { margin: 0 0 6px; }
.vts-specific-section .vts-btn { margin-top: 4px; }

/* --- Выбор папки (FolderPickerModal) --- */
.vts-folder-picker { padding: 12px; min-width: 400px; }
.vts-folder-picker h3 { margin-top: 0; }
.vts-picker-search { width: 100%; margin: 6px 0; }
.vts-picker-list { max-height: 320px; overflow: auto; border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 2px 0; }
.vts-picker-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px; cursor: pointer; }
.vts-picker-row:hover { background: var(--background-modifier-hover); }
.vts-select-btn { font-weight: 500; }
.vts-files-btn { font-weight: 500; }

/* --- Rename-инпут/фидбек/кнопки (общие для sub-модалок vts) --- */
.vts-rename-input { width: 100%; margin-bottom: 8px; }
.vts-rename-feedback { min-height: 1.2em; font-size: 0.9em; margin-bottom: 8px; }
.vts-rename-feedback.vts-ok { color: var(--text-success); }
.vts-rename-feedback.vts-error { color: var(--text-error); }
.vts-rename-btns { display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px; }

/* --- [W2-T07 / F10] Unsaved-confirm (контейнер-маркер) --- */
.vts-confirm-modal { padding: 4px 0; }
.vts-confirm-modal h3 { margin-top: 0; }
.vts-confirm-modal p { color: var(--text-muted); margin: 8px 0 12px; line-height: 1.45; }

/* Мобильные: горизонтальный скролл дерева, компактнее. */
@media (max-width: 600px) {
    .vts-modal { height: min(70vh, 600px); }
    .vts-row { display: inline-flex; min-width: max-content; }
    .pop-popover { min-width: 0; max-width: none; }
    .jrnl-row-main { gap: 6px; }
    .vts-specific-modal, .vts-folder-picker { min-width: 0; }
}

/* ============================================================
   Настройки: Диагностика (чипы) + failed-список + yes/no- и
   конфликт-модалки (git-sync-confirm-message).
   ============================================================ */

.git-sync-diag-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
.git-sync-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 0.9em; background: var(--background-modifier-hover); cursor: default; }
/* [UI-POLISH] база outcome-чипа — раньше вариантные правила давали только
   цвет, базовый класс был без CSS. */
.git-sync-chip-outcome { color: var(--text-muted); }
.git-sync-chip-outcome-ok { color: var(--text-success, var(--text-accent)); background: var(--background-modifier-success, var(--background-modifier-hover)); }
.git-sync-chip-outcome-cancelled { color: var(--text-muted); }
.git-sync-chip-outcome-error { color: var(--text-error); background: var(--background-modifier-error); }
.git-sync-chip-errors.mod-warning, .git-sync-chip-conflicts.mod-warning, .git-sync-chip-failed.mod-warning { color: var(--text-warning); background: var(--background-modifier-warning); }
.git-sync-chip-errors.mod-warning { cursor: pointer; }
.git-sync-chip-governance.mod-warning { color: var(--text-warning); background: var(--background-modifier-warning); }
.git-sync-chip-governance.mod-success { color: var(--text-success, var(--text-accent)); }
.git-sync-failed-panel { margin: 8px 0; padding: 8px 12px; }

/* [UI-POLISH] Yes/no-модалка (governance reset) и конфликт-резолвер:
   абзацы дышат, путь-код — в боксе (secondary-фон, перенос), а не голый
   code в потоке текста. */
.git-sync-confirm-message p { margin: 8px 0; line-height: 1.5; }
.git-sync-confirm-message p.mod-warning { color: var(--text-warning); }
.git-sync-confirm-message code {
    display: inline-block;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.9em;
    word-break: break-all;
    max-width: 100%;
}
.git-sync-confirm-message ul { margin: 0.5em 0; padding-left: 1.5em; }
.git-sync-confirm-message .modal-button-container { margin-top: 12px; }

/* Список неудачных файлов (настройки). */
.git-sync-failed-list { max-height: 220px; overflow-y: auto; font-size: 0.85em; margin: 0.5em 0; padding-left: 1.2em; }
.git-sync-failed-list li { margin-bottom: 2px; }

/* Кнопка показа токена. */
.git-sync-token-toggle { background: none; border: none; box-shadow: none; padding: 2px 4px; height: auto; cursor: pointer; }
.git-sync-token-toggle:hover { background: var(--background-modifier-hover); border-radius: 4px; }

/* ============================================================
   [VAM] Статусная модалка контроля доступа (git-sync-vam-*) +
   чип статуса в Диагностике (git-sync-chip-vam).
   Токены: только переменные Obsidian var(--*), без хардкодов.
   ============================================================ */

.git-sync-vam-status-modal { text-align: center; padding: 20px 16px 12px; }
.git-sync-vam-icon { font-size: 2.4em; line-height: 1; margin: 0 0 12px; }
.git-sync-vam-icon-ok { color: var(--text-success, var(--text-accent)); }
.git-sync-vam-text { margin: 0 0 10px; line-height: 1.5; }
/* Причина — приглушённая строка; pre-line: describeVamStatus многострочен. */
.git-sync-vam-reason { margin: 0 0 10px; color: var(--text-muted); font-size: 0.9em; line-height: 1.45; white-space: pre-line; }
.git-sync-vam-btn { margin-top: 4px; }
.git-sync-chip-vam { color: var(--text-muted); }
.git-sync-chip-vam.mod-warning { color: var(--text-warning); background: var(--background-modifier-warning); }
.git-sync-chip-vam.mod-success { color: var(--text-success, var(--text-accent)); }

/* ============================================================
   [UI-POLISH 3.3] НЕКРОЛОГ мёртвых правил (код их не использует):
   vts-legend, vts-toolbar(-spacer), vts-both/local/remote (легенда
   заменена цветными подписями Phase 4), vts-mirror-toggle/hint
   (W2-T07 удалил чекбокс зеркала), vts-status (замена
   vts-footer-status), vts-rename-modal (замена vts-specific-modal),
   diag-chip* (замена git-sync-chip), cfm-section* + cfm-path (замена
   cfm-sec* + cfm-paths-list), pop-status-badge (код пишет pop-status),
   pop-bytes (замена pop-bytes-progress), syncthing-* (legacy удалён).
   ============================================================ */
`;

const STYLE_ID = "cloud-vault-sync-injected";

/** Ввести стили в документ (однократно; повторный вызов — no-op). */
export function injectPluginCss(): void {
        if (typeof document === "undefined") return;
        if (document.getElementById(STYLE_ID) !== null) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = PLUGIN_CSS + WORKSPACE_CSS;
        document.head.append(style);
}

/** Убрать введённые стили (выгрузка плагина). */
export function removePluginCss(): void {
        document.getElementById(STYLE_ID)?.remove();
}
