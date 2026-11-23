import { Modal, Setting, type App } from "obsidian";
import {
  contentPath,
  folderIncluded,
  plainContent,
  setFolders,
} from "./content-scope";
import {
  fold,
  join,
  parent,
  safe,
  type Profile,
  type StorageProvider,
} from "./model";
import { RunBudget } from "./runtime";
type Tr = (key: string) => string;
export function contentEditor(
  el: HTMLElement,
  p: Profile,
  app: App,
  self: string,
  t: Tr,
  stores: () => StorageProvider[],
  refresh: () => void,
) {
  const c = p.content ?? plainContent();
  const toggle = (key: "config" | "hidden", label: string) =>
    new Setting(el).setName(label).addToggle((b) =>
      b.setValue(c[key]).onChange((v) => {
        p.content = { ...c, [key]: v };
        refresh();
      }),
    );
  new Setting(el)
    .setName(t("everything"))
    .setDesc(t("contentHelp"))
    .addToggle((b) =>
      b.setValue(c.config && c.hidden).onChange((v) => {
        p.content = { ...c, config: v, hidden: v };
        refresh();
      }),
    );
  toggle("config", t("configFolder") + " · " + app.vault.configDir);
  toggle("hidden", t("otherHidden"));
  const row = new Setting(el)
    .setName(t("folderSelection"))
    .setDesc(c.rules.map((r) => (r.include ? "+ " : "− ") + r.path).join(", "));
  for (const plugins of [false, true])
    row.addButton((b) =>
      b
        .setButtonText(t(plugins ? "pluginsPicker" : "foldersPicker"))
        .setDisabled(plugins && !c.config)
        .onClick(() =>
          new FolderSelection(app, p, self, t, stores, plugins, refresh).open(),
        ),
    );
}
class FolderSelection extends Modal {
  private directory: string;
  private ticket = 0;
  private c;
  constructor(
    app: App,
    private profile: Profile,
    private self: string,
    private t: Tr,
    private stores: () => StorageProvider[],
    private plugins: boolean,
    private refresh: () => void,
  ) {
    super(app);
    this.directory = plugins ? join(app.vault.configDir, "plugins") : "";
    this.c = profile.content ?? plainContent();
  }
  onClose() {
    this.ticket++;
  }
  onOpen() {
    void this.show();
  }
  private async show() {
    const ticket = ++this.ticket,
      el = this.contentEl,
      t = this.t,
      dir = this.directory;
    this.titleEl.setText(t(this.plugins ? "pluginsPicker" : "foldersPicker"));
    el.empty();
    const header = new Setting(el).setName(dir || "/");
    if (dir && !this.plugins)
      header.addButton((b) =>
        b.setButtonText(t("upFolder")).onClick(() => {
          this.directory = parent(dir);
          void this.show();
        }),
      );
    const status = el.createEl("p", { text: t("loadingFolders") });
    const names = new Set(
      this.c.rules.map((r) => r.path).filter((p) => parent(p) === dir),
    );
    let failures = 0;
    try {
      const sides = this.stores();
      await Promise.all(
        sides.map(async (s) => {
          try {
            const budget = new RunBudget(undefined, 30000, []);
            if ((await budget.io(() => s.stat(dir)))?.type === "folder")
              for (const p of (await budget.io(() => s.list(dir))).folders)
                if (parent(p) === dir) names.add(p);
          } catch {
            failures++;
          }
        }),
      );
    } catch {
      failures++;
    }
    if (ticket !== this.ticket) return;
    status.setText(failures ? t("folderPartial") : "");
    const candidates = [...names]
      .filter(
        (p) =>
          safe(p) &&
          contentPath(p, this.app.vault.configDir, this.self, true, {
            ...this.c,
            rules: [],
          }),
      )
      .sort((a, b) => a.localeCompare(b));
    let query = "",
      page = 0;
    const tools = new Setting(el);
    const list = el.createDiv(),
      pager = new Setting(el);
    const visible = () =>
      candidates.filter((p) => fold(p).includes(fold(query)));
    const render = () => {
      list.empty();
      pager.clear();
      const matches = visible();
      if (!matches.length) list.createEl("p", { text: t("noneFound") });
      for (const p of matches.slice(page * 50, page * 50 + 50)) {
        const row = new Setting(list).setName(
          p.slice(dir ? dir.length + 1 : 0),
        );
        row.addToggle((b) =>
          b.setValue(folderIncluded(p, this.c)).onChange((v) => {
            this.c = setFolders(this.c, [p], v);
            render();
          }),
        );
        if (!this.plugins)
          row.addExtraButton((b) =>
            b
              .setIcon("folder-open")
              .setTooltip(t("openFolder"))
              .onClick(() => {
                this.directory = p;
                void this.show();
              }),
          );
      }
      if (matches.length > 50)
        for (const n of [-1, 1])
          pager.addButton((b) =>
            b
              .setButtonText(n < 0 ? "←" : "→")
              .setDisabled(
                n < 0 ? page === 0 : (page + 1) * 50 >= matches.length,
              )
              .onClick(() => {
                page += n;
                render();
              }),
          );
    };
    tools.addSearch((s) =>
      s.setPlaceholder(t("search")).onChange((v) => {
        query = v;
        page = 0;
        render();
      }),
    );
    for (const v of [true, false])
      tools.addButton((b) =>
        b
          .setButtonText(t(v ? "checkMatches" : "uncheckMatches"))
          .onClick(() => {
            this.c = setFolders(this.c, visible(), v);
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
            this.profile.content = this.c;
            this.close();
            this.refresh();
          }),
      );
  }
}
