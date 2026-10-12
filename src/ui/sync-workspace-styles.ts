export const WORKSPACE_CSS = `
/* Source workspace: vault stays available while each source loads independently. */
.sync-workspace { min-width: min(100%, 760px); }
.sync-workspace-toolbar, .sync-workspace-footer { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:12px 0; }
.sync-workspace-layout { display:grid; grid-template-columns:180px minmax(220px,1fr) minmax(240px,1fr); gap:12px; }
.sync-workspace-tree, .sync-workspace-inspector, .sync-workspace-sources { max-height:60vh; overflow:auto; min-width:0; }
.sync-workspace-source { display:flex; flex-direction:column; gap:5px; padding:8px; margin-bottom:8px; border:1px solid var(--background-modifier-border); border-radius:6px; }
.sync-workspace-source button[aria-pressed="true"] { background:var(--interactive-accent); color:var(--text-on-accent); }
.sync-workspace-row { display:flex; gap:5px; align-items:center; min-height:32px; flex-wrap:wrap; }
.sync-workspace-row small { color:var(--text-muted); overflow-wrap:anywhere; }
.sync-workspace-row:focus { outline:2px solid var(--interactive-accent); }
.sync-workspace-inspector { padding:0 10px; border-left:1px solid var(--background-modifier-border); }
.sync-workspace-error { color:var(--text-error); white-space:pre-wrap; }
.sync-workspace-footer p { flex:1 1 100%; }
@media (max-width:800px) {
  .sync-workspace-layout { grid-template-columns:minmax(0,1fr); }
  .sync-workspace-sources { display:flex; gap:8px; max-height:200px; }
  .sync-workspace-source { flex:0 0 180px; }
  .sync-workspace-inspector { border-left:0; border-top:1px solid var(--background-modifier-border); }
  .sync-workspace-tree { max-height:40vh; }
}
`;
