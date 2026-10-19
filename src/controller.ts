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
  scanRules,
  PathCollision,
} from "./core/paths";
import { ExternalFolder } from "./adapters/external-folder";
import { LocalStore, ensureDir, writeBackup } from "./adapters/local";
import { Http, json } from "./adapters/http";
import {
  DriveStore,
  GitHubStore,
  YandexStore,
  driveRoot,
} from "./sources/remotes";
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
  private saveChain: Promise<void> = Promise.resolve();
  lastError = "";
  collision?: { profileId: string; paths: string[] };
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
    const snapshot = structuredClone(this.data);
    const next = this.saveChain.then(() => this.saveData(snapshot));
    this.saveChain = next.catch(() => {});
    await next;
  }
  reportError(error: unknown) {
    this.lastError = error instanceof Error ? error.message : String(error);
    new Notice("Sync Studio: " + this.lastError, 15000);
  }
  private invalidateGoogle(id: string) {
    for (const [key, manager] of this.tokenManagers)
      if (key.startsWith(id + ":")) {
        manager.disconnect();
        this.tokenManagers.delete(key);
      }
  }
  cancelGoogle() {
    this.authController?.abort(new Error("Авторизация отменена"));
  }
  async saveConnection(c: Connection, secret?: string) {
    if (this.busy) throw Error("Дождитесь завершения синхронизации");
    if (!c.name.trim()) throw Error("Укажите название подключения");
    if (secret !== undefined) this.setSecret(c, secret.trim());
    if (c.provider !== "github" && !this.getSecret(c))
      throw Error("Сначала подключите аккаунт или укажите ключ доступа");
    const index = this.data.connections.findIndex((x) => x.id === c.id);
    const previous = index < 0 ? undefined : this.data.connections[index];
    if (index < 0) this.data.connections.push(structuredClone(c));
    else this.data.connections[index] = structuredClone(c);
    try {
      await this.save();
      if (
        previous?.secretRef !== c.secretRef ||
        previous?.clientId !== c.clientId
      ) {
        this.invalidateGoogle(c.id);
      }
    } catch (error) {
      if (index < 0)
        this.data.connections = this.data.connections.filter(
          (x) => x.id !== c.id,
        );
      else this.data.connections[index] = previous!;
      throw error;
    }
  }
  async saveConnectionMetadata(c: Connection) {
    const index = this.data.connections.findIndex((x) => x.id === c.id);
    if (index < 0) throw Error("Подключение не сохранено");
    this.data.connections[index] = structuredClone(c);
    await this.save();
  }
  async testConnection(c: Connection, signal: AbortSignal): Promise<string> {
    if (c.provider === "github") {
      const token = this.getSecret(c);
      const info = await json(
        this.http,
        "https://api.github.com/" + (token ? "user" : "rate_limit"),
        {
          signal,
          headers: {
            "User-Agent": "Obsidian-Sync-Studio",
            ...(token ? { Authorization: "Bearer " + token } : {}),
          },
        },
      );
      if (c.root)
        await this.checkRoot(
          { ...newProfile(c.id), remoteRoot: c.root },
          signal,
          c,
        );
      return token ? "GitHub: " + info.login : "GitHub: публичный доступ";
    }
    const store = await this.remote(
      {
        ...newProfile(c.id),
        remoteRoot: c.root || (c.provider === "yandex" ? "disk:/" : "root"),
      },
      c,
      signal,
    );
    if (store instanceof DriveStore) {
      const meta = await store.inspect(driveRoot(c.root || "root"), signal);
      if (
        meta.trashed ||
        meta.mimeType !== "application/vnd.google-apps.folder"
      )
        throw Error("Выбранный объект Drive не является доступной папкой");
      await store.children(meta.id, signal);
      return "Доступ к папке: " + meta.name;
    }
    if (store instanceof YandexStore) {
      await store.folders("", signal);
      return "Яндекс Диск: доступ подтверждён";
    }
    throw Error("Неизвестный сервис");
  }
  async checkRoot(p: Profile, signal: AbortSignal, connection?: Connection) {
    const store = await this.remote(p, connection, signal);
    if (store instanceof DriveStore) {
      const meta = await store.inspect(driveRoot(p.remoteRoot), signal);
      if (
        meta.trashed ||
        meta.mimeType !== "application/vnd.google-apps.folder"
      )
        throw Error("Drive: укажите доступную папку");
      await store.children(meta.id, signal);
      return "Папка доступна: " + meta.name;
    }
    if (store instanceof YandexStore) {
      await store.folders("", signal);
      return "Папка Яндекс Диска доступна";
    }
    await store.scan(signal);
    return "Репозиторий доступен";
  }
  async createProfile(c: Connection) {
    const p = newProfile(c.id);
    p.name = c.name;
    p.remoteRoot =
      c.root ||
      (c.provider === "gdrive"
        ? "root"
        : c.provider === "yandex"
          ? "disk:/"
          : "");
    this.data.profiles.push(p);
    await this.save();
    return p;
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
    const client = clientJSON.trim()
      ? parseGoogleClient(clientJSON)
      : c.clientId
        ? {
            clientId: c.clientId,
            clientSecret: c.clientSecretRef
              ? this.secrets().getSecret(c.clientSecretRef) || undefined
              : undefined,
          }
        : parseGoogleClient(clientJSON);
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
      this.invalidateGoogle(c.id);
      new Notice("Google Drive авторизован. Сохраните подключение.");
    } finally {
      this.authController = undefined;
    }
  }
  disconnect(c: Connection) {
    if (this.busy) throw Error("Сначала остановите запуск");
    this.invalidateGoogle(c.id);
    this.setSecret(c, "");
    if (c.clientSecretRef) this.secrets().setSecret(c.clientSecretRef, "");
    for (const p of this.data.profiles)
      if (p.connectionId === c.id || p.sourceConnectionId === c.id)
        p.enabled = false;
    return this.save();
  }
  async remote(
    p: Profile,
    connection?: Connection,
    signal = this.controller?.signal,
  ): Promise<Store> {
    const c =
      connection || this.data.connections.find((x) => x.id === p.connectionId);
    if (!c) throw Error("Подключение не найдено");
    const limit = p.maxMB * 1024 * 1024;
    const token = this.getSecret(c);
    if (c.provider === "gdrive") {
      if (!c.clientId || !token)
        throw Error("Подключите Google Drive через OAuth");
      const managerKey = c.id + ":" + c.secretRef;
      let manager = this.tokenManagers.get(managerKey);
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
        this.tokenManagers.set(managerKey, manager);
      }
      return new DriveStore(
        new GoogleAuthorizedTransport(this.http, manager),
        p.remoteRoot,
        limit,
        undefined,
        c.id + ":" + c.subject,
        scanRules(p, this.app.vault.configDir),
      );
    }
    if (c.provider === "gdrive-public") {
      if (!token) throw Error("Укажите Google API key");
      return new DriveStore(
        this.http,
        p.remoteRoot,
        limit,
        token,
        c.id,
        scanRules(p, this.app.vault.configDir),
      );
    }
    if (c.provider === "github")
      return new GitHubStore(
        this.http,
        p.remoteRoot,
        p.branch,
        p.subpath,
        token,
        limit,
        scanRules(p, this.app.vault.configDir),
      );
    if (!token) throw Error("Укажите OAuth-токен Яндекс Диска");
    const store = new YandexStore(
      this.http,
      p.remoteRoot,
      token,
      limit,
      scanRules(p, this.app.vault.configDir),
    );
    const disk = await json(this.http, "https://cloud-api.yandex.net/v1/disk", {
      headers: { Authorization: "OAuth " + token },
      signal,
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
    return new LocalStore(
      this.app,
      p.localRoot,
      p.maxMB * 1024 * 1024,
      scanRules(p, this.app.vault.configDir),
    );
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
    try {
      this.collision = undefined;
      return await this.exclusive("Проверка файлов", async (signal) =>
        this.makePlan(p, signal),
      );
    } catch (error) {
      if (error instanceof PathCollision)
        this.collision = { profileId: p.id, paths: error.paths };
      this.data.history.unshift({
        id: crypto.randomUUID(),
        profileId: p.id,
        name: p.name + " — проверка",
        at: Date.now(),
        status: "failed",
        applied: 0,
        conflicts: 0,
        message: error instanceof Error ? error.message : String(error),
        details: [],
      });
      this.data.history = this.data.history.slice(0, 100);
      await this.save();
      this.refresh();
      throw error;
    }
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
      if (log.status !== "completed") this.lastError = log.message;
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
    this.lastError = "";
    this.busy = true;
    this.phase = phase;
    this.controller = new AbortController();
    this.refresh();
    try {
      return await fn(this.controller.signal);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
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
    if (this.busy || this.authController || this.paused || !navigator.onLine)
      return;
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
