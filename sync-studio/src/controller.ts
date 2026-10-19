import {
  App,
  Notice,
  Plugin,
  Platform,
  PluginSettingTab,
  Setting,
} from "obsidian";
import type {
  Baseline,
  Connection,
  PendingOperation,
  Persisted,
  Plan,
  Profile,
  Store,
} from "./core/model";
import { newProfile } from "./core/model";
import { plan, policyKey } from "./core/planner";
import { recover } from "./core/recovery";
import { StateFile } from "./adapters/state-file";
import { execute } from "./core/executor";
import {
  category,
  join,
  path,
  sha,
  protectedPath,
  under,
  validate,
} from "./core/paths";
import { ExternalFolder } from "./adapters/external-folder";
import { LocalStore, ensureDir, writeBackup } from "./adapters/local";
import { Http, json } from "./adapters/http";
import { DriveStore, GitHubStore, YandexStore } from "./sources/remotes";
import {
  GoogleAuthorizedTransport,
  GoogleTokenManager,
  parseGoogleClient,
  type SecretPort,
  type GoogleClient,
} from "./auth/google-auth";
import { authorizeGoogleDesktop } from "./adapters/google-desktop-oauth";
import { StudioView, VIEW_TYPE } from "./ui";

interface State {
  baselines: Record<string, Baseline>;
  pending: Record<string, PendingOperation>;
}
export default class SyncStudio extends Plugin {
  data: Persisted = { schema: 1, connections: [], profiles: [], history: [] };
  state: State = { baselines: {}, pending: {} };
  busy = false;
  phase = "Готово";
  paused = false;
  controller?: AbortController;
  private authController?: AbortController;
  private last = new Map<string, number>();
  private failures = new Map<string, number>();
  private changed = false;
  private changedAt = 0;
  private http = new Http();
  private tokenManagers = new Map<string, GoogleTokenManager>();
  private status!: HTMLElement;
  private pendingPlans = new Map<string, Plan>();
  private stateFile!: StateFile<State>;
  async onload() {
    const saved = await this.loadData();
    if (saved) {
      if (
        saved.schema !== 1 ||
        !Array.isArray(saved.profiles) ||
        !Array.isArray(saved.connections)
      )
        throw Error(
          "Неизвестный формат Sync Studio. Старые настройки не импортируются.",
        );
      this.data = saved;
    }
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
      getBasePath?(): string;
    };
    if (!adapter.getBasePath) throw Error("Требуется desktop vault");
    this.stateFile = new StateFile(adapter.getBasePath());
    this.state = await this.stateFile.read(this.state);
    this.registerView(VIEW_TYPE, (leaf) => new StudioView(leaf, this));
    this.addRibbonIcon("refresh-cw", "Sync Studio", () => void this.open());
    this.addCommand({
      id: "open",
      name: "Открыть профили",
      callback: () => void this.open(),
    });
    this.addCommand({
      id: "cancel",
      name: "Остановить текущий запуск",
      callback: () =>
        this.controller?.abort(new Error("Отменено пользователем")),
    });
    this.addSettingTab(new StudioSettings(this.app, this));
    this.status = this.addStatusBarItem();
    this.refresh();
    this.registerInterval(window.setInterval(() => void this.tick(), 10000));
    const changed = (f: { path: string }) => {
      if (protectedPath(f.path, this.app.vault.configDir)) return;
      this.changed = true;
      this.changedAt = Date.now();
    };
    this.registerEvent(this.app.vault.on("modify", changed));
    this.registerEvent(this.app.vault.on("create", changed));
    this.registerEvent(this.app.vault.on("delete", changed));
    this.registerEvent(this.app.vault.on("rename", changed));
    this.app.workspace.onLayoutReady(() => {
      for (const p of this.data.profiles)
        this.last.set(p.id, p.startup ? 0 : Date.now());
      void this.tick();
    });
  }
  onunload() {
    this.controller?.abort();
    this.authController?.abort();
    for (const t of this.tokenManagers.values()) t.disconnect();
  }
  async open() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
  refresh() {
    if (this.status) this.status.setText("Sync Studio · " + this.phase);
    for (const l of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      (l.view as StudioView).render();
  }
  async save() {
    await this.saveData(this.data);
  }
  async saveState() {
    await this.stateFile.write(this.state);
  }
  private secrets(): SecretPort {
    const app = this.app as App & { secretStorage?: SecretPort };
    if (!app.secretStorage)
      throw Error(
        "Нужно обновить Obsidian: отсутствует Secret Storage. Секреты в data.json не сохраняются.",
      );
    return app.secretStorage;
  }
  getSecret(c: Connection) {
    return this.secrets().getSecret(c.secretRef) || "";
  }
  setSecret(c: Connection, value: string) {
    this.secrets().setSecret(c.secretRef, value);
  }
  async connectGoogle(c: Connection, clientJSON: string) {
    if (!Platform.isDesktopApp) throw Error("OAuth доступен только на desktop");
    if (this.authController) throw Error("Дождитесь текущей авторизации");
    const client = parseGoogleClient(clientJSON);
    this.authController = new AbortController();
    try {
      const grant = await authorizeGoogleDesktop(
        client,
        this.http,
        this.authController.signal,
        (url) => {
          window.open(url);
        },
      );
      c.clientId = client.clientId;
      c.clientSecretRef = c.secretRef + "-client";
      if (client.clientSecret)
        this.secrets().setSecret(c.clientSecretRef, client.clientSecret);
      this.setSecret(c, grant.refreshToken);
      c.subject = grant.subject;
      this.tokenManagers.get(c.id)?.disconnect();
      this.tokenManagers.delete(c.id);
      await this.save();
      new Notice("Google Drive подключён");
    } finally {
      this.authController = undefined;
    }
  }
  disconnect(c: Connection) {
    if (this.busy) throw Error("Сначала остановите запуск");
    this.tokenManagers.get(c.id)?.disconnect();
    this.tokenManagers.delete(c.id);
    this.setSecret(c, "");
    if (c.clientSecretRef) this.secrets().setSecret(c.clientSecretRef, "");
    for (const p of this.data.profiles)
      if (p.connectionId === c.id) p.enabled = false;
    return this.save();
  }
  async remote(p: Profile): Promise<Store> {
    const c = this.data.connections.find((x) => x.id === p.connectionId);
    if (!c) throw Error("Подключение не найдено");
    const limit = p.maxMB * 1024 * 1024;
    const token = this.getSecret(c);
    if (c.provider === "gdrive") {
      if (!c.clientId || !token)
        throw Error("Подключите Google Drive через OAuth");
      let manager = this.tokenManagers.get(c.id);
      if (!manager) {
        const client: GoogleClient = {
          clientId: c.clientId,
          clientSecret: c.clientSecretRef
            ? this.secrets().getSecret(c.clientSecretRef) || undefined
            : undefined,
        };
        manager = new GoogleTokenManager(
          client,
          c.secretRef,
          this.secrets(),
          this.http,
          Date.now,
          c.subject,
        );
        this.tokenManagers.set(c.id, manager);
      }
      return new DriveStore(
        new GoogleAuthorizedTransport(this.http, manager),
        p.remoteRoot,
        limit,
        undefined,
        c.id + ":" + c.subject,
      );
    }
    if (c.provider === "gdrive-public") {
      if (!token) throw Error("Укажите Google API key");
      return new DriveStore(this.http, p.remoteRoot, limit, token, c.id);
    }
    if (c.provider === "github")
      return new GitHubStore(
        this.http,
        p.remoteRoot,
        p.branch,
        p.subpath,
        token,
        limit,
      );
    if (!token) throw Error("Укажите OAuth-токен Яндекс Диска");
    const store = new YandexStore(this.http, p.remoteRoot, token, limit);
    const disk = await json(this.http, "https://cloud-api.yandex.net/v1/disk", {
      headers: { Authorization: "OAuth " + token },
      signal: this.controller?.signal,
    });
    if (!disk.user?.uid)
      throw Error("Яндекс Диск не вернул идентификатор аккаунта");
    store.identity += ":" + String(disk.user.uid);
    return store;
  }
  async local(p: Profile): Promise<Store> {
    if (p.sourceKind === "folder")
      return new ExternalFolder(p.sourceRoot || "", p.maxMB * 1024 * 1024);
    if (p.sourceKind === "connection")
      return this.remote({
        ...p,
        connectionId: p.sourceConnectionId || "",
        remoteRoot: p.sourceRoot || "",
        branch: p.sourceBranch || "main",
        subpath: p.sourceSubpath || "",
      });
    return new LocalStore(this.app, p.localRoot, p.maxMB * 1024 * 1024);
  }
  private validateOverlap(p: Profile) {
    if (p.sourceKind) return;
    for (const other of this.data.profiles) {
      if (other.id === p.id || !other.enabled || other.sourceKind) continue;
      if (
        under(p.localRoot, other.localRoot) ||
        under(other.localRoot, p.localRoot)
      )
        throw Error(
          "Пересечение с активным профилем «" +
            other.name +
            "». Разведите папки назначения или приостановите другой профиль.",
        );
    }
  }
  async inspect(p: Profile): Promise<Plan> {
    return this.exclusive("Проверка файлов", async (signal) =>
      this.makePlan(p, signal),
    );
  }
  private async makePlan(p: Profile, signal: AbortSignal) {
    validate(p);
    this.validateOverlap(p);
    if (p.sourceKind === "connection") {
      const a = this.data.connections.find(
          (c) => c.id === p.sourceConnectionId,
        ),
        b = this.data.connections.find((c) => c.id === p.connectionId);
      if (!a || !b) throw Error("Выберите оба подключения");
      if (
        a.provider.replace("-public", "") === b.provider.replace("-public", "")
      )
        throw Error(
          "В 0.1 внешняя передача поддерживается между разными сервисами; это исключает перенос папки в саму себя",
        );
    }
    if (
      !p.sourceKind &&
      p.localRoot &&
      Object.keys(this.state.baselines[p.id]?.files || {}).length &&
      !(await this.app.vault.adapter.exists(p.localRoot))
    )
      throw Error(
        "Корень локального профиля исчез. Восстановите папку; удаление всего корня не распространяется автоматически.",
      );
    if (p.sourceKind && (p.direction !== "push" || !p.sourceRoot))
      throw Error("Внешний импорт требует источника и направления отправки");
    const local = await this.local(p),
      remote = await this.remote(p);
    if (local.identity === remote.identity)
      throw Error("Источник и назначение совпадают");
    if (p.direction !== "pull" && !remote.writable)
      throw Error("Источник поддерживает только получение");
    if (
      p.direction !== "pull" &&
      p.deletion === "trash" &&
      !remote.trashSupported
    )
      throw Error("Источник не поддерживает корзину");
    const [l, r] = await Promise.all([local.scan(signal), remote.scan(signal)]);
    const identity = JSON.stringify([l.identity, r.identity]);
    let baseline = this.state.baselines[p.id] || { identity, files: {} };
    const pending = this.state.pending[p.id];
    if (pending) {
      const op = pending.operation,
        a = Object.hasOwn(l.files, op.path) ? l.files[op.path] : undefined,
        b = Object.hasOwn(r.files, op.path) ? r.files[op.path] : undefined;
      const backupPath = join(".sync-conflicts", pending.runId + "/" + op.path);
      let backupVerified = false;
      if (
        op.action === "keep-both" &&
        (await this.app.vault.adapter.exists(backupPath))
      ) {
        const old = pending.direction === "push" ? op.remote : op.local;
        backupVerified =
          sha(
            new Uint8Array(await this.app.vault.adapter.readBinary(backupPath)),
          ) === old?.hash;
      }
      const recovery = recover(pending, identity, a, b, backupVerified);
      if (recovery.kind === "blocked")
        throw Error(recovery.reason + ": " + op.path);
      if (recovery.kind === "commit") {
        if (baseline.identity !== identity) baseline = { identity, files: {} };
        Object.defineProperty(baseline.files, op.path, {
          value: recovery.pair,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        this.state.baselines[p.id] = baseline;
      }
      delete this.state.pending[p.id];
      await this.saveState();
    }

    const result = plan(p, l, r, baseline, this.app.vault.configDir);
    // Plugin code cannot be safely replaced piecemeal while it is running.
    for (const op of result.operations)
      if (
        category(join(p.localRoot, op.path), this.app.vault.configDir) ===
          "plugin-code" &&
        !["adopt", "skip"].includes(op.action)
      ) {
        op.action = "conflict";
        op.reason =
          "Код плагина: требуется отдельная пакетная установка; автоматическая замена в 0.1 отключена";
      }
    return result;
  }
  async apply(reviewed: Plan) {
    return this.exclusive("Синхронизация", async (signal) => {
      const current = this.data.profiles.find(
        (p) => p.id === reviewed.profile.id,
      );
      if (
        !current ||
        JSON.stringify(current) !== JSON.stringify(reviewed.profile)
      )
        throw Error("Профиль изменился: постройте новый план");
      this.validateOverlap(current);
      const local = await this.local(current),
        remote = await this.remote(current);
      const log = await execute(
        reviewed,
        local,
        remote,
        {
          recovery: async (rel, b) => {
            await writeBackup(
              this.app,
              join(".sync-studio/recovery", path(rel)),
              b,
            );
          },
          checkpoint: async (baseline) => {
            this.state.baselines[current.id] = structuredClone(baseline);
            await this.saveState();
          },
          backup: async (rel, b) => {
            await writeBackup(this.app, join(".sync-conflicts", path(rel)), b);
          },
          journal: async (operation, status, result) => {
            if (status === "pending")
              this.state.pending[current.id] = {
                runId: reviewed.id,
                identity: reviewed.identity,
                direction: reviewed.profile.direction,
                policyKey: policyKey(reviewed.profile),
                operation,
              };
            else if (status === "applied") {
              this.state.pending[current.id].result = result;
            } else delete this.state.pending[current.id];
            await this.saveState();
          },
        },
        signal,
        (n) => {
          this.phase = "Выполнено операций: " + n;
          this.status.setText("Sync Studio · " + this.phase);
        },
      );
      this.data.history.unshift(log);
      this.data.history = this.data.history.slice(0, 100);
      await this.save();
      this.pendingPlans.delete(current.id);
      if (log.status === "completed") this.failures.delete(current.id);
      return log;
    });
  }
  async exclusive<T>(
    phase: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.busy) throw Error("Другой запуск уже выполняется");
    this.busy = true;
    this.phase = phase;
    this.controller = new AbortController();
    this.refresh();
    try {
      return await fn(this.controller.signal);
    } finally {
      this.busy = false;
      this.phase = "Готово";
      this.controller = undefined;
      this.refresh();
    }
  }
  getPendingPlans() {
    return [...this.pendingPlans.values()];
  }
  private async tick() {
    if (this.busy || this.paused || !navigator.onLine) return;
    const now = Date.now();
    for (const p of this.data.profiles) {
      if (!p.enabled || this.pendingPlans.has(p.id)) continue;
      if (!this.last.has(p.id)) this.last.set(p.id, p.startup ? 0 : now);
      const due =
        now - (this.last.get(p.id) ?? now) >=
        Math.max(
          p.intervalMinutes * 60000,
          Math.min(3600000, 10000 * 2 ** (this.failures.get(p.id) || 0)),
        );
      const onChange =
        p.onChange &&
        this.changed &&
        now - this.changedAt > 10000 &&
        p.direction !== "pull" &&
        (this.last.get(p.id) || 0) < this.changedAt;
      if (!due && !onChange) continue;
      this.last.set(p.id, now);
      try {
        const result = await this.inspect(p);
        const needsReview = result.operations.some(
          (o) =>
            o.action === "conflict" ||
            (p.confirmDeletes && o.action.startsWith("delete")),
        );
        if (needsReview) {
          this.pendingPlans.set(p.id, result);
          new Notice("Sync Studio: требуется просмотр плана «" + p.name + "»");
          this.refresh();
        } else await this.apply(result);
      } catch (e) {
        this.failures.set(p.id, (this.failures.get(p.id) || 0) + 1);
        new Notice("Sync Studio: " + (e as Error).message);
      }
      break;
    }
    if (
      this.changed &&
      this.data.profiles
        .filter((p) => p.enabled && p.onChange && p.direction !== "pull")
        .every((p) => (this.last.get(p.id) || 0) >= this.changedAt)
    )
      this.changed = false;
  }
}
class StudioSettings extends PluginSettingTab {
  constructor(
    app: App,
    private studio: SyncStudio,
  ) {
    super(app, studio);
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Sync Studio" });
    this.containerEl.createEl("p", {
      text: "Профили, подключения и планы находятся в отдельной вкладке. Старые настройки других плагинов не импортируются.",
    });
    new Setting(this.containerEl)
      .setName("Открыть рабочее пространство")
      .addButton((b) =>
        b
          .setButtonText("Открыть Sync Studio")
          .setCta()
          .onClick(() => void this.studio.open()),
      );
  }
}
