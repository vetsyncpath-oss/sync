import { Modal, Setting, type App } from "obsidian";
import { parent, type StorageProvider } from "./model";
export class RemoteFolderBrowser extends Modal {
  private sequence = 0;
  constructor(
    app: App,
    private source: StorageProvider,
    private tr: (s: string) => string,
    private choose: (path: string) => void,
  ) {
    super(app);
  }
  onOpen() {
    void this.show("");
  }
  onClose() {
    this.sequence++;
    this.contentEl.empty();
  }
  private async show(path: string) {
    const seq = ++this.sequence,
      el = this.contentEl,
      t = this.tr;
    el.empty();
    this.titleEl.setText(t("browse"));
    el.createEl("p", { text: "/" + path });
    if (path)
      new Setting(el).addButton((b) =>
        b.setButtonText(t("upFolder")).onClick(() => this.show(parent(path))),
      );
    const status = el.createEl("p", {
      text: t("scan"),
      attr: { role: "status" },
    });
    try {
      const { folders } = await this.source.list(path);
      if (seq !== this.sequence) return;
      status.remove();
      new Setting(el).addButton((b) =>
        b
          .setButtonText(t("useFolder"))
          .setCta()
          .onClick(() => {
            this.choose(path || "/");
            this.close();
          }),
      );
      for (const folder of folders.sort((a, b) => a.localeCompare(b)))
        new Setting(el)
          .setName(folder.slice(path ? path.length + 1 : 0))
          .addButton((b) =>
            b.setButtonText(t("openFolder")).onClick(() => this.show(folder)),
          );
    } catch (e) {
      if (seq !== this.sequence) return;
      status.setText(t(e instanceof Error ? e.message : "failed"));
    }
  }
}
