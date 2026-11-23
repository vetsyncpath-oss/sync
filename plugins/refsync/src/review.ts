import { project, parseOverlay } from "./json-overlay";
import { needsReload } from "./verify-settings";
import { Modal, Setting, type App } from "obsidian";
import { diffLines } from "diff";
import type { Profile, StorageProvider } from "./model";
import type { Plan, Action, Op } from "./planner";
import type { Choices } from "./selection";
type Tr = (key: string) => string;
export class Review extends Modal {
  private choices = new Map<string, Action | "skip">();
  private query = "";
  private filter = "all";
  private page = 0;
  constructor(
    app: App,
    private p: Profile,
    private plan: Plan,
    private tr: Tr,
    private endpoints: () => [StorageProvider, StorageProvider],
    private closed: () => void,
    private apply?: (choices: Choices, held: Set<string>) => void,
    private releaseOnly = false,
  ) {
    super(app);
  }
  private released = new Set<string>();
  onOpen() {
    this.titleEl.setText(
      this.tr(this.apply ? "preview" : "dry") + " · " + this.p.name,
    );
    if (
      this.p.scope === "settings" &&
      this.plan.ops.some(
        (o) => ["write", "delete"].includes(o.action) && needsReload(o.path),
      )
    )
      this.contentEl.createEl("p", { text: this.tr("reloadNeeded") });
    if (this.p.access === "oauth" && this.p.role === "publisher")
      this.contentEl.createEl("p", { text: this.tr("publishHint") });
    const metrics = this.contentEl.createEl("p"),
      toolbar = new Setting(this.contentEl);
    toolbar.addSearch((s) =>
      s.setPlaceholder(this.tr("search")).onChange((v) => {
        this.query = v.toLowerCase();
        this.page = 0;
        render();
      }),
    );
    toolbar.addDropdown((d) => {
      for (const k of ["all", "conflict", "delete"]) d.addOption(k, this.tr(k));
      d.onChange((v) => {
        this.filter = v;
        this.page = 0;
        render();
      });
    });
    const body = this.contentEl.createDiv(),
      pager = new Setting(this.contentEl),
      foot = new Setting(this.contentEl);
    const ops = this.plan.ops.filter(
      (o) => o.action !== "ack" && !this.releaseOnly,
    );
    const held = this.plan.held;
    const eligible = (o: Op) =>
      o.path.toLowerCase().includes(this.query) &&
      (this.filter === "all" ||
        (this.filter === "conflict" && o.conflict) ||
        (this.filter === "delete" && ["delete", "rmdir"].includes(o.action)));
    const filtered = () => ops.filter(eligible);
    if (this.apply && !this.releaseOnly)
      toolbar.addButton((b) =>
        b.setButtonText(this.tr("toggleVisible")).onClick(() => {
          const list = filtered(),
            off = list.some((o) => this.choices.get(o.path) !== "skip");
          for (const op of list)
            if (off) this.choices.set(op.path, "skip");
            else this.choices.delete(op.path);
          render();
        }),
      );
    const render = () => {
      body.empty();
      pager.clear();
      const rows = filtered();
      const heldRows = held.filter(
        (p) =>
          p.toLowerCase().includes(this.query) && this.filter !== "conflict",
      );
      const all = [
        ...rows.map((op) => ({ op, path: op.path })),
        ...heldRows.map((path) => ({ path, op: null })),
      ];
      const selected = ops.filter((o) => this.choices.get(o.path) !== "skip");
      metrics.setText(
        [
          [this.tr("selected"), selected.length + this.released.size],
          [
            this.tr("write"),
            selected.filter((o) =>
              ["write", "both"].includes(this.choices.get(o.path) ?? o.action),
            ).length,
          ],
          [this.tr("conflict"), selected.filter((o) => o.conflict).length],
          [
            this.tr("delete"),
            selected.filter((o) => ["delete", "rmdir"].includes(o.action))
              .length + this.released.size,
          ],
          [this.tr("held"), held.length],
          [this.tr("deferred"), this.plan.deferred.length],
        ]
          .map((pair) => pair.join(" "))
          .join(" · "),
      );
      this.page = Math.min(
        this.page,
        Math.max(0, Math.ceil(all.length / 50) - 1),
      );
      if (!all.length) body.createEl("p", { text: this.tr("none") });
      for (const { op, path } of all.slice(
        this.page * 50,
        (this.page + 1) * 50,
      )) {
        const row = new Setting(body)
          .setName(path)
          .setDesc(
            this.tr(op ? (op.conflict ? "conflict" : op.action) : "held") +
              (!op && this.plan.heldFolders?.includes(path)
                ? " · " + this.tr("rmdir")
                : ""),
          );
        if (!op) {
          if (this.releaseOnly)
            row.addToggle((c) =>
              c.setValue(this.released.has(path)).onChange((on) => {
                if (on) this.released.add(path);
                else this.released.delete(path);
                render();
              }),
            );
          continue;
        }
        if (this.apply)
          row.addToggle((c) =>
            c.setValue(this.choices.get(path) !== "skip").onChange((on) => {
              if (on) this.choices.delete(path);
              else this.choices.set(path, "skip");
              render();
            }),
          );
        if (
          this.apply &&
          op.conflict &&
          this.p.mirror !== "full" &&
          this.choices.get(path) !== "skip"
        ) {
          row.addDropdown((d) => {
            for (const a of this.p.scope === "content"
              ? ["write", "retain", "both"]
              : ["write", "retain"])
              d.addOption(a, this.tr(a));
            d.setValue(this.choices.get(path) ?? op.action).onChange((v) => {
              this.choices.set(path, v as Action);
              render();
            });
          });
        }
        if (op.action !== "mkdir" && op.action !== "rmdir")
          row.addButton((b) =>
            b.setButtonText(this.tr("diff")).onClick(() => void this.diff(op)),
          );
      }
      if (all.length > 50) {
        pager.setName(this.page + 1 + " / " + Math.ceil(all.length / 50));
        pager
          .addButton((b) =>
            b
              .setButtonText("←")
              .setDisabled(this.page === 0)
              .onClick(() => {
                this.page--;
                render();
              }),
          )
          .addButton((b) =>
            b
              .setButtonText("→")
              .setDisabled((this.page + 1) * 50 >= all.length)
              .onClick(() => {
                this.page++;
                render();
              }),
          );
      }
    };
    foot.addButton((b) =>
      b.setButtonText(this.tr("export")).onClick(async () => {
        const data = JSON.stringify(
          {
            profile: this.p.name,
            plan: this.plan,
            choices: Object.fromEntries(this.choices),
            release: [...this.released],
          },
          null,
          2,
        );
        try {
          await navigator.clipboard.writeText(data);
        } catch {
          const box = this.contentEl.createEl("textarea");
          box.value = data;
          box.select();
        }
      }),
    );
    foot.addButton((b) =>
      b.setButtonText(this.tr("close")).onClick(() => this.close()),
    );
    if (this.apply)
      foot.addButton((b) =>
        b
          .setButtonText(
            this.tr(this.releaseOnly ? "release" : "applySelected"),
          )
          .setCta()
          .onClick(() => {
            this.apply!(this.choices, this.released);
            this.close();
          }),
      );
    render();
  }
  private async diff(op: Op) {
    const popup = new Modal(this.app);
    popup.titleEl.setText(op.path);
    popup.open();
    const out = popup.contentEl.createEl("pre");
    out.style.whiteSpace = "pre-wrap";
    const meta = [
      this.tr("target") +
        " · " +
        (op.target
          ? op.target.size +
            " B · " +
            new Date(op.target.mtime).toLocaleString() +
            " · " +
            op.target.hash
          : "—"),
      this.tr("reference") +
        " · " +
        (op.source
          ? op.source.size +
            " B · " +
            new Date(op.source.mtime).toLocaleString() +
            " · " +
            op.source.hash
          : "—"),
    ].join("\n");
    out.setText(meta);
    if (
      !/\.(md|txt|json|css|ya?ml|csv|js|html|xml)$/i.test(op.path) ||
      Math.max(op.target?.size ?? 0, op.source?.size ?? 0) > 131072
    )
      return;
    try {
      const [source, target] = this.endpoints(),
        read = async (s: StorageProvider) => {
          let bytes = await s.download(op.path);
          if (this.p.scope === "settings" && op.path.endsWith(".json"))
            return JSON.stringify(
              JSON.parse(
                new TextDecoder().decode(
                  project(op.path, bytes, {
                    self: "refsync",
                    blocked: [],
                    rules: parseOverlay(this.p.config?.overlay ?? ""),
                  }),
                ),
              ),
              null,
              2,
            );
          return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        };
      const [before, after] = await Promise.all([
        op.target ? read(target) : "",
        op.source ? read(source) : "",
      ]);
      const parts = diffLines(before, after, { timeout: 150 });
      if (parts)
        out.setText(
          parts
            .flatMap((part) =>
              (part.value.match(/[^\n]*\n|[^\n]+$/g) ?? []).map(
                (line) =>
                  (part.added ? "+ " : part.removed ? "− " : "  ") + line,
              ),
            )
            .join(""),
        );
    } catch {
      /* Binary data and unavailable previews retain their metadata. */
    }
  }
  onClose() {
    this.contentEl.empty();
    this.closed();
  }
}
