import { PluginSettingTab, Setting, Platform, type App } from "obsidian";
import type RefSync from "./main";
import { checked, type Profile } from "./model";
import { newProfile } from "./profiles";
import { validate } from "./validator";
export class Editor extends PluginSettingTab {
  private draft?: Profile;
  constructor(
    app: App,
    private plugin: RefSync,
  ) {
    super(app, plugin);
  }
  hide() {
    this.draft = undefined;
  }
  display() {
    const el = this.containerEl,
      rs = this.plugin,
      t = rs.t;
    el.empty();
    if (this.draft) {
      this.edit(this.draft);
      return;
    }
    el.createEl("h2", { text: t("profiles") });
    new Setting(el).setName(t("defaultMode")).addDropdown((d) =>
      d
        .addOption("plan", t("plan"))
        .addOption("silent", t("silent"))
        .setValue(rs.config.mode)
        .onChange(async (v) => {
          await rs.save({
            ...rs.config,
            mode: v === "silent" ? "silent" : "plan",
          });
        }),
    );
    new Setting(el).setName(t("pause")).addToggle((c) =>
      c.setValue(rs.config.paused).onChange(async (paused) => {
        await rs.save({ ...rs.config, paused });
      }),
    );
    new Setting(el)
      .addButton((b) =>
        b
          .setButtonText(t("add"))
          .setCta()
          .onClick(() => {
            this.draft = newProfile();
            this.display();
          }),
      )
      .addButton((b) =>
        b.setButtonText(t("syncAll")).onClick(() => rs.runAll()),
      );
    rs.config.profiles.forEach((p, index) => {
      const row = new Setting(el)
        .setName(p.name)
        .setDesc(
          [
            t(p.scope),
            p.role === "subscriber"
              ? p.reference +
                " → " +
                (p.scope === "settings" ? this.app.vault.configDir : p.local)
              : (p.scope === "settings" ? this.app.vault.configDir : p.local) +
                " → " +
                p.reference,
            t(p.inheritMode ? rs.config.mode : p.mode),
          ].join(" · "),
        );
      row.addToggle((c) =>
        c
          .setTooltip(t("enabled"))
          .setValue(p.enabled)
          .onChange(async (enabled) => {
            await rs.put({ ...p, enabled });
            this.display();
          }),
      );
      row.addButton((b) =>
        b.setButtonText(t("edit")).onClick(() => {
          this.draft = { ...p };
          this.display();
        }),
      );
      row.addExtraButton((b) =>
        b
          .setIcon("copy")
          .setTooltip(t("duplicate"))
          .onClick(() => {
            this.draft = newProfile(p);
            this.display();
          }),
      );
      for (const [delta, icon] of [
        [-1, "arrow-up"],
        [1, "arrow-down"],
      ] as const)
        if (rs.config.profiles[index + delta])
          row.addExtraButton((b) =>
            b
              .setIcon(icon)
              .setTooltip(t(delta < 0 ? "up" : "down"))
              .onClick(async () => {
                const list = [...rs.config.profiles];
                [list[index], list[index + delta]] = [
                  list[index + delta],
                  list[index],
                ];
                await rs.save({ ...rs.config, profiles: list });
                this.display();
              }),
          );
      new Setting(el)
        .addButton((b) =>
          b
            .setButtonText(t(p.id === rs.config.current ? "current" : "select"))
            .setDisabled(p.id === rs.config.current)
            .onClick(async () => {
              await rs.save({ ...rs.config, current: p.id });
              this.display();
            }),
        )
        .addButton((b) =>
          b.setButtonText(t("dry")).onClick(() => rs.request(p.id, "dry")),
        )
        .addButton((b) =>
          b
            .setButtonText(t("sync"))
            .setDisabled(!p.enabled)
            .onClick(() => rs.request(p.id, "run")),
        );
    });
  }
  private edit(p: Profile) {
    const rs = this.plugin,
      t = rs.t,
      el = this.containerEl;
    el.createEl("h2", { text: t("edit") + " · " + p.name });
    const back = () => {
      this.draft = undefined;
      this.display();
    };
    type S = keyof Profile;
    const text = (field: S, key: string) =>
      new Setting(el).setName(t(key)).addText((c) =>
        c.setValue(String(p[field])).onChange((v) => {
          Object.assign(p, { [field]: v });
          validateForm();
        }),
      );
    const num = (field: S, key: string) =>
      new Setting(el).setName(t(key)).addText((c) => {
        c.inputEl.type = "number";
        c.inputEl.min = "0";
        c.setValue(String(p[field])).onChange((v) => {
          Object.assign(p, { [field]: v.trim() === "" ? NaN : Number(v) });
          validateForm();
        });
      });
    const toggle = (field: S, key: string, disabled = false) =>
      new Setting(el).setName(t(key)).addToggle((c) =>
        c
          .setDisabled(disabled)
          .setValue(p[field] === true)
          .onChange((v) => {
            Object.assign(p, { [field]: v });
            validateForm();
          }),
      );
    const choice = (
      field: S,
      key: string,
      values: string[],
      disabled = false,
    ) =>
      new Setting(el).setName(t(key)).addDropdown((d) => {
        for (const v of values)
          d.addOption(
            v,
            t(field === "conflict" && v === "target" ? "targetVersion" : v),
          );
        d.setValue(String(p[field]))
          .setDisabled(disabled)
          .onChange((v) => {
            Object.assign(p, { [field]: v });
            if (p.mirror === "full") {
              p.conflict = "source";
              p.deletions = true;
            }
            if (p.scope === "settings") {
              p.fileEvents = false;
              if (p.conflict === "both") p.conflict = "source";
            }
            if (field === "role" && p.role === "publisher") {
              p.conflict = "source";
              p.deletions = p.mirror === "full";
            }
            this.display();
          });
      });
    text("name", "name");
    toggle("enabled", "enabled");
    choice("scope", "scope", ["content", "settings"]);
    choice("role", "role", ["subscriber", "publisher"]);
    text("reference", "reference");
    if (p.scope === "settings")
      new Setting(el).setName(t("target")).setDesc(this.app.vault.configDir);
    else text("local", "target");
    choice("mirror", "mirrorMode", ["preserve", "full"]);
    if (p.role === "subscriber") {
      toggle("deletions", "deletions", p.mirror === "full");
      choice(
        "conflict",
        "conflict",
        p.scope === "content"
          ? ["source", "target", "newer", "both"]
          : ["source", "target", "newer"],
        p.mirror === "full",
      );
    }
    num("maxDeleteCount", "maxDeleteCount");
    num("maxDeletePercent", "maxDeletePercent");
    num("deleteGrace", "deleteGrace");
    num("shrinkPercent", "shrinkPercent");
    choice("trash", "trash", ["plugin", "vault", "system", "permanent"]);
    if (p.trash === "plugin") num("trashDays", "trashDays");
    new Setting(el).setName(t("mode")).addDropdown((d) => {
      for (const k of ["inherit", "plan", "silent"]) d.addOption(k, t(k));
      d.setValue(p.inheritMode ? "inherit" : p.mode).onChange((v) => {
        p.inheritMode = v === "inherit";
        if (v !== "inherit") p.mode = v === "silent" ? "silent" : "plan";
        this.display();
      });
    });
    toggle("firstPlan", "firstPlan");
    if (p.scope === "content") {
      text("include", "include");
      text("exclude", "exclude");
      num("maxMiB", "maxMiB");
      toggle("startup", "startup");
      num("startupSeconds", "startupSeconds");
      num("intervalMinutes", "intervalMinutes");
      toggle("onFocus", "onFocus");
      toggle("onOnline", "onOnline");
      toggle("fileEvents", "fileEvents");
      num("debounceSeconds", "debounceSeconds");
      num("quietSeconds", "quietSeconds");
      num("maxDeferrals", "maxDeferrals");
    }
    const error = el.createEl("p", { attr: { role: "status" } }),
      actions = new Setting(el);
    const validateForm = () => {
      const errors = validate(
        p,
        Platform.isDesktopApp,
        false,
        this.app.vault.configDir,
      );
      error.setText(
        errors.map((e) => t(e.field) + " · " + t(e.code)).join("\n"),
      );
      return !errors.length;
    };
    actions
      .addButton((b) => b.setButtonText(t("cancel")).onClick(back))
      .addButton((b) =>
        b.setButtonText(t("init")).onClick(async () => {
          if (!validateForm()) return;
          try {
            for (const dir of [
              p.reference,
              p.scope === "content" ? p.local : this.app.vault.configDir,
            ])
              if (
                dir &&
                dir !== "/" &&
                !(await this.app.vault.adapter.exists(dir))
              )
                await this.app.vault.createFolder(checked(dir));
          } catch (e) {
            rs.report(e, p.id);
          }
        }),
      );
    actions.addButton((b) => {
      b.setButtonText(t("save"))
        .setCta()
        .onClick(async () => {
          if (validateForm()) {
            await rs.put({ ...p }, true);
            back();
          }
        });
      el.addEventListener("input", () => b.setDisabled(!validateForm()), {
        signal: this.formSignal(),
      });
      b.setDisabled(!validateForm());
    });
    if (rs.config.profiles.some((x) => x.id === p.id))
      actions.addButton((b) =>
        b.setButtonText(t("remove")).onClick(() =>
          rs.confirm(t("removeText"), async () => {
            const profiles = rs.config.profiles.filter((x) => x.id !== p.id);
            await rs.save({
              ...rs.config,
              profiles,
              current:
                rs.config.current === p.id
                  ? (profiles[0]?.id ?? "")
                  : rs.config.current,
            });
            back();
          }),
        ),
      );
  }
  private formAbort?: AbortController;
  private formSignal() {
    this.formAbort?.abort();
    this.formAbort = new AbortController();
    return this.formAbort.signal;
  }
}
