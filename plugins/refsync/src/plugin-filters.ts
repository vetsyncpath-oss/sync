import { Modal, Setting, type App } from "obsidian";
import { type ConfigScope, type PluginPart, pluginParts } from "./config-scope";
import { fold, safe, type StorageProvider } from "./model";
import { RunBudget } from "./runtime";
export class PluginFilters extends Modal {
  private live = true;
  constructor(
    app: App,
    private config: ConfigScope,
    private stores: () => StorageProvider[],
    private self: string,
    private t: (key: string) => string,
    private refresh: () => void,
  ) {
    super(app);
  }
  onClose() {
    this.live = false;
  }
  async onOpen() {
    const limits = new Map(
      (this.config.pluginLimits ?? []).map((x) => [
        fold(x.id),
        new Set(x.allow),
      ]),
    );
    const names = new Set(limits.keys()),
      el = this.contentEl,
      t = this.t;
    this.titleEl.setText(t("pluginFiles"));
    const status = el.createEl("p", { text: t("loadingFolders") });
    let failed = false;
    try {
      await Promise.all(
        this.stores().map(async (s) => {
          try {
            const b = new RunBudget(undefined, 30000, []);
            if ((await b.io(() => s.stat("plugins")))?.type === "folder")
              for (const p of (await b.io(() => s.list("plugins"))).folders) {
                const id = p.split("/")[1];
                if (
                  id &&
                  p === "plugins/" + id &&
                  safe(id) &&
                  fold(id) !== fold(this.self)
                )
                  names.add(fold(id));
              }
          } catch {
            failed = true;
          }
        }),
      );
    } catch {
      failed = true;
    }
    if (!this.live) return;
    status.setText(
      [t("pluginPartsHelp"), failed ? t("folderPartial") : ""]
        .filter(Boolean)
        .join(" "),
    );
    const toolbar = new Setting(el),
      bulk = new Setting(el),
      list = el.createDiv(),
      pager = new Setting(el);
    let search = "",
      page = 0,
      part: PluginPart = "code";
    const matches = () =>
      [...names].filter((id) => id.includes(fold(search))).sort();
    const change = (id: string, k: PluginPart, on: boolean) => {
      const s = limits.get(id) ?? new Set(pluginParts);
      if (on) s.add(k);
      else s.delete(k);
      if (s.size === 3) limits.delete(id);
      else limits.set(id, s);
    };
    const render = () => {
      list.empty();
      pager.clear();
      const found = matches();
      if (!found.length) list.createEl("p", { text: t("noneFound") });
      for (const id of found.slice(page * 40, page * 40 + 40)) {
        const row = new Setting(list).setName(id);
        for (const k of pluginParts) {
          const label = row.controlEl.createEl("label", {
            text: t("cat_" + k),
          });
          const box = label.createEl("input", { type: "checkbox" });
          box.checked = limits.get(id)?.has(k) ?? true;
          if (!this.config.categories.includes(k))
            label.title = t("categoryOff");
          box.onchange = () => change(id, k, box.checked);
        }
      }
      if (found.length > 40)
        for (const n of [-1, 1])
          pager.addButton((b) =>
            b
              .setButtonText(n < 0 ? "←" : "→")
              .setDisabled(n < 0 ? page === 0 : (page + 1) * 40 >= found.length)
              .onClick(() => {
                page += n;
                render();
              }),
          );
    };
    toolbar.addSearch((s) =>
      s.setPlaceholder(t("search")).onChange((v) => {
        search = v;
        page = 0;
        render();
      }),
    );
    bulk.addDropdown((d) => {
      for (const k of pluginParts) d.addOption(k, t("cat_" + k));
      d.onChange((v) => {
        part = v as PluginPart;
      });
    });
    for (const on of [true, false])
      bulk.addButton((b) =>
        b
          .setButtonText(t(on ? "checkMatches" : "uncheckMatches"))
          .onClick(() => {
            for (const id of matches()) change(id, part, on);
            render();
          }),
      );
    render();
    new Setting(el)
      .addButton((b) =>
        b.setButtonText(t("cancel")).onClick(() => this.close()),
      )
      .addButton((b) =>
        b
          .setButtonText(t("useSelection"))
          .setCta()
          .onClick(() => {
            this.config.pluginLimits = [...limits].map(([id, allow]) => ({
              id,
              allow: [...allow],
            }));
            this.close();
            this.refresh();
          }),
      );
  }
}
