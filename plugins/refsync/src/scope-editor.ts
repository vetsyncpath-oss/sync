import { Setting } from "obsidian";
import {
  categories,
  legacyConfig,
  preset,
  type ConfigScope,
} from "./config-scope";
import type { Profile } from "./model";
type Tr = (key: string) => string;
export function scopeEditor(
  el: HTMLElement,
  p: Profile,
  t: Tr,
  redraw: () => void,
  validate: () => void,
) {
  const c = (p.config ??= legacyConfig());
  el.createEl("h3", { text: t("settings") });
  const sets = ["full", "noData", "look", "plugins"];
  const selected =
    sets.find(
      (s) =>
        preset(s).length === c.categories.length &&
        preset(s).every((k) => c.categories.includes(k)),
    ) ?? "custom";
  new Setting(el).setName(t("scopePreset")).addDropdown((d) => {
    for (const s of [...sets, "custom"]) d.addOption(s, t("preset_" + s));
    d.setValue(selected).onChange((v) => {
      if (v !== "custom") {
        c.categories = preset(v);
        c.legacyThemes = false;
        redraw();
      }
    });
  });
  for (const k of categories)
    new Setting(el)
      .setName(t("cat_" + k))
      .setDesc(
        ["core", "appearance", "data", "community"].includes(k) ? "H" : "S",
      )
      .addToggle((x) =>
        x.setValue(c.categories.includes(k)).onChange((on) => {
          c.categories = on
            ? [...c.categories, k]
            : c.categories.filter((i) => i !== k);
          if (k === "themes") c.legacyThemes = false;
          redraw();
        }),
      );
  if (
    !c.categories.includes("code") &&
    c.categories.some((k) => k === "data" || k === "community")
  )
    el.createEl("p", { text: t("existingCode") });
  const input = (
    k:
      | "codeAllow"
      | "codeDeny"
      | "dataAllow"
      | "dataDeny"
      | "include"
      | "exclude"
      | "overlay",
  ) =>
    new Setting(el).setName(t("cfg_" + k)).addTextArea((a) =>
      a.setValue(c[k]).onChange((v) => {
        c[k] = v;
        validate();
      }),
    );
  for (const k of [
    "codeAllow",
    "codeDeny",
    "dataAllow",
    "dataDeny",
    "include",
    "exclude",
    "overlay",
  ] as const)
    input(k);
  new Setting(el).setName(t("mobileFilter")).addToggle((x) =>
    x.setValue(c.platformFilter).onChange((v) => {
      c.platformFilter = v;
    }),
  );
  new Setting(el).setName(t("strategy")).addDropdown((d) => {
    for (const k of ["batch", "changes"] as const) d.addOption(k, t(k));
    d.setValue(c.strategy).onChange((v) => {
      c.strategy = v as ConfigScope["strategy"];
    });
  });
  new Setting(el).setName(t("reloadPolicy")).addDropdown((d) => {
    for (const k of ["next", "now", "idle", "never"] as const)
      d.addOption(k, t("reload_" + k));
    d.setValue(c.reload).onChange((v) => {
      c.reload = v as ConfigScope["reload"];
    });
  });
  new Setting(el).setName(t("idleDelay")).addText((a) => {
    a.inputEl.type = "number";
    a.setValue(String(c.idleSeconds)).onChange((v) => {
      c.idleSeconds = Number(v);
      validate();
    });
  });
}
