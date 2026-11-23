import { ItemView, Setting, type WorkspaceLeaf } from "obsidian";
import type SyncStudio from "./main";
export const historyView = "sync-studio-history";
interface Row {
  at: number;
  profile: string;
  event: string;
  description: string;
}
export class HistoryView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private studio: SyncStudio,
  ) {
    super(leaf);
  }
  getViewType() {
    return historyView;
  }
  getDisplayText() {
    return this.studio.t("history");
  }
  getIcon() {
    return "history";
  }
  async onOpen() {
    await this.show();
  }
  private query = "";
  private page = 0;
  private async show() {
    const el = this.contentEl,
      t = this.studio.t,
      rows: Row[] = [];
    el.empty();
    const files = await this.studio.historyFiles();
    for (const file of files)
      for (const line of file.split("\n").reverse()) {
        if (!line) continue;
        try {
          const r = JSON.parse(line);
          if (
            typeof r.at !== "number" ||
            typeof r.profile !== "string" ||
            typeof r.event !== "string"
          )
            continue;
          const add = (event: string, description: string) =>
            rows.push({ at: r.at, profile: r.profile, event, description });
          if (r.event !== "operations")
            add(
              r.event === "verify-failed" ? "holdVerify" : r.event,
              [
                r.code ? t(r.code) : "",
                r.path ?? "",
                typeof r.count === "number" ? String(r.count) : "",
                r.stats ? this.studio.scanLabel(r.stats) : "",
                r.ms === undefined
                  ? ""
                  : t("duration") + " " + (r.ms / 1000).toFixed(1),
              ]
                .filter(Boolean)
                .join(" · "),
            );
          for (const op of r.operations ?? []) add(op.action, op.path);
          for (const p of r.held ?? []) add("held", p);
          for (const d of r.deferred ?? [])
            add("deferred", d.path + " · " + t(d.reason));
          for (const p of r.unresolved ?? []) add("holdVerify", p);
        } catch {
          /* Keep valid adjacent lines from older or interrupted logs. */
        }
      }
    const toolbar = new Setting(el);
    toolbar.addSearch((s) =>
      s
        .setPlaceholder(t("search"))
        .setValue(this.query)
        .onChange((v) => {
          this.query = v;
          this.page = 0;
          render();
        }),
    );
    toolbar.addButton((b) =>
      b.setButtonText(t("refreshLog")).onClick(() => this.show()),
    );
    const list = el.createDiv(),
      pager = new Setting(el);
    const render = () => {
      list.empty();
      pager.clear();
      const profile = (id: string) =>
        this.studio.config.profiles.find((p) => p.id === id)?.name ?? id;
      const visible = rows.filter((r) =>
        [profile(r.profile), t(r.event), r.description]
          .join(" ")
          .toLowerCase()
          .includes(this.query.toLowerCase()),
      );
      this.page = Math.min(
        this.page,
        Math.max(0, Math.ceil(visible.length / 50) - 1),
      );
      if (!visible.length)
        list.createEl("p", {
          text: t(rows.length ? "noneFound" : "historyEmpty"),
        });
      for (const r of visible.slice(this.page * 50, this.page * 50 + 50))
        new Setting(list)
          .setName(t(r.event) + (r.description ? " · " + r.description : ""))
          .setDesc(
            new Date(r.at).toLocaleString() + " · " + profile(r.profile),
          );
      if (visible.length > 50)
        for (const n of [-1, 1])
          pager.addButton((b) =>
            b
              .setButtonText(n < 0 ? "←" : "→")
              .setDisabled(
                n < 0
                  ? this.page === 0
                  : (this.page + 1) * 50 >= visible.length,
              )
              .onClick(() => {
                this.page += n;
                render();
              }),
          );
    };
    render();
  }
}
