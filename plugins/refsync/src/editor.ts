import { plainContent } from "./content-scope";
import { PluginFilters } from "./plugin-filters";
import { placeControl, templateControl, libraryPage } from "./library-editor";
import {
  deletionPolicy,
  applyPolicy,
  detachEdited,
  endpointLabels,
} from "./task-library";
import { inspectPath } from "./path-inspector";
import { contentEditor } from "./content-editor";
import { AccountsView } from "./oauth-ui";
import { connectionFields } from "./connection-fields";
import { RemoteFolderBrowser } from "./remote-browser";

import { restrictionSummary, scopeEditor } from "./scope-editor";
import { legacyConfig } from "./config-scope";
import { PluginSettingTab, Setting, Platform, type App } from "obsidian";
import type SyncStudio from "./main";
import { checked, type Profile } from "./model";

import { validate } from "./validator";
export class Editor extends PluginSettingTab {
  private draft?: Profile;
  private home: "profiles" | "places" | "templates" = "profiles";
  private section = "endpoints";
  private editDraft(p: Profile) {
    this.draft = p;
    this.section = "endpoints";
    this.display();
  }
  private summary(p: Profile) {
    const rs = this.plugin,
      t = rs.t;
    const account =
      p.cloud && rs.accounts.list().find((a) => a.id === p.cloud!.account);
    const [from, to] = endpointLabels(
      p,
      this.app.vault.configDir,
      t,
      account?.label,
    );
    const c = p.config ?? legacyConfig();
    const limits = restrictionSummary(c, t);
    const scope =
      p.scope === "settings"
        ? [t("settings"), ...c.categories.map((k) => t("cat_" + k)), limits]
        : [
            t(p.content?.base === "selected" ? "onlySelected" : "allExcept"),
            ...(p.content?.rules ?? [])
              .slice(0, 3)
              .map((r) => (r.include ? "+ " : "− ") + r.path),
            ...(p.content?.rules.length && p.content.rules.length > 3
              ? ["…"]
              : []),
            p.content?.config ? this.app.vault.configDir : "",
            p.content?.hidden ? t("otherHidden") : "",
            p.include,
            p.exclude ? "− " + p.exclude : "",
            p.maxMiB ? p.maxMiB + " MiB" : "",
          ];
    return [
      from + " → " + to,
      scope.filter(Boolean).join(" · "),
      t(deletionPolicy(p)) + (p.deletions ? " → " + to : ""),
      t(p.inheritMode ? rs.config.mode : p.mode),
      p.firstPlan ? t("firstPlan") : "",
      p.startup ? t("startup") : "",
      p.intervalMinutes ? p.intervalMinutes + " " + t("minutesUnit") : "",
      p.scope === "content" && p.onFocus ? t("onFocus") : "",
      p.scope === "content" && p.onOnline ? t("onOnline") : "",
      p.scope === "content" && p.fileEvents ? t("fileEvents") : "",
      !p.enabled ? t("inactive") : "",
      rs.config.paused ? t("paused") : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  constructor(
    app: App,
    private plugin: SyncStudio,
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
    el.addClass("sync-studio-editor");
    if (this.draft) {
      this.edit(this.draft);
      return;
    }
    el.createEl("h2", { text: "Sync Studio" });
    const nav = new Setting(el).setClass("sync-studio-nav");
    for (const key of ["profiles", "places", "templates"] as const)
      nav.addButton((b) =>
        b
          .setButtonText(t(key))
          .setDisabled(this.home === key)
          .onClick(() => {
            this.home = key;
            this.display();
          }),
      );
    nav.addButton((b) =>
      b.setButtonText(t("history")).onClick(() => rs.openHistory()),
    );
    if (this.home !== "profiles") {
      libraryPage(
        el,
        rs,
        this.home,
        () => this.display(),
        (p) => {
          this.home = "profiles";
          this.editDraft(p);
        },
      );
      return;
    }
    new Setting(el).addButton((b) =>
      b
        .setButtonText(t("accounts"))
        .onClick(() =>
          new AccountsView(this.app, rs, () => this.display()).open(),
        ),
    );
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
          this.display();
        }),
    );
    new Setting(el).setName(t("pause")).addToggle((c) =>
      c.setValue(rs.config.paused).onChange(async (paused) => {
        await rs.save({ ...rs.config, paused });
        this.display();
      }),
    );
    new Setting(el)
      .addButton((b) =>
        b
          .setButtonText(t("add"))
          .setCta()
          .onClick(() => {
            this.editDraft(rs.newProfile());
          }),
      )
      .addButton((b) =>
        b.setButtonText(t("syncAll")).onClick(() => rs.runAll()),
      );
    rs.config.profiles.forEach((p, index) => {
      const account = p.cloud
        ? rs.accounts.list().find((a) => a.id === p.cloud?.account)
        : undefined;
      const row = new Setting(el)
        .setName(p.name)
        .setDesc(
          this.summary(p) +
            (p.cloud && (!account || account.needsLogin)
              ? " · " + t("loginRequired")
              : ""),
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
          this.editDraft(structuredClone(p));
        }),
      );
      row.addExtraButton((b) =>
        b
          .setIcon("copy")
          .setTooltip(t("duplicate"))
          .onClick(() => {
            this.editDraft(rs.newProfile(p));
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
            .setButtonText(t("fullCheck"))
            .onClick(() => rs.request(p.id, "diagnose")),
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
      root = this.containerEl;
    root.createEl("h2", { text: p.name });
    const summary = root.createEl("p", { cls: "sync-studio-summary" });
    const nav = new Setting(root).setClass("sync-studio-nav"),
      panels = new Map<string, HTMLElement>();
    const section = (key: string) => {
      const panel = root.createDiv();
      panels.set(key, panel);
      panel.hidden = key !== this.section;
      nav.addButton((b) =>
        b
          .setButtonText(t(key))
          .setDisabled(key === this.section)
          .onClick(() => {
            this.section = key;
            this.display();
          }),
      );
      return panel;
    };
    let el = section("endpoints");
    const fields = new Map<S, Setting>();
    const fieldRow = (k: S) => {
      const row = new Setting(el);
      fields.set(k, row);
      return row;
    };
    const back = () => {
      this.draft = undefined;
      this.display();
    };
    type S = keyof Profile;
    const text = (field: S, key: string) =>
      fieldRow(field)
        .setName(t(key))
        .addText((c) =>
          c.setValue(String(p[field])).onChange((v) => {
            Object.assign(p, {
              [field]:
                field === "reference" || field === "local"
                  ? v.replace(/\\/g, "/")
                  : v,
            });
            detachEdited(p, rs.config.library);
            validateForm();
          }),
        );
    const num = (field: S, key: string) =>
      fieldRow(field)
        .setName(t(key))
        .addText((c) => {
          c.inputEl.type = "number";
          c.inputEl.min = "0";
          c.setValue(String(p[field])).onChange((v) => {
            Object.assign(p, { [field]: v.trim() === "" ? NaN : Number(v) });
            validateForm();
          });
        });
    const toggle = (field: S, key: string, disabled = false) =>
      fieldRow(field)
        .setName(t(key))
        .addToggle((c) =>
          c
            .setDisabled(disabled)
            .setValue(p[field] === true)
            .onChange((v) => {
              Object.assign(p, { [field]: v });
              if (
                [
                  "firstPlan",
                  "startup",
                  "fileEvents",
                  "onFocus",
                  "onOnline",
                  "silentDeletionSafeguard",
                ].includes(field)
              ) {
                this.display();
                return;
              }
              validateForm();
            }),
        );
    const choice = (
      field: S,
      key: string,
      values: string[],
      disabled = false,
    ) =>
      fieldRow(field)
        .setName(t(key))
        .addDropdown((d) => {
          for (const v of values)
            d.addOption(
              v,
              t(field === "conflict" && v === "target" ? "targetVersion" : v),
            );
          d.setValue(
            field === "scope" && p.scope === "content" && p.content?.config
              ? "contentFiles"
              : String(p[field]),
          )
            .setDisabled(disabled)
            .onChange((v) => {
              if (field === "scope") {
                p.scope = v === "settings" ? "settings" : "content";
                if (p.scope === "content")
                  p.content = {
                    ...(p.content ?? plainContent()),
                    config: v === "contentFiles",
                  };
              } else Object.assign(p, { [field]: v });
              if (p.mirror === "full") {
                p.conflict = "source";
                p.deletions = true;
              }
              if (p.scope === "settings") {
                p.fileEvents = p.onFocus = p.onOnline = false;
                if (field === "scope" && !p.config) {
                  p.config = {
                    ...legacyConfig(),
                    categories: legacyConfig().categories,
                    legacyThemes: false,
                    strategy: "batch",
                  };

                  p.onFocus = false;
                  p.onOnline = false;
                }
                if (p.conflict === "both") p.conflict = "source";
              }
              this.display();
            });
        });

    text("name", "name");
    toggle("enabled", "enabled");
    placeControl(el, rs, p, "reference", () => this.display());
    connectionFields(
      el,
      rs,
      p,
      () => this.display(),
      () => validateForm(),
      fieldRow,
    );
    const remote = p.access === "public" ? p.remote : undefined;
    choice("role", "role", ["subscriber", "publisher"], !!remote);
    text(
      "reference",
      remote || p.access === "oauth" ? "subfolder" : "reference",
    );
    const browse = (side: "local" | "reference") =>
      new Setting(el).addButton((b) =>
        b
          .setButtonText(t(side === "local" ? "browseLocal" : "browse"))
          .onClick(() => {
            try {
              new RemoteFolderBrowser(
                this.app,
                rs.browseStore(p, side),
                t,
                (path) => {
                  p[side] = path;
                  delete p[side === "local" ? "localPlace" : "referencePlace"];
                  this.display();
                },
              ).open();
            } catch (e) {
              rs.report(e, p.id);
            }
          }),
      );
    browse("reference");
    if (p.scope === "settings")
      new Setting(el).setName(t("target")).setDesc(this.app.vault.configDir);
    else {
      placeControl(el, rs, p, "local", () => this.display());
      text("local", "target");
      browse("local");
    }
    templateControl(el, rs, p, () => this.display());
    el = section("composition");
    choice("scope", "scope", ["content", "settings", "contentFiles"]);
    el.createEl("p", {
      text: t(
        p.scope === "settings" ? "settingsProcessing" : "contentProcessing",
      ),
    });
    if (p.scope === "settings")
      scopeEditor(
        el,
        p,
        t,
        () => this.display(),
        () => validateForm(),
        () =>
          new PluginFilters(
            this.app,
            p.config!,
            () => rs.folderSources(p),
            rs.manifest.id,
            t,
            () => this.display(),
          ).open(),
      );
    if (p.scope === "content") {
      contentEditor(
        el,
        p,
        this.app,
        rs.manifest.id,
        t,
        () => rs.folderSources(p),
        () => this.display(),
      );
      const types = {
        allTypes: "",
        markdownType: "**/*.md",
        imageType: ["png", "jpg", "jpeg", "gif", "webp", "svg"]
          .map((ext) => "**/*." + ext)
          .join(","),
      };
      new Setting(el).setName(t("fileType")).addDropdown((d) => {
        for (const k of [...Object.keys(types), "customTypes"])
          d.addOption(k, t(k));
        d.setValue(
          Object.entries(types).find(([, v]) => v === p.include)?.[0] ??
            "customTypes",
        ).onChange((k) => {
          if (k === "customTypes") {
            fields.get("include")?.settingEl.querySelector("input")?.focus();
            return;
          }
          p.include = types[k as keyof typeof types];
          this.display();
        });
      });
      text("include", "include");
      text("exclude", "exclude");
      num("maxMiB", "maxMiB");
    }
    el = section("taskRules");
    fieldRow("mirror")
      .setName(t("mirrorMode"))
      .addDropdown((d) => {
        for (const key of ["copyOnly", "tracked", "full"])
          d.addOption(key, t(key));
        d.setValue(deletionPolicy(p)).onChange((v) => {
          applyPolicy(p, v);
          this.display();
        });
      });
    if (p.mirror !== "full")
      choice(
        "conflict",
        "conflict",
        p.scope === "content"
          ? ["source", "target", "newer", "both"]
          : ["source", "target", "newer"],
      );
    if (p.deletions) {
      toggle("silentDeletionSafeguard", "silentDeletionSafeguard").setDesc(
        t("silentDeletionSafeguardHelp"),
      );
      if (
        (p.inheritMode ? rs.config.mode : p.mode) !== "silent" ||
        p.silentDeletionSafeguard ||
        p.firstPlan
      ) {
        num("maxDeleteCount", "maxDeleteCount");
        num("maxDeletePercent", "maxDeletePercent");
        num("deleteGrace", "deleteGrace");
        num("shrinkPercent", "shrinkPercent");
      }
      choice("trash", "trash", ["plugin", "vault", "system", "permanent"]);
      if (p.trash === "plugin") num("trashDays", "trashDays");
    }
    if (p.scope === "settings") toggle("strictDrift", "strictDrift");
    el = section("schedule");
    new Setting(el).setName(t("mode")).addDropdown((d) => {
      for (const k of ["inherit", "plan", "silent"]) d.addOption(k, t(k));
      d.setValue(p.inheritMode ? "inherit" : p.mode).onChange((v) => {
        p.inheritMode = v === "inherit";
        if (v !== "inherit") p.mode = v === "silent" ? "silent" : "plan";
        this.display();
      });
    });
    toggle("firstPlan", "firstPlan");
    toggle("startup", "startup");
    if (p.startup) num("startupSeconds", "startupSeconds");
    num("intervalMinutes", "intervalMinutes");
    if (p.scope === "content") {
      toggle("onFocus", "onFocus");
      toggle("onOnline", "onOnline");
      toggle("fileEvents", "fileEvents");
      if (p.onFocus || p.onOnline || p.fileEvents)
        num("debounceSeconds", "debounceSeconds");
      if (p.role === "subscriber") {
        num("quietSeconds", "quietSeconds");
        num("maxDeferrals", "maxDeferrals");
      }
    }
    el = section("diagnostics");
    el.createEl("p", { text: t("diagnosisHelp") });
    // Imported profiles and edits to a subsequently hidden field can still fail validation.
    for (const problem of validate(
      p,
      Platform.isDesktopApp,
      false,
      this.app.vault.configDir,
    ))
      if (!fields.has(problem.field) && typeof p[problem.field] === "number")
        num(problem.field, problem.field);
    inspectPath(el, rs, p);
    new Setting(el).setName(t("draftPreview")).addButton((b) =>
      b.setButtonText(t("dry")).onClick(async () => {
        if (!validateForm()) return;
        b.setDisabled(true);
        try {
          await rs.previewDraft(p);
        } catch (e) {
          rs.report(e, p.id);
        } finally {
          b.setDisabled(false);
        }
      }),
    );
    const error = root.createEl("p", { attr: { role: "status" } }),
      actions = new Setting(el);
    const validateForm = () => {
      const errors = validate(
        p,
        Platform.isDesktopApp,
        false,
        this.app.vault.configDir,
      );
      summary.setText(this.summary(p));
      root
        .querySelectorAll(".sync-studio-field-error")
        .forEach((n) => n.remove());
      error.empty();
      for (const err of errors) {
        const field =
          fields.get(err.field) ??
          fields.get(err.field === "config" ? "scope" : "access");
        const row =
          (err.code === "overlaySyntax" &&
            root.querySelector<HTMLElement>(".sync-studio-overlay")) ||
          field?.settingEl;
        row?.createEl("small", {
          text: t(err.code),
          cls: "sync-studio-field-error",
        });
        const panel =
          [...panels].find(([, el]) => row && el.contains(row))?.[0] ??
          "endpoints";
        error.createEl("button", {
          text: t(panel) + " · " + t(err.code),
        }).onclick = () => {
          this.section = panel;
          this.display();
          if (err.code === "overlaySyntax") {
            const overlay = root.querySelector<HTMLElement>(
              ".sync-studio-overlay",
            );
            const details = overlay?.closest("details");
            if (details) details.open = true;
            overlay?.querySelector("textarea")?.focus();
          }
        };
      }
      return !errors.length;
    };
    actions.addButton((b) =>
      b.setButtonText(t("init")).onClick(async () => {
        if (!validateForm()) return;
        try {
          const missing: string[] = [];
          const dirs = [
            p.access === "local" ? p.reference : "",
            p.scope === "content" ? p.local : this.app.vault.configDir,
          ];
          for (const dir of dirs)
            if (
              dir &&
              dir !== "/" &&
              !(await this.app.vault.adapter.exists(dir))
            )
              missing.push(dir);
          const cloud =
            p.access === "oauth" &&
            p.role === "publisher" &&
            p.reference &&
            p.reference !== "/" &&
            !(await rs.accountReference(p, "", true).stat(p.reference));
          if (!cloud && !missing.length) {
            b.setButtonText(t("accessible"));
            return;
          }
          rs.confirm(
            t("createNow") +
              " · " +
              [
                ...missing,
                ...(cloud ? [p.cloud?.engine + " / " + p.reference] : []),
              ].join(", "),
            async () => {
              if (cloud) await rs.accountReference(p, "").mkdir(p.reference);
              for (const dir of missing)
                if (!(await this.app.vault.adapter.exists(dir)))
                  await this.app.vault.createFolder(checked(dir));
            },
          );
        } catch (e) {
          rs.report(e, p.id);
        }
      }),
    );
    const footer = new Setting(root).addButton((b) =>
      b.setButtonText(t("cancel")).onClick(back),
    );
    footer.addButton((b) => {
      b.setButtonText(t("save"))
        .setCta()
        .onClick(async () => {
          if (validateForm()) {
            await rs.put({ ...p }, true);
            back();
          }
        });
      root.addEventListener("input", () => b.setDisabled(!validateForm()), {
        signal: this.formSignal(),
      });
      b.setDisabled(!validateForm());
    });
    if (rs.config.profiles.some((x) => x.id === p.id))
      footer.addButton((b) =>
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
