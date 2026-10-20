// Runtime harness for UI/controller integration. Not shipped in the plugin bundle.
export class Notice {
  static messages: string[] = [];
  constructor(message: string) {
    Notice.messages.push(message);
  }
}
export class Plugin {
  app: any;
  manifest: any;
  persisted: any;
  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }
  async loadData() {
    return this.persisted;
  }
  async saveData(value: any) {
    this.persisted = structuredClone(value);
  }
  registerView() {}
  addRibbonIcon() {}
  addCommand() {}
  addSettingTab() {}
  registerEvent() {}
  registerInterval(id: number) {
    clearInterval(id);
  }
  addStatusBarItem() {
    return document.createElement("div");
  }
}
export class PluginSettingTab {
  containerEl = document.createElement("div");
  constructor(..._args: any[]) {}
}
export class Setting {}
export class ItemView {
  app: any;
  contentEl = document.createElement("div");
  constructor(leaf: any) {
    this.app = leaf.app;
    document.body.append(this.contentEl);
  }
}
export class Modal {
  contentEl = document.createElement("div");
  app: any;
  constructor(app: any) {
    this.app = app;
    this.contentEl.className = "modal-content";
  }
  onOpen() {}
  onClose() {}
  open() {
    document.body.append(this.contentEl);
    this.onOpen();
  }
  close() {
    this.onClose();
    this.contentEl.remove();
  }
}
export const Platform = { isDesktopApp: true };
export class App {}
export class WorkspaceLeaf {}
