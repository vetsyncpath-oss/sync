import { collisionNames } from "./path-collision";
import { Setting, Platform } from "obsidian";
import type Studio from "./main";
import type { Profile } from "./model";
import { safe, parent, fold } from "./model";
import { selectionReason } from "./classifier";
import { pathFilter } from "./filters";
import { legacyConfig, mobileExcluded } from "./config-scope";
import { RunBudget } from "./runtime";
export function inspectPath(el: HTMLElement, rs: Studio, p: Profile) {
  const t = rs.t,
    row = new Setting(el).setName(t("whyPath")).setDesc(t("whyPathHelp")),
    result = el.createEl("p", { attr: { role: "status" } });
  let path = "";
  row.addText((c) =>
    c.setPlaceholder("Projects/note.md").onChange((v) => {
      path = v.trim().replace(/\\/g, "/");
      result.empty();
    }),
  );
  row.addButton((b) =>
    b.setButtonText(t("checkPath")).onClick(async () => {
      const key = path;
      if (!safe(key)) {
        result.setText(t("path"));
        return;
      }
      b.setDisabled(true);
      result.setText(t("scan"));
      try {
        const sides = rs.folderSources(p),
          budget = new RunBudget(undefined, 30000, []),
          cfg = p.config ?? legacyConfig(),
          filter = pathFilter(p);
        const blocked =
          p.scope === "settings" && !Platform.isDesktopApp && cfg.platformFilter
            ? await mobileExcluded(sides[0], sides[1], budget)
            : [];
        const findings = await Promise.all(
          sides.map(async (s, i) => {
            const label = t(i === 0 ? "target" : "reference");
            try {
              const stat = await budget.io(() => s.stat(key));
              if (!stat) return label + " · " + t("pathAbsent");
              let reason = selectionReason(
                key,
                p.scope,
                rs.app.vault.configDir,
                rs.manifest.id,
                stat.type === "folder",
                cfg,
                p.content,
              );
              for (
                let d = parent(key);
                reason === "included" && d;
                d = parent(d)
              )
                reason = selectionReason(
                  d,
                  p.scope,
                  rs.app.vault.configDir,
                  rs.manifest.id,
                  true,
                  cfg,
                  p.content,
                );
              if (
                reason === "included" &&
                p.scope === "content" &&
                !(stat.type === "folder" ? filter.directory(key) : filter(key))
              )
                return label + " · " + t("maskRule");
              if (
                reason === "included" &&
                p.scope === "content" &&
                stat.type === "file" &&
                p.maxMiB > 0 &&
                stat.size > p.maxMiB * 1048576
              )
                return label + " · " + t("sizeRule");
              if (
                reason === "included" &&
                fold(key).startsWith("plugins/") &&
                blocked.includes(fold(key).split("/")[1])
              )
                return label + " · " + t("mobileFilter");
              return label + " · " + t(reason);
            } catch (e) {
              return (
                label + " · " + t(e instanceof Error ? e.message : "failed")
              );
            }
          }),
        );
        if (findings.some((v) => v.endsWith(" · " + t("included")))) {
          const matches = await collisionNames(sides, key, budget);
          if (matches.length) {
            if (key === path)
              result.setText(t("collision") + " · " + matches.join(" / "));
            return;
          }
        }
        if (key === path) result.setText(findings.join("  |  "));
      } catch (e) {
        result.setText(t(e instanceof Error ? e.message : "failed"));
      } finally {
        b.setDisabled(false);
      }
    }),
  );
}
