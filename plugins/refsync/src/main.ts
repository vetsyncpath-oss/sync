import {
  Plugin,
  PluginSettingTab,
  Platform,
  Modal,
  Setting,
  Notice,
  Menu,
  setIcon,
  type App,
} from "obsidian";
import { defaults, join, checked, type Profile } from "./model";
import { validate } from "./validator";
import { Applier } from "./applier";
import { StateStore, ApplyJournal, type Transaction } from "./state";
import { LocalProvider, VaultArtifacts } from "./vault";
import { SyncEngine, StatusStore, type Phase } from "./engine";
import { translator } from "./i18n";
import type { Plan } from "./planner";

const icons: Record<Phase, string> = {
  idle: "refresh-cw",
  scan: "search",
  apply: "download",
  recover: "history",
  done: "check",
  partial: "shield-alert",
  error: "circle-alert",
};
class StatusController {
  constructor(
    plugin: Plugin,
    store: StatusStore,
    tr: (key: string) => string,
    open: (e: MouseEvent) => void,
  ) {
    const ribbon = plugin.addRibbonIcon("refresh-cw", "RefSync", open);
    const bar = Platform.isDesktopApp ? plugin.addStatusBarItem() : null;
    if (bar) {
      bar.tabIndex = 0;
      bar.setAttribute("role", "button");
      bar.onclick = open;
      bar.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          bar.click();
        }
      };
    }
    plugin.register(
      store.subscribe((phase) => {
        setIcon(ribbon, icons[phase]);
        ribbon.setAttribute("aria-label", "RefSync · " + tr(phase));
        bar?.setText("RefSync · " + tr(phase));
      }),
    );
  }
}
class Review extends Modal {
  constructor(
    app: App,
    private plugin: RefSync,
    private plan: Plan,
    private apply?: () => void,
  ) {
    super(app);
  }
  onOpen() {
    const t = this.plugin.t;
    this.titleEl.setText("RefSync · " + t(this.apply ? "preview" : "dry"));
    if (this.apply) this.contentEl.createEl("p", { text: t("previewFirst") });
    const list = this.contentEl.createEl("ul");
    const items = this.plan.ops.filter((op) => op.action !== "ack");
    for (const op of items)
      list.createEl("li", {
        text:
          t(op.action) +
          " · " +
          op.path +
          (op.conflict ? " · " + t("conflict") : ""),
      });
    if (!items.length) this.contentEl.createEl("p", { text: t("none") });
    if (this.plan.held.length)
      this.contentEl.createEl("p", {
        text: t("held") + " · " + this.plan.held.join(", "),
      });
    if (this.apply)
      new Setting(this.contentEl).addButton((b) =>
        b
          .setButtonText(t("sync"))
          .setCta()
          .onClick(() => {
            this.close();
            this.apply?.();
          }),
      );
  }
  onClose() {
    this.contentEl.empty();
  }
}
class Confirm extends Modal {
  constructor(
    app: App,
    private plugin: RefSync,
    private run: () => void,
  ) {
    super(app);
  }
  onOpen() {
    const t = this.plugin.t;
    this.contentEl.createEl("p", { text: t("undoText") });
    new Setting(this.contentEl)
      .addButton((b) =>
        b.setButtonText(t("cancel")).onClick(() => this.close()),
      )
      .addButton((b) =>
        b.setButtonText(t("confirm")).onClick(() => {
          this.close();
          this.run();
        }),
      );
  }
}
export default class RefSync extends Plugin {
  profile: Profile = { ...defaults };
  t = translator(navigator.language);
  private engine!: SyncEngine;
  private logDir = "";
  private ready!: Promise<void>;
  async onload() {
    const data: unknown = await this.loadData();
    if (
      data &&
      typeof data === "object" &&
      "profile" in data &&
      data.profile &&
      typeof data.profile === "object"
    )
      this.profile = { ...defaults, ...data.profile };
    const deviceKey = (k: string) => this.manifest.id + ":" + k;
    const state = new StateStore({
      get: (k) => this.app.loadLocalStorage(deviceKey(k)),
      set: (k, v) => this.app.saveLocalStorage(deviceKey(k), v),
    });
    const selfDir = join(
      this.app.vault.configDir,
      "plugins/" + this.manifest.id,
    );
    this.logDir = join(selfDir, "runtime");
    const disk = new VaultArtifacts(
      this.app.vault.adapter,
      join(this.logDir, "journal/" + state.device),
    );
    const status = new StatusStore();
    this.engine = new SyncEngine(
      new Applier(new ApplyJournal(disk), state),
      status,
      this.app.vault.configDir,
      this.manifest.id,
      Platform.isDesktopApp,
    );
    this.ready = new Promise<void>((resolve, reject) =>
      this.app.workspace.onLayoutReady(() => {
        status.set("recover");
        this.engine
          .exclusive(() =>
            this.engine.applier.recover((t) => this.recoveryTarget(t)),
          )
          .then(() => {
            status.set("idle");
            resolve();
          }, reject);
      }),
    );
    void this.ready.catch((e) => this.report(e));
    new StatusController(this, status, this.t, (e) => {
      const menu = new Menu();
      for (const [id, fn] of [
        ["preview", () => this.review(false)],
        ["sync", () => this.review(true)],
        ["undo", () => this.confirmUndo()],
      ] as const)
        menu.addItem((item) => item.setTitle(this.t(id)).onClick(fn));
      menu.showAtMouseEvent(e);
    });
    this.addSettingTab(new Editor(this.app, this));
    this.addCommand({
      id: "dry-run",
      name: this.t("dry"),
      callback: () => this.review(false),
    });
    this.addCommand({
      id: "deliver",
      name: this.t("sync"),
      callback: () => this.review(true),
    });
    this.addCommand({
      id: "undo",
      name: this.t("undo"),
      callback: () => this.confirmUndo(),
    });
  }
  private recoveryTarget(t: Transaction) {
    const root = t.target;
    return new LocalProvider(
      this.app.vault,
      root === "/" ? "" : root,
      this.manifest.id,
      t.scope,
    );
  }
  private stores(p: Profile) {
    if (p.access !== "local") throw Error("invalid");
    const local =
      p.scope === "settings"
        ? this.app.vault.configDir
        : p.local === "/"
          ? ""
          : p.local;
    return {
      reference: new LocalProvider(
        this.app.vault,
        p.reference === "/" ? "" : p.reference,
        this.manifest.id,
        p.scope,
        p.role === "subscriber",
      ),
      local: new LocalProvider(
        this.app.vault,
        local,
        this.manifest.id,
        p.scope,
        p.role === "publisher",
      ),
    };
  }
  private async log(event: string, count: number) {
    const a = this.app.vault.adapter;
    if (!(await a.exists(this.logDir))) await a.mkdir(this.logDir);
    const f = join(this.logDir, "events.jsonl"),
      prev = f + ".1";
    if (((await a.stat(f))?.size ?? 0) > 262144) {
      if (await a.exists(prev)) await a.remove(prev);
      await a.rename(f, prev);
    }
    await a.append(
      f,
      JSON.stringify({
        at: Date.now(),
        profile: this.profile.id,
        event,
        count,
      }) + "\n",
    );
  }
  report(e: unknown) {
    new Notice(
      "RefSync · " + this.t(e instanceof Error ? e.message : "failed"),
    );
    void this.log("error", 0).catch(() => {});
  }
  async review(apply: boolean) {
    try {
      await this.ready;
      const p = { ...this.profile },
        v = this.stores(p),
        result = await this.engine.run(p, v.reference, v.local, true);
      new Review(
        this.app,
        this,
        result.plan,
        apply ? () => void this.deliver(p, result.plan) : undefined,
      ).open();
    } catch (e) {
      this.report(e);
    }
  }
  private async deliver(p: Profile, approved: Plan) {
    try {
      await this.ready;
      const v = this.stores(p);
      const r = await this.engine.run(p, v.reference, v.local, false, approved);
      await this.log(r.plan.held.length ? "partial" : "done", r.changed);
      if (r.plan.held.length) new Notice(this.t("held"));
    } catch (e) {
      this.report(e);
    }
  }
  confirmUndo() {
    new Confirm(this.app, this, () => void this.undo()).open();
  }
  private async undo() {
    try {
      await this.ready;
      const p = this.profile,
        v = this.stores(p);
      const [source, target] =
        p.role === "subscriber"
          ? [v.reference, v.local]
          : [v.local, v.reference];
      const key = JSON.stringify([p.id, p.scope, source.id, target.id]);
      await this.engine.exclusive(() => this.engine.applier.undo(key, target));
      await this.log("undo", 1);
    } catch (e) {
      this.report(e);
    }
  }
}
class Editor extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: RefSync,
  ) {
    super(app, plugin);
  }
  display() {
    const el = this.containerEl,
      p = { ...this.plugin.profile },
      t = this.plugin.t;
    el.empty();
    el.createEl("h2", { text: t("title") });
    el.createEl("p", { text: t("instructions") });
    const scope = new Setting(el).setName(t("scope"));
    let localInput: HTMLInputElement;
    scope.addDropdown((d) => {
      for (const k of ["content", "settings"] as const) d.addOption(k, t(k));
      d.setValue(p.scope).onChange((v) => {
        p.scope = v === "content" ? "content" : "settings";
        localInput.disabled = p.scope === "settings";
        localInput.value =
          p.scope === "settings" ? this.app.vault.configDir : p.local;
        refresh();
      });
    });
    const role = new Setting(el).setName(t("role"));
    role.addDropdown((d) => {
      for (const k of ["subscriber", "publisher"] as const)
        d.addOption(k, t(k));
      d.setValue(p.role).onChange((v) => {
        p.role = v === "subscriber" ? "subscriber" : "publisher";
        refresh();
      });
    });
    new Setting(el).setName(t("reference")).addText((x) =>
      x.setValue(p.reference).onChange((v) => {
        p.reference = v.trim();
        refresh();
      }),
    );
    new Setting(el).setName(t("target")).addText((x) => {
      localInput = x.inputEl;
      localInput.disabled = p.scope === "settings";
      x.setValue(
        p.scope === "settings" ? this.app.vault.configDir : p.local,
      ).onChange((v) => {
        p.local = v.trim();
        refresh();
      });
    });
    const error = el.createEl("p", { attr: { role: "status" } });
    const actions = new Setting(el);
    const refresh = () => {
      const bad = validate(
        p,
        Platform.isDesktopApp,
        false,
        this.app.vault.configDir,
      );
      error.setText(bad.map((r) => r.field + " · " + t(r.code)).join("\n"));
      actions.components.forEach((c) => c.setDisabled(bad.length > 0));
    };
    actions.addButton((b) =>
      b.setButtonText(t("save")).onClick(async () => {
        refresh();
        if (error.textContent) return;
        this.plugin.profile = { ...p };
        await this.plugin.saveData({ profile: p });
        this.display();
      }),
    );
    actions.addButton((b) =>
      b.setButtonText(t("init")).onClick(async () => {
        try {
          refresh();
          if (error.textContent) return;
          for (const dir of [
            p.reference,
            p.scope === "settings" ? this.app.vault.configDir : p.local,
          ]) {
            if (
              !dir ||
              dir === "/" ||
              (await this.app.vault.adapter.exists(dir))
            )
              continue;
            checked(dir);
            await this.app.vault.createFolder(dir);
          }
        } catch (e) {
          this.plugin.report(e);
        }
      }),
    );
    refresh();
  }
}
