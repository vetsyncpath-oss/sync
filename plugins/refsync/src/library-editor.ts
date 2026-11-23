import { Modal, Setting, Platform, type App } from "obsidian";
import { connectionFields } from "./connection-fields";
import { RemoteFolderBrowser } from "./remote-browser";
import type Studio from "./main";
import { type Profile } from "./model";
import { validate } from "./validator";
import {
  endpoint,
  bindPlace,
  linkField,
  validEndpoint,
  makeTemplate,
  applyTemplate,
  readTemplate,
  serializeTemplate,
  scenario,
  scenarios,
  type Place,
  type TaskTemplate,
} from "./task-library";
type Tr = (key: string) => string;
class InputDialog extends Modal {
  constructor(
    app: App,
    private t: Tr,
    private title: string,
    private value: string,
    private submit: (s: string) => Promise<void> | void,
    private json = false,
    private output = false,
  ) {
    super(app);
  }
  onOpen() {
    this.titleEl.setText(this.title);
    const row = new Setting(this.contentEl);
    if (this.json)
      row.addTextArea((c) => {
        c.inputEl.rows = 12;
        c.inputEl.cols = 45;
        c.inputEl.readOnly = this.output;
        c.setValue(this.value).onChange((v) => (this.value = v));
      });
    else
      row.addText((c) =>
        c.setValue(this.value).onChange((v) => (this.value = v)),
      );
    const status = this.contentEl.createEl("p", { attr: { role: "status" } });
    new Setting(this.contentEl)
      .addButton((b) =>
        b.setButtonText(this.t("cancel")).onClick(() => this.close()),
      )
      .addButton((b) =>
        b
          .setButtonText(this.t(this.output ? "copyJson" : "save"))
          .setCta()
          .onClick(async () => {
            if (!this.value.trim()) {
              status.setText(this.t("invalid"));
              return;
            }
            try {
              await this.submit(this.value.trim());
              this.close();
            } catch (e) {
              status.setText(
                this.t(
                  e instanceof Error && e.message === "invalidConfig"
                    ? "invalidConfig"
                    : "invalid",
                ),
              );
            }
          }),
      );
  }
}
export function placeTitle(p: Place, t: Tr) {
  const e = p.endpoint;
  return [
    t(
      e.cloud
        ? e.cloud.engine + "Private"
        : (e.remote?.engine ?? "vaultSource"),
    ),
    e.cloud?.root ?? e.remote?.url,
    e.reference,
  ]
    .filter(Boolean)
    .join(" · ");
}
function uses(rs: Studio, id: string) {
  return rs.config.profiles.filter(
    (p) => p.localPlace === id || p.referencePlace === id,
  );
}
async function storePlace(rs: Studio, place: Place) {
  validEndpoint(place.endpoint);
  const library = rs.config.library;
  const profiles = rs.config.profiles.map((p) => {
    if (p.localPlace !== place.id && p.referencePlace !== place.id) return p;
    const next = structuredClone(p);
    for (const s of ["local", "reference"] as const)
      if (p[linkField(s)] === place.id) {
        if (
          s === "reference" &&
          place.endpoint.access === "public" &&
          p.role === "publisher"
        )
          throw Error("readonly");
        bindPlace(next, s, place);
      }
    const invalid = validate(
      next,
      Platform.isDesktopApp,
      false,
      rs.app.vault.configDir,
    );
    if (invalid.length) throw Error(invalid[0].code);
    return next;
  });
  await rs.save({
    ...rs.config,
    profiles,
    library: {
      ...library,
      places: [...library.places.filter((p) => p.id !== place.id), place],
    },
  });
}
class PlaceEditor extends Modal {
  private draft: Profile;
  private name: string;
  constructor(
    private rs: Studio,
    private refresh: () => void,
    private old?: Place,
  ) {
    super(rs.app);
    this.draft = rs.newProfile();
    this.draft.reference = "/";
    this.name = old?.name ?? "";
    if (old) bindPlace(this.draft, "reference", old);
  }
  onOpen() {
    this.draw();
  }
  private draw() {
    const rs = this.rs,
      p = this.draft,
      t = rs.t,
      el = this.contentEl;
    el.empty();
    this.titleEl.setText(t(this.old ? "editPlace" : "newPlace"));
    new Setting(el)
      .setName(t("name"))
      .addText((c) => c.setValue(this.name).onChange((v) => (this.name = v)));
    connectionFields(
      el,
      rs,
      p,
      () => this.draw(),
      () => {},
      () => new Setting(el),
    );
    new Setting(el)
      .setName(t("reference"))
      .addText((c) =>
        c
          .setValue(p.reference)
          .onChange((v) => (p.reference = v.replace(/\\/g, "/"))),
      )
      .addButton((b) =>
        b.setButtonText(t("browse")).onClick(() => {
          try {
            new RemoteFolderBrowser(
              this.app,
              rs.browseStore(p, "reference"),
              t,
              (path) => {
                p.reference = path;
                this.draw();
              },
            ).open();
          } catch (e) {
            rs.report(e);
          }
        }),
      );
    const status = el.createEl("p", { attr: { role: "status" } });
    new Setting(el)
      .addButton((b) =>
        b.setButtonText(t("cancel")).onClick(() => this.close()),
      )
      .addButton((b) =>
        b
          .setButtonText(t("save"))
          .setCta()
          .onClick(async () => {
            try {
              const name = this.name.trim();
              if (
                !name ||
                rs.config.library.places.some(
                  (v) => v.id !== this.old?.id && v.name === name,
                )
              )
                throw Error("invalid");
              const place = {
                id: this.old?.id ?? crypto.randomUUID(),
                name,
                endpoint: endpoint(p, "reference"),
              };
              validEndpoint(place.endpoint);
              const apply = async () => {
                await storePlace(rs, place);
                this.close();
                this.refresh();
              };
              const linked = uses(rs, place.id);
              if (
                linked.length &&
                JSON.stringify(place.endpoint) !==
                  JSON.stringify(this.old?.endpoint)
              )
                rs.confirm(
                  t("replacePlace") +
                    " · " +
                    linked.map((v) => v.name).join(", "),
                  apply,
                );
              else await apply();
            } catch (e) {
              status.setText(t(e instanceof Error ? e.message : "invalid"));
            }
          }),
      );
  }
}
export function placeControl(
  el: HTMLElement,
  rs: Studio,
  p: Profile,
  side: "local" | "reference",
  refresh: () => void,
) {
  const t = rs.t,
    library = rs.config.library;
  const row = new Setting(el).setName(
    t(side === "local" ? "localBookmark" : "remoteBookmark"),
  );
  row.addDropdown((d) => {
    d.addOption("", t("customLocation"));
    for (const v of library.places)
      if (side === "reference" || v.endpoint.access === "local")
        d.addOption(v.id, v.name);
    d.setValue(p[linkField(side)] ?? "").onChange((id) => {
      if (id)
        bindPlace(
          p,
          side,
          library.places.find((v) => v.id === id)!,
        );
      else delete p[linkField(side)];
      refresh();
    });
  });
  row.addButton((b) =>
    b.setButtonText(t("saveLocation")).onClick(() => {
      const e = endpoint(p, side),
        current = library.places.find((v) => v.id === p[linkField(side)]);
      new InputDialog(
        rs.app,
        t,
        t("saveLocation"),
        current?.name ?? e.reference,
        async (name) => {
          validEndpoint(e);
          const existing = rs.config.library.places.find(
              (v) => v.name === name,
            ),
            place = {
              id: existing?.id ?? crypto.randomUUID(),
              name,
              endpoint: e,
            };
          const apply = async () => {
            await storePlace(rs, place);
            bindPlace(p, side, place);
            refresh();
          };
          if (existing) {
            rs.confirm(
              t("replacePlace") +
                " · " +
                name +
                " · " +
                uses(rs, place.id)
                  .map((p) => p.name)
                  .join(", "),
              apply,
            );
            return;
          }
          await apply();
        },
      ).open();
    }),
  );
}
export function templateControl(
  el: HTMLElement,
  rs: Studio,
  p: Profile,
  refresh: () => void,
) {
  const t = rs.t;
  const row = new Setting(el).setName(t("templates"));
  if (rs.config.library.templates.length)
    row.addDropdown((d) => {
      d.addOption("", t("useTemplate"));
      for (const v of rs.config.library.templates) d.addOption(v.id, v.name);
      d.onChange((id) => {
        const v = rs.config.library.templates.find((v) => v.id === id);
        if (v) {
          applyTemplate(p, v);
          refresh();
        }
      });
    });
  for (const kind of ["task", "scope"] as const)
    row.addButton((b) =>
      b
        .setButtonText(
          t(kind === "task" ? "saveTaskTemplate" : "saveScopeTemplate"),
        )
        .onClick(() => {
          new InputDialog(
            rs.app,
            t,
            t("templateName"),
            p.name,
            async (name) => {
              const template = makeTemplate(p, name, kind);
              readTemplate(serializeTemplate(template));
              const existing = rs.config.library.templates.find(
                (v) => v.name === name,
              );
              const write = async () => {
                if (existing) template.id = existing.id;
                await saveTemplate(rs, template);
                refresh();
              };
              if (existing)
                rs.confirm(t("replaceTemplate") + " · " + name, write);
              else await write();
            },
          ).open();
        }),
    );
}
const saveTemplate = (rs: Studio, v: TaskTemplate) =>
  rs.save({
    ...rs.config,
    library: {
      ...rs.config.library,
      templates: [
        ...rs.config.library.templates.filter((o) => o.id !== v.id),
        v,
      ],
    },
  });
export function libraryPage(
  el: HTMLElement,
  rs: Studio,
  section: "places" | "templates",
  refresh: () => void,
  edit: (p: Profile) => void,
) {
  const t = rs.t,
    lib = rs.config.library;
  if (section === "places") {
    new Setting(el).addButton((b) =>
      b
        .setButtonText(t("newPlace"))
        .setCta()
        .onClick(() => new PlaceEditor(rs, refresh).open()),
    );
    if (!lib.places.length) el.createEl("p", { text: t("locationsHelp") });
    for (const v of lib.places) {
      const users = uses(rs, v.id);
      const key = "refsync:place-check:" + v.id;
      const identity = JSON.stringify(v.endpoint);
      const row = new Setting(el).setName(v.name);
      const describe = () => {
        const last = rs.app.loadLocalStorage(key);
        row.setDesc(
          [
            placeTitle(v, t),
            ...users.map((p) => p.name),
            last?.identity === identity
              ? t(last.status) + " · " + new Date(last.at).toLocaleString()
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
        );
      };
      const record = (status: string) => {
        rs.app.saveLocalStorage(key, { identity, status, at: Date.now() });
        describe();
      };
      describe();
      row.addButton((b) =>
        b.setButtonText(t("checkAccess")).onClick(async () => {
          b.setDisabled(true);
          try {
            const p = rs.newProfile();
            bindPlace(p, "reference", v);
            const s = rs.browseStore(p, "reference");
            const stat = await s.stat(
              v.endpoint.reference === "/" ? "" : v.endpoint.reference,
            );
            if (stat?.type !== "folder") throw Error("missingRoot");
            await s.list(
              v.endpoint.reference === "/" ? "" : v.endpoint.reference,
            );
            record("accessible");
          } catch (e) {
            record("accessFailed");
            rs.report(e);
          } finally {
            b.setDisabled(false);
          }
        }),
      );
      row.addButton((b) =>
        b
          .setButtonText(t("editPlace"))
          .onClick(() => new PlaceEditor(rs, refresh, v).open()),
      );
      row.addButton((b) =>
        b.setButtonText(t("remove")).onClick(() =>
          rs.confirm(t("unlinkHelp") + " · " + v.name, async () => {
            const profiles = rs.config.profiles.map((p) => {
              if (p.localPlace !== v.id && p.referencePlace !== v.id) return p;
              const next = { ...p };
              if (next.localPlace === v.id) delete next.localPlace;
              if (next.referencePlace === v.id) delete next.referencePlace;
              return next;
            });
            await rs.save({
              ...rs.config,
              profiles,
              library: {
                ...rs.config.library,
                places: rs.config.library.places.filter((o) => o.id !== v.id),
              },
            });
            refresh();
          }),
        ),
      );
    }
    return;
  }
  const start = (v: TaskTemplate | string) => {
    const p = rs.newProfile();
    if (typeof v === "string") {
      scenario(p, v);
      p.name = t(v);
    } else {
      applyTemplate(p, v);
      p.name = v.name;
    }
    edit(p);
  };
  for (const key of scenarios)
    new Setting(el)
      .setName(t(key))
      .addButton((b) =>
        b.setButtonText(t("createTask")).onClick(() => start(key)),
      );
  new Setting(el).setName(t("userTemplates")).addButton((b) =>
    b.setButtonText(t("importJson")).onClick(() =>
      new InputDialog(
        rs.app,
        t,
        t("importJson"),
        "",
        async (raw) => {
          await saveTemplate(rs, readTemplate(raw));
          refresh();
        },
        true,
      ).open(),
    ),
  );
  for (const v of lib.templates) {
    const row = new Setting(el)
      .setName(v.name)
      .setDesc(t(v.kind === "task" ? "taskRules" : "scope"));
    row.addButton((b) =>
      b.setButtonText(t("createTask")).onClick(() => start(v)),
    );
    row.addButton((b) =>
      b.setButtonText(t("rename")).onClick(() =>
        new InputDialog(rs.app, t, t("name"), v.name, async (name) => {
          await saveTemplate(rs, { ...v, name });
          refresh();
        }).open(),
      ),
    );
    row.addButton((b) =>
      b
        .setButtonText(t("exportJson"))
        .onClick(() =>
          new InputDialog(
            rs.app,
            t,
            t("exportJson"),
            serializeTemplate(v),
            (s) => navigator.clipboard.writeText(s),
            true,
            true,
          ).open(),
        ),
    );
    row.addButton((b) =>
      b.setButtonText(t("remove")).onClick(() =>
        rs.confirm(t("remove") + " · " + v.name, async () => {
          await rs.save({
            ...rs.config,
            library: {
              ...rs.config.library,
              templates: rs.config.library.templates.filter(
                (o) => o.id !== v.id,
              ),
            },
          });
          refresh();
        }),
      ),
    );
  }
}
