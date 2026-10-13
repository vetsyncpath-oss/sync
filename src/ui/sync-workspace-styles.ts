export const WORKSPACE_CSS = `
.sync-workspace { display:flex; flex-direction:column; gap:12px; height:min(820px, 82vh); max-height:calc(100dvh - 100px); min-width:0; color:var(--text-normal); overflow:hidden; }
.sync-workspace > :not(.sync-workspace-layout) { flex-shrink:0; }
.sync-workspace-heading h2 { margin:0 0 4px; }
.sync-workspace-heading small, .sync-workspace-hint { color:var(--text-muted); }
.sync-workspace-toolbar, .sync-workspace-footer, .sync-inspector-actions, .sync-file-filters, .sync-tree-pager { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.sync-workspace-toolbar { padding-bottom:12px; border-bottom:1px solid var(--background-modifier-border); }
.sync-workspace-toolbar .sync-field { display:flex; align-items:center; gap:8px; margin:0; }
.sync-workspace-toolbar input[type=search] { flex:1; min-width:150px; }
.sync-workspace-layout { display:grid; grid-template-columns:210px minmax(240px,1fr) minmax(280px,1fr); gap:16px; flex:1; min-height:0; overflow:hidden; }
.sync-workspace-tree, .sync-workspace-inspector, .sync-workspace-sources { overflow:auto; min-width:0; min-height:0; scrollbar-gutter:stable; }
.sync-workspace-inspector { padding:0 10px 12px; border-inline-start:1px solid var(--background-modifier-border); }
.sync-workspace-layout h3 { margin-top:0; }
.sync-workspace-source { padding:10px; margin:0 0 8px; border:1px solid var(--background-modifier-border); border-radius:8px; }
.sync-workspace-source > button { width:100%; text-align:start; white-space:normal; height:auto; min-height:32px; }
.sync-workspace-source > small { display:block; margin-top:6px; color:var(--text-muted); overflow-wrap:anywhere; }
.sync-workspace-source button[aria-pressed=true] { background:var(--interactive-accent); color:var(--text-on-accent); }
.sync-source-actions { margin-top:8px; }
.sync-source-actions summary { cursor:pointer; font-size:var(--font-ui-small); color:var(--text-muted); }
.sync-source-actions button { display:block; width:100%; text-align:start; white-space:normal; margin-top:6px; height:auto; min-height:30px; }
.sync-workspace-row { display:flex; align-items:center; gap:6px; padding-block:6px; padding-inline-end:6px; min-height:34px; border-radius:5px; flex-wrap:wrap; cursor:pointer; }
.sync-workspace-row:hover, .sync-path-option:hover { background:var(--background-modifier-hover); }
.sync-workspace-row[aria-selected=true] { background:var(--background-modifier-active-hover); box-shadow:inset 3px 0 var(--interactive-accent); }
.sync-workspace-row:focus-visible, .sync-path-option:focus-visible { outline:2px solid var(--interactive-accent); outline-offset:-2px; }
.sync-tree-expander { padding:0; width:22px; height:24px; box-shadow:none; background:transparent; }
.sync-tree-name { flex:1; min-width:80px; overflow-wrap:anywhere; }
.sync-tree-icon { width:22px; text-align:center; color:var(--text-faint); }
.sync-tree-meta, .sync-tree-state { flex-basis:100%; padding-inline-start:28px; color:var(--text-muted); overflow-wrap:anywhere; }
.sync-tree-state-excluded, .sync-tree-state-preserve { color:var(--text-faint); }
.sync-tree-state-protected, .sync-tree-state-unassigned, .sync-workspace-warning { color:var(--text-warning); }
.sync-workspace-error { color:var(--text-error); white-space:pre-wrap; overflow-wrap:anywhere; }
.sync-field { display:grid; grid-template-columns:minmax(0,1fr); gap:5px; margin:12px 0; }
.sync-field > label { font-weight:var(--font-medium); }
.sync-field input:not([type=checkbox]), .sync-field select { width:100%; min-width:0; }
.sync-field small { color:var(--text-muted); overflow-wrap:anywhere; }
.sync-field .sync-workspace-error { color:var(--text-error); }
.sync-field input[aria-invalid=true], .sync-field select[aria-invalid=true] { border-color:var(--text-error); }
.sync-assignment-row, .sync-library-row { padding:10px 0; margin-top:10px; border-top:1px solid var(--background-modifier-border); }
.sync-assignment-row p { margin:0 0 8px; }
.sync-assignment-row button, .sync-library-row button { margin-inline-end:6px; margin-bottom:6px; }
.sync-library-row strong, .sync-library-row small { display:block; margin-bottom:8px; }
.sync-workspace-footer { padding-top:12px; border-top:1px solid var(--background-modifier-border); }
.sync-workspace-footer p { flex:1 1 100%; margin:0 0 4px; color:var(--text-muted); }
.sync-path-list { max-height:50vh; overflow:auto; margin:12px 0; }
.sync-path-option { padding:8px; border-radius:5px; cursor:pointer; overflow-wrap:anywhere; }
.sync-operation-table { overflow:auto; max-height:50vh; margin-block:14px; }
.sync-operation-table input { width:100%; margin-bottom:8px; }
.sync-operation-table table { border-collapse:collapse; width:100%; min-width:620px; }
.sync-operation-table th, .sync-operation-table td { padding:8px; text-align:start; vertical-align:top; border-bottom:1px solid var(--background-modifier-border); overflow-wrap:anywhere; max-width:240px; }
.sync-operation-table th { background:var(--background-secondary); position:sticky; top:0; }
.sync-workspace-mobile-tabs { display:none; }
.sync-table-mobile-hint { display:none; }
@media (max-width:950px) {
  .sync-workspace { height:82vh; height:82dvh; }
  .sync-workspace-mobile-tabs { display:flex; gap:6px; }
  .sync-workspace-mobile-tabs button[aria-pressed=true] { background:var(--interactive-accent); color:var(--text-on-accent); }
  .sync-workspace-layout { display:block; }
  .sync-workspace-sources, .sync-workspace-tree, .sync-workspace-inspector { display:none; height:100%; }
  .sync-workspace[data-pane=sources] .sync-workspace-sources, .sync-workspace[data-pane=tree] .sync-workspace-tree, .sync-workspace[data-pane=inspector] .sync-workspace-inspector { display:block; }
  .sync-workspace-inspector { border:0; padding-inline:0; }
  .sync-table-mobile-hint { display:block; padding-block:8px; color:var(--text-muted); }
  .sync-workspace[data-pane=inspector] .sync-workspace-toolbar, .sync-workspace-reset { display:none; }
  .sync-workspace-toolbar .sync-field { flex:1 1 100%; }
  .sync-workspace-footer > button { flex:1; min-width:120px; white-space:normal; height:auto; min-height:32px; }
}
`;
