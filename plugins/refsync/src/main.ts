import {
  VamGate,
  guardedStore,
  managerId,
  readScope,
  sameScope,
  type VamBridge,
  type Scope,
} from "./vam-gate";
import { byteCount } from "./transfer";
import { DavStore, davId, davRoot, type DavLocation } from "./webdav";
import { testAccess } from "./access-check";
import { DeviceDriveSessions } from "./drive-sessions";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { legacyConfig } from "./config-scope";
import { withPluginData, reloadApp } from "./hot-config";
import { needsReload, verifySettings } from "./verify-settings";
import { canAutoReload, type ReloadRequest } from "./reload-manager";
import {
  requestUrl,
  Plugin,
  Platform,
  Modal,
  Setting,
  Notice,
  Menu,
  setIcon,
  MarkdownView,
  TFile,
  type App,
} from "obsidian";
import { join, hash, type Profile, type StorageProvider } from "./model";
import { loadProfiles, newProfile, type Configuration } from "./profiles";
import { Applier } from "./applier";
import {
  StateStore,
  ApplyJournal,
  TimedArtifacts,
  type Transaction,
} from "./state";
import { LocalProvider, VaultArtifacts } from "./vault";
import { SyncEngine, StatusStore, type Phase } from "./engine";
import { errorKey, translator } from "./i18n";
import type { Plan } from "./planner";
import type { Choices } from "./selection";
import {
  Scheduler,
  QuietWindow,
  NoticeCenter,
  eventPath,
  RunBudget,
  MutationFence,
} from "./runtime";
import { Review } from "./review";
import { PublicStore, type RemoteTree } from "./public-store";
import { GoogleTree, YandexTree, type Transport } from "./public-cloud";
import { GitTree } from "./public-git";
import { gitFs } from "./git-fs";
import { ensure } from "./vault";
import { referenceId, location } from "./public-location";
import { Accounts, callback, type Account } from "./accounts";
import {
  CloudStore,
  DriveTree,
  DiskTree,
  cloudId,
  type CloudLocation,
  type DriveCursor,
} from "./private-cloud";
import { DeviceDatabase } from "./device-database";
import { HistoryView, historyView } from "./history";
import { DigestCache, PathIssue, type ScanStats } from "./scanner";
import { detachEdited } from "./task-library";
import { Editor } from "./editor";

const send: Transport = async (url, method = "GET", headers = {}, body) => {
  try {
    const r = await requestUrl({
      url,
      method,
      headers,
      body,
      throw: false,
    });
    return {
      status: r.status,
      headers: r.headers,
      arrayBuffer: r.arrayBuffer,
    };
  } catch (cause) {
    throw Error("remoteNetwork", { cause });
  }
};

type Intent = "diagnose" | "dry" | "run" | "auto" | "release";
const icons: Record<Phase, string> = {
  idle: "refresh-cw",
  scan: "search",
  apply: "download",
  recover: "history",
  done: "check",
  partial: "shield-alert",
  error: "circle-alert",
};
class Confirmation extends Modal {
  constructor(
    app: App,
    private message: string,
    private tr: (k: string) => string,
    private action: () => void,
  ) {
    super(app);
  }
  onOpen() {
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) =>
        b.setButtonText(this.tr("cancel")).onClick(() => this.close()),
      )
      .addButton((b) =>
        b.setButtonText(this.tr("confirmAction")).onClick(() => {
          this.close();
          this.action();
        }),
      );
  }
}
export default class SyncStudio extends Plugin {
  accounts!: Accounts;
  gate!: VamGate;
  gateDescription?: HTMLElement;
  private bindingKey = "";
  private dispatchScope?: Scope;
  private updateSignals = new Map<string, string>();
  dispatchDescription?: HTMLElement;
  private dispatchText() {
    if (!this.dispatchScope) return this.t("vamDispatchOff");
    const { tenantId, bundleId } = this.dispatchScope;
    const signals = Array.from(
      this.updateSignals,
      ([id, version]) =>
        (id === managerId ? "VAM" : "Sync Studio") + " " + version,
    );
    return [this.t("vamDispatchOn"), tenantId, bundleId, ...signals].join(
      " · ",
    );
  }
  renderDispatch(el: HTMLElement) {
    this.dispatchDescription = el;
    el.setText(this.dispatchText());
  }
  get dispatchPaired() {
    return !!this.dispatchScope;
  }
  private allowDispatch(caller: unknown) {
    const { manager, scope } = this.managerContext();
    return (
      this.live &&
      !!manager &&
      manager === caller &&
      sameScope(this.dispatchScope, scope)
    );
  }
  // Optional local interface for a dispatcher installed in this vault.
  getDispatchStatus(caller: unknown) {
    if (!this.allowDispatch(caller)) return null;
    return {
      protocol: 1,
      version: this.manifest.version,
      access: this.gate.refresh(),
      phase: this.engine?.status.phase ?? "idle",
    };
  }
  receiveUpdateSignal(caller: unknown, signal: unknown) {
    if (!this.allowDispatch(caller) || !signal || typeof signal !== "object")
      return false;
    const { protocol, component, version } = signal as Record<string, unknown>;
    if (
      protocol !== 1 ||
      (component !== managerId && component !== this.manifest.id) ||
      typeof version !== "string" ||
      version.length > 80 ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
        version,
      )
    )
      return false;
    this.updateSignals.set(component, version);
    if (this.dispatchDescription?.isConnected)
      this.renderDispatch(this.dispatchDescription);
    return true;
  }
  private managerContext() {
    const registry = (
      this.app as App & {
        plugins?: {
          plugins?: Record<
            string,
            { app: App; auth?: object; accessV4?: { build?: Scope } }
          >;
        };
      }
    ).plugins;
    const manager = registry?.plugins?.[managerId];
    if (!manager || manager.app !== this.app) return {};
    const host = globalThis as typeof globalThis & {
      __VAM__?: VamBridge;
      vaultSyncAuth?: object;
    };
    return {
      manager,
      scope: readScope(manager.accessV4?.build),
      bridge:
        manager.auth && manager.auth === host.vaultSyncAuth
          ? host.__VAM__
          : undefined,
    };
  }
  confirmManagerBinding(after?: () => void) {
    const { manager, scope: candidate } = this.managerContext();
    if (!candidate) {
      this.report(Error(manager ? "vamScope" : "vamMissing"));
      return;
    }
    this.confirm(
      [this.t("vamBindHint"), candidate.tenantId, candidate.bundleId].join(
        " · ",
      ),
      () => {
        const current = this.managerContext();
        if (
          manager !== current.manager ||
          !sameScope(candidate, current.scope)
        ) {
          this.report(Error("vamManagerChanged"));
          return;
        }
        this.setDispatchBinding(candidate);
        after?.();
      },
    );
  }
  private setDispatchBinding(scope?: Scope) {
    this.app.saveLocalStorage(this.bindingKey, scope ?? null);
    this.dispatchScope = scope;
    this.updateSignals.clear();
    if (this.dispatchDescription?.isConnected)
      this.renderDispatch(this.dispatchDescription);
  }
  unpairManager() {
    this.setDispatchBinding();
  }
  managerLogin() {
    const commands = (
      this.app as App & {
        commands?: { executeCommandById: (s: string) => boolean };
      }
    ).commands;
    if (!commands?.executeCommandById(managerId + ":vam-login"))
      this.notices.send("vamMissing", this.t("vamMissing"));
  }
  private gatedSend(check: () => void): Transport {
    return (...args) => {
      check();
      return send(...args);
    };
  }

  private driveCursors = new Map<string, DriveCursor>();
  oauthCancel?: () => void;
  oauthCallback?: (url: string) => void;
  config!: Configuration;
  t = translator(navigator.language);
  private engine!: SyncEngine;
  private driveSessions = new DeviceDriveSessions();
  private ready!: Promise<void>;
  private logDir = "";
  private scheduler!: Scheduler;
  private quiet = new QuietWindow();
  private notices = new NoticeCenter((m) => new Notice(m));
  private live = true;
  private due = new Map<string, number>();
  private own = new Map<string, { digest: string | null; expires: number }>();
  private retries = new Map<string, number>();
  private saves = Promise.resolve();
  private reviewQueue: Review[] = [];
  private openIds = new Set<string>();
  private activeReview?: Review;
  private statusLabel = "";
  private bar: HTMLElement | null = null;
  private ribbon!: HTMLElement;
  private lastPrune = 0;
  private lastInput = Date.now();
  private reloadQueued = false;
  private pendingReload?: ReloadRequest;
  private async verify() {
    const applier = this.engine.applier;
    const reports = await verifySettings(
      applier.journal,
      (t) => this.recoveryTarget(t),
      (t) => {
        const p = this.config.profiles.find(
          (p) =>
            p.enabled &&
            p.role === "subscriber" &&
            p.scope === "settings" &&
            p.id === JSON.parse(t.key)[0] &&
            JSON.parse(t.key)[2] === referenceId(p),
        );
        return p && t.target === this.app.vault.configDir
          ? (p.config ?? legacyConfig())
          : undefined;
      },
      new RunBudget(undefined, undefined, undefined, applier.fence),
    );
    for (const r of reports) {
      await this.log(
        r.unresolved.length ? "verify-failed" : "verified",
        r.repaired,
        r.profile,
        r,
      );
      const profile = this.config.profiles.find((p) => p.id === r.profile);
      if (
        r.unresolved.length &&
        profile &&
        (profile.inheritMode ? this.config.mode : profile.mode) !== "silent"
      )
        this.notices.send(
          "verify",
          this.t("repairFailed") + " · " + r.unresolved.length,
        );
    }
  }
  private promptReload() {
    if (!this.pendingReload) return;
    this.confirm(
      this.t("reloadNeeded") + " · " + this.pendingReload.paths.join(", "),
      () => this.queueReload(true),
    );
  }
  private queueReload(manual = false) {
    if (
      this.gate.refresh() !== "vamGranted" ||
      this.reloadQueued ||
      !this.pendingReload
    )
      return;
    this.reloadQueued = true;
    void this.scheduler
      .serial(async () => {
        const now = Date.now(),
          raw: unknown = this.app.loadLocalStorage("refsync:reloadHistory"),
          history: number[] = Array.isArray(raw)
            ? raw.filter((x) => typeof x === "number" && x > now - 3600000)
            : [];
        if (
          !this.live ||
          this.gate.refresh() !== "vamGranted" ||
          !this.pendingReload ||
          (this.config.paused && !manual)
        )
          return;
        if (
          !manual &&
          (!canAutoReload(history, now) ||
            (this.pendingReload.policy === "idle" &&
              now - this.lastInput < this.pendingReload.idleSeconds * 1000))
        )
          return;
        this.app.saveLocalStorage("refsync:reloadHistory", [...history, now]);
        reloadApp(this.app);
      })
      .catch((e) => this.report(e))
      .finally(() => {
        this.reloadQueued = false;
      });
  }
  private startupRecovery?: Promise<void>;
  async onload() {
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
      getBasePath?: () => string;
    };
    const vaultIdentity =
      adapter.getBasePath?.() ||
      (this.app as App & { appId?: string }).appId ||
      crypto.randomUUID();
    this.bindingKey =
      "refsync:dispatch:" +
      bytesToHex(
        sha256(
          new TextEncoder().encode(
            JSON.stringify([vaultIdentity, this.app.vault.configDir]),
          ),
        ),
      );
    this.dispatchScope = readScope(this.app.loadLocalStorage(this.bindingKey));
    this.gate = new VamGate(
      () => this.managerContext(),
      () => {
        if (this.gate.label !== "vamGranted") {
          this.reviewQueue = [];
          this.activeReview?.close();
          this.openIds.clear();
          for (const p of this.config?.profiles ?? [])
            this.scheduler?.cancel(p.id);
          if (this.scheduler)
            void this.scheduler
              .serial(async () => {
                await this.ready;
                if (
                  this.engine.applier.needsRecovery &&
                  !this.engine.applier.fence.pending
                )
                  await this.engine.exclusive(() =>
                    this.engine.applier.recover((t) => this.recoveryTarget(t)),
                  );
              })
              .catch((e) => this.report(e));
        }
        if (this.ribbon) this.paint();
        const desc = this.gateDescription;
        if (desc?.isConnected) desc.setText(this.t(this.gate.label));
      },
    );
    this.gate.refresh();
    this.registerInterval(window.setInterval(() => this.gate.refresh(), 1000));
    const fence = MutationFence.forVault(this.app.vault);
    await fence.previousInstance;
    this.config = loadProfiles(await this.loadData());
    const key = (id: string) =>
      "refsync-" +
      bytesToHex(
        sha256(
          new TextEncoder().encode(
            this.app.loadLocalStorage("refsync:device") + ":" + id,
          ),
        ),
      ).slice(0, 56);
    this.accounts = new Accounts(
      {
        list: () => this.app.loadLocalStorage("refsync:accounts") ?? [],
        save: (rows: Account[]) =>
          this.app.saveLocalStorage("refsync:accounts", rows),
        get: (id) =>
          this.app.secretStorage?.getSecret(key(id)) ||
          this.app.loadLocalStorage(key(id)) ||
          null,
        set: (id, v) => {
          if (this.app.secretStorage) {
            this.app.secretStorage.setSecret(key(id), v);
            this.app.saveLocalStorage(key(id), null);
          } else this.app.saveLocalStorage(key(id), v);
        },
      },
      send,
    );
    this.registerObsidianProtocolHandler("refsync-oauth", (params) => {
      this.oauthCallback?.(callback + "?" + new URLSearchParams(params));
    });
    const deviceKey = (k: string) => this.manifest.id + ":" + k;
    const db = new DeviceDatabase();
    const state = new StateStore(
      {
        get: (k) => this.app.loadLocalStorage(deviceKey(k)),
        set: (k, v) => this.app.saveLocalStorage(deviceKey(k), v),
      },
      db,
    );
    this.logDir = join(
      this.app.vault.configDir,
      "plugins/" + this.manifest.id + "/runtime",
    );
    const journal = new ApplyJournal(
      new TimedArtifacts(
        new VaultArtifacts(
          this.app.vault.adapter,
          join(this.logDir, "journal/" + state.device),
        ),
        fence,
      ),
    );
    const status = new StatusStore();
    this.engine = new SyncEngine(
      new Applier(journal, state, fence, this.app.vault.configDir),
      status,
      this.app.vault.configDir,
      this.manifest.id,
      Platform.isDesktopApp,
      new DigestCache(db, state.device),
    );
    this.scheduler = new Scheduler(
      (id) => this.execute(id, "auto").catch((e) => this.report(e, id)),
      (e) => this.report(e),
      () => {
        try {
          const check = this.gate.lease();
          return () => {
            try {
              check();
              return true;
            } catch {
              return false;
            }
          };
        } catch {
          return () => false;
        }
      },
    );
    this.ribbon = this.addRibbonIcon("refresh-cw", "Sync Studio", (e) =>
      this.menu(e),
    );
    if (Platform.isDesktopApp) {
      this.bar = this.addStatusBarItem();
      this.bar.tabIndex = 0;
      this.bar.setAttribute("role", "button");
      this.bar.onclick = (e) => this.menu(e);
      this.bar.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.bar?.click();
        }
      };
    }
    this.register(status.subscribe(() => this.paint()));
    this.registerView(historyView, (leaf) => new HistoryView(leaf, this));
    this.addSettingTab(new Editor(this.app, this));
    const current = (intent: Intent) =>
      this.request(this.config.current, intent);
    const cmd = (id: string, label: string, fn: () => void) =>
      this.addCommand({ id, name: this.t(label), callback: fn });
    cmd("bind-manager", "vamBind", () => this.confirmManagerBinding());
    cmd("manager-login", "vamOpenLogin", () => this.managerLogin());
    cmd("history", "history", () => void this.openHistory());
    cmd("full-check", "fullCheck", () => current("diagnose"));
    cmd("dry-run", "dry", () => current("dry"));
    cmd("deliver", "sync", () => current("run"));
    cmd("sync-all", "syncAll", () => this.runAll());
    cmd("settings-reload", "reloadNeeded", () => this.promptReload());
    cmd("undo", "undo", () => this.confirmUndo());
    cmd("resolve-deletions", "release", () => current("release"));
    cmd(
      "toggle-silent",
      "switchMode",
      () =>
        void this.save({
          ...this.config,
          mode: this.config.mode === "plan" ? "silent" : "plan",
        }),
    );
    cmd(
      "pause",
      "pause",
      () => void this.save({ ...this.config, paused: !this.config.paused }),
    );
    this.ready = new Promise<void>((resolve, reject) =>
      this.app.workspace.onLayoutReady(() => {
        if (!this.live) {
          resolve();
          return;
        }
        status.set("recover");
        if (fence.pending) {
          this.engine.applier.needsRecovery = true;
          this.listen();
          resolve();
          return;
        }
        this.startupRecovery = this.engine
          .exclusive(async () => {
            await this.engine.applier.recover((t) => this.recoveryTarget(t));
            if (
              this.gate.refresh() === "vamGranted" &&
              this.engine.applier.pendingTargets.size
            )
              this.notices.send("cloudRecovery", this.t("cloudRecovery"));
            if (!this.config.paused)
              await this.verify().catch((e) => this.report(e));
          })
          .then(() => {
            if (this.live) {
              status.set("idle");
              this.listen();
            }
            resolve();
          }, reject);
      }),
    );
    void this.ready.catch((e) => this.report(e));
  }
  onunload() {
    this.live = false;
    this.gate.dispose();
    this.oauthCancel?.();
    // A newly enabled instance must finish this instance's rollback before recovery.
    const fence = MutationFence.forVault(this.app.vault);
    const previous = fence.previousInstance;
    fence.previousInstance = Promise.allSettled([
      previous,
      this.scheduler?.stop(),
      this.startupRecovery,
      this.saves,
      this.logs,
    ]).then(() => {});
    this.quiet.clear();
    this.own.clear();
    this.reviewQueue = [];
    this.activeReview?.close();
  }
  private paint() {
    const phase = this.engine.status.phase,
      label = this.t(
        this.gate.label !== "vamGranted"
          ? this.gate.label
          : this.config.paused
            ? "paused"
            : phase,
      );
    const text = ["Sync Studio", label, this.statusLabel]
      .filter(Boolean)
      .join(" · ");
    setIcon(this.ribbon, this.config.paused ? "pause" : icons[phase]);
    this.ribbon.setAttribute("aria-label", text);
    this.bar?.setText(
      this.pendingReload ? text + " · " + this.t("reloadNeeded") : text,
    );
  }
  private menu(e: MouseEvent) {
    const m = new Menu();
    for (const p of this.config.profiles)
      m.addItem((item) =>
        item
          .setTitle(p.name)
          .setChecked(p.id === this.config.current)
          .onClick(() => this.save({ ...this.config, current: p.id })),
      );
    m.addSeparator();
    if (this.pendingReload)
      m.addItem((i) =>
        i.setTitle(this.t("reloadNeeded")).onClick(() => this.promptReload()),
      );
    for (const [k, f] of [
      ["history", () => this.openHistory()],
      ["preview", () => this.request(this.config.current, "dry")],
      ["sync", () => this.request(this.config.current, "run")],
      ["syncAll", () => this.runAll()],
      ["undo", () => this.confirmUndo()],
      ["release", () => this.request(this.config.current, "release")],
      [
        "pause",
        () => this.save({ ...this.config, paused: !this.config.paused }),
      ],
    ] as const)
      m.addItem((item) => item.setTitle(this.t(k)).onClick(f));
    m.showAtMouseEvent(e);
  }
  save(config: Configuration) {
    const prev = this.config;
    this.config = config;
    for (const p of prev.profiles)
      if (config.profiles.find((q) => q.id === p.id) !== p) {
        this.scheduler.cancel(p.id);
        this.due.delete(p.id);
      }
    this.paint();
    const write = this.saves.then(() => this.saveData(config));
    this.saves = write.catch((e) => this.report(e));
    return write;
  }
  newProfile(copy?: Profile) {
    return newProfile(copy);
  }
  put(p: Profile, select = false) {
    p = { ...p };
    detachEdited(p, this.config.library);
    const old = this.config.profiles.some((q) => q.id === p.id);
    return this.save({
      ...this.config,
      current: select ? p.id : this.config.current,
      profiles: old
        ? this.config.profiles.map((q) => (q.id === p.id ? p : q))
        : [...this.config.profiles, p],
    });
  }
  private listen() {
    const contents = () =>
      this.gate.refresh() !== "vamGranted"
        ? []
        : this.config.profiles.filter(
            (p) =>
              p.enabled &&
              (p.scope === "content" || !!p.config) &&
              !this.config.paused,
          );
    for (const e of ["keydown", "pointerdown"] as const)
      this.registerDomEvent(document, e, () => {
        this.lastInput = Date.now();
      });
    // Keep only startup triggers that existed when this vault opened. A late
    // Manager can authorize them without replaying arbitrary blocked requests.
    const startup = new Set(
      this.config.profiles
        .filter((p) => p.enabled && p.startup && !this.config.paused)
        .map((p) => p.id),
    );
    const startWhenReady = () => {
      if (!startup.size || this.gate.refresh() !== "vamGranted") return;
      for (const p of contents())
        if (startup.has(p.id) && p.startup)
          this.scheduler.schedule(p.id, p.startupSeconds * 1000);
      startup.clear();
    };
    startWhenReady();
    this.registerInterval(
      window.setInterval(() => {
        startWhenReady();
        const now = Date.now();
        if (
          this.pendingReload?.policy === "idle" &&
          !this.config.paused &&
          now - this.lastInput >= this.pendingReload.idleSeconds * 1000
        )
          this.queueReload();
        for (const p of contents()) {
          if (!p.intervalMinutes) continue;
          const next = this.due.get(p.id);
          if (next && next <= now) this.scheduler.schedule(p.id);
          if (!next || next <= now)
            this.due.set(p.id, now + p.intervalMinutes * 60000);
        }
        if (now - this.lastPrune >= 86400000) {
          this.lastPrune = now;
          void this.scheduler
            .serial(async () => {
              await this.pruneTrash();
              await this.engine.applier.prune();
            })
            .catch((e) => this.report(e));
        }
        for (const [k, v] of this.own) if (v.expires < now) this.own.delete(k);
      }, 1000),
    );
    for (const event of ["focus", "online"] as const)
      this.registerDomEvent(window, event, () => {
        for (const p of contents())
          if (
            p.scope === "content" &&
            (event === "focus" ? p.onFocus : p.onOnline)
          )
            this.scheduler.schedule(p.id, p.debounceSeconds * 1000);
      });
    this.registerEvent(
      this.app.workspace.on("editor-change", (_, editor) => {
        if (editor.file) this.quiet.edited(editor.file.path);
      }),
    );
    const event = (path: string, removed: boolean) => {
      for (const p of contents())
        if (eventPath(p, path, this.app.vault.configDir, this.manifest.id))
          void this.fileEvent(p, path, removed).catch((e) =>
            this.report(e, p.id),
          );
    };
    for (const type of ["create", "modify", "delete"] as const)
      this.registerEvent(
        this.app.vault.on(type as "create", (file) =>
          event(file.path, type === "delete"),
        ),
      );
    this.registerEvent(
      this.app.vault.on("rename", (file, old) => {
        event(old, true);
        event(file.path, false);
      }),
    );
  }
  private async fileEvent(p: Profile, path: string, removed: boolean) {
    const key = JSON.stringify([p.id, path]),
      own = this.own.get(key);
    if (own && own.expires > Date.now()) {
      if (removed && own.digest === null) return;
      if (
        !removed &&
        own.digest &&
        (await this.app.vault.adapter.exists(path))
      ) {
        if (
          (await hash(await this.app.vault.adapter.readBinary(path))) ===
          own.digest
        )
          return;
      }
    }
    this.scheduler.schedule(p.id, p.debounceSeconds * 1000);
  }
  private async pruneTrash() {
    const a = this.app.vault.adapter,
      root = join(this.logDir, "trash");
    if (!(await a.exists(root))) return;
    for (const dir of (await a.list(root)).folders) {
      const id = dir.slice(root.length + 1);
      if (
        dir.startsWith(root + "/") &&
        /^\d{13}-[a-f0-9-]{36}$/.test(id) &&
        Number(id.slice(0, 13)) <= Date.now()
      )
        await a.rmdir(dir, true);
    }
  }
  private recoveryTarget(t: Transaction): StorageProvider {
    const dest = JSON.parse(t.key)[3];
    if (t.dav) {
      if (dest !== davId(t.dav, t.target)) throw Error("journal");
      return this.davStore(t.dav, t.target, false);
    }
    if (t.cloud) {
      if (dest !== cloudId(t.cloud, t.target)) throw Error("journal");
      return this.cloudStore(t.cloud, t.target, false);
    }
    if (dest !== "vault:" + (t.target === "/" ? "" : t.target))
      throw Error("journal");
    return new LocalProvider(
      this.app.vault,
      t.target === "/" ? "" : t.target,
      this.manifest.id,
      t.scope,
      false,
      undefined,
      undefined,
      t.settings?.config,
      t.target === this.app.vault.configDir
        ? (path, write) =>
            withPluginData(this.app, this.manifest.id, path, write)
        : undefined,
      t.content,
    );
  }
  googleKey() {
    return String(this.app.loadLocalStorage("refsync:google-public-key") ?? "");
  }
  saveGoogleKey(value: string) {
    this.app.saveLocalStorage("refsync:google-public-key", value.trim());
  }
  publicReference(p: Profile, prefix = p.reference) {
    const check = this.gate.lease();
    const send = this.gatedSend(check);
    if (p.access !== "public" || p.role !== "subscriber" || !p.remote)
      throw Error("readonly");
    const { root, resourceKey } = location(p.remote);
    let tree: RemoteTree;
    if (p.remote.engine === "google")
      tree = new GoogleTree(send, root, this.googleKey(), resourceKey);
    else if (p.remote.engine === "yandex") tree = new YandexTree(send, root);
    else {
      const identity = JSON.stringify([root, p.remote.branch]),
        adapter = this.app.vault.adapter;
      tree = new GitTree(
        async () => {
          const key = await hash(new TextEncoder().encode(identity).buffer),
            dir = join(this.logDir, "git/" + key);
          await ensure(adapter, dir);
          return gitFs(adapter, dir);
        },
        send,
        root,
        p.remote.branch,
        this.app.vault.getName() + ":" + identity,
      );
    }
    return guardedStore(
      new PublicStore(referenceId(p), tree, prefix === "/" ? "" : prefix),
      check,
    );
  }
  private cloudStore(c: CloudLocation, prefix: string, ro: boolean) {
    const id = cloudId(c, prefix),
      a = this.accounts
        .list()
        .find((a) => a.id === c.account && a.engine === c.engine);
    if (!a || a.needsLogin) throw Error("loginRequired");
    if (c.engine === "yandex" && c.root !== (a.full ? "disk:/" : "app:/"))
      throw Error("cloudLocation");
    const check = this.gate.lease();
    const transport = this.accounts.transport(c.account, c.engine, check);
    let tree;
    if (c.engine === "google") {
      const cursor = this.driveCursors.get(id) ?? { token: "", revision: "" };
      this.driveCursors.set(id, cursor);
      const sessionKey = (path: string) =>
        JSON.stringify([
          this.engine.applier.state.device,
          c.account,
          c.root,
          path,
        ]);
      tree = new DriveTree(transport, c.root, cursor, {
        get: (path) => this.driveSessions.get(sessionKey(path)),
        set: (path, value) => this.driveSessions.set(sessionKey(path), value),
      });
    } else tree = new DiskTree(transport, this.gatedSend(check), c.root);
    const store = new CloudStore(
      id,
      tree,
      prefix === "/" ? "" : prefix,
      ro,
      c.engine !== "google" || a.full,
    );
    store.capabilities.supportsChangesFeed = c.engine === "google";
    return guardedStore(store, check);
  }
  private davSecretKey(d: DavLocation) {
    return (
      "refsync-dav-" +
      bytesToHex(
        sha256(
          new TextEncoder().encode(
            JSON.stringify([
              this.engine.applier.state.device,
              davRoot(d),
              d.user,
            ]),
          ),
        ),
      ).slice(0, 48)
    );
  }
  async saveDavPassword(d: DavLocation, value: string) {
    const key = this.davSecretKey(d);
    if (this.app.secretStorage) this.app.secretStorage.setSecret(key, value);
    await this.driveSessions.set(
      key,
      this.app.secretStorage ? null : value || null,
      Number.MAX_SAFE_INTEGER,
    );
  }
  private davStore(d: DavLocation, prefix: string, ro: boolean) {
    if (!Platform.isDesktopApp) throw Error("davDesktop");
    const key = this.davSecretKey(d);
    const check = this.gate.lease();
    return guardedStore(
      new DavStore(
        d,
        prefix,
        ro,
        async () =>
          this.app.secretStorage?.getSecret(key) ||
          (await this.driveSessions.get(key)),
        check,
      ),
      check,
    );
  }
  accountReference(
    p: Profile,
    prefix = p.reference,
    readOnly = p.role === "subscriber",
  ) {
    if (p.access === "webdav" && p.dav)
      return this.davStore(p.dav, prefix, readOnly);
    if (p.access !== "oauth" || !p.cloud) throw Error("cloudLocation");
    return this.cloudStore(p.cloud, prefix, readOnly);
  }
  async probeConnection(p: Profile, write: boolean) {
    const check = this.gate.lease();
    return this.scheduler.serial(async () => {
      const store =
        p.access === "local"
          ? new LocalProvider(
              this.app.vault,
              p.reference === "/" ? "" : p.reference,
              this.manifest.id,
              "content",
              !write,
              { trash: "permanent", trashDays: 0 },
            )
          : p.access === "public"
            ? this.publicReference({ ...p, role: "subscriber" })
            : this.accountReference(p, p.reference, !write);
      return testAccess(guardedStore(store, check), write);
    });
  }
  browseStore(p: Profile, side: "reference" | "local") {
    if (side === "local" || p.access === "local")
      return guardedStore(
        new LocalProvider(
          this.app.vault,
          "",
          this.manifest.id,
          "content",
          true,
        ),
        this.gate.lease(),
      );
    return p.access === "oauth" || p.access === "webdav"
      ? this.accountReference(p, "", true)
      : this.publicReference(p, "");
  }
  async previewDraft(draft: Profile) {
    const check = this.gate.lease();
    const p = structuredClone(draft);
    await this.scheduler.serial(async () => {
      await this.ready;
      check();
      const s = this.stores(p),
        mode =
          (p.inheritMode ? this.config.mode : p.mode) === "silent" &&
          !(p.firstPlan && !this.app.loadLocalStorage(this.firstKey(p)))
            ? "silent"
            : "plan";
      const result = await this.engine.run(
        p,
        s.reference,
        s.local,
        true,
        undefined,
        { mode, active: () => this.live },
      );
      check();
      if (this.live)
        new Review(
          this.app,
          p,
          result.plan,
          this.t,
          () =>
            p.role === "subscriber"
              ? [s.reference, s.local]
              : [s.local, s.reference],
          () => {},
          undefined,
          false,
          this.accounts.list().find((a) => a.id === p.cloud?.account)?.label,
        ).open();
    });
  }
  folderSources(p: Profile): StorageProvider[] {
    const s = this.stores(p);
    return [s.local, s.reference];
  }
  private stores(p: Profile) {
    if (!["local", "public", "oauth", "webdav"].includes(p.access))
      throw Error("invalid");
    const check = this.gate.lease();
    const make = (path: string, ro: boolean) =>
      guardedStore(
        new LocalProvider(
          this.app.vault,
          path === "/" ? "" : path,
          this.manifest.id,
          p.scope,
          ro,
          p,
          ro
            ? undefined
            : (file, digest) =>
                this.own.set(JSON.stringify([p.id, file]), {
                  digest,
                  expires: Date.now() + 10000,
                }),
          p.config,
          !ro && p.scope === "settings" && path === this.app.vault.configDir
            ? (file, write) =>
                withPluginData(this.app, this.manifest.id, file, write)
            : undefined,
          p.content,
        ),
        check,
      );
    return {
      reference:
        p.access === "oauth" || p.access === "webdav"
          ? this.accountReference(p)
          : p.access === "public"
            ? this.publicReference(p)
            : make(p.reference, p.role === "subscriber"),
      local: make(
        p.scope === "settings" ? this.app.vault.configDir : p.local,
        p.role === "publisher",
      ),
    };
  }
  request(id: string, intent: Intent) {
    let check;
    try {
      check = this.gate.lease();
    } catch (e) {
      this.report(e, id);
      return;
    }
    void this.scheduler
      .serial(() => {
        check();
        return this.execute(id, intent);
      })
      .catch((e) => this.report(e, id));
  }
  runAll() {
    try {
      this.gate.require();
    } catch (e) {
      this.report(e);
      return;
    }
    for (const p of this.config.profiles)
      if (p.enabled) this.request(p.id, "run");
  }
  private async execute(id: string, intent: Intent) {
    await this.ready;
    if (intent === "auto" && this.gate.refresh() !== "vamGranted") return;
    const check = this.gate.lease();
    const p = this.config.profiles.find((x) => x.id === id);
    if (!p || !this.live) return;
    if (
      intent !== "dry" &&
      intent !== "diagnose" &&
      (!p.enabled || this.config.paused)
    )
      return;
    if (
      intent === "auto" &&
      (this.openIds.has(id) ||
        (p.access === "oauth" &&
          !this.accounts
            .list()
            .some((a) => a.id === p.cloud?.account && !a.needsLogin)))
    )
      return;
    if (this.engine.applier.needsRecovery)
      await this.engine.exclusive(() =>
        this.engine.applier.recover((t) => this.recoveryTarget(t)),
      );
    check();
    this.lastScan = undefined;
    this.statusLabel = p.name;
    const v = this.stores(p);
    if (this.engine.applier.pendingTargets.has(v.reference.id)) {
      await this.engine.exclusive(() =>
        this.engine.applier.recover((t) => this.recoveryTarget(t)),
      );
      if (this.engine.applier.pendingTargets.has(v.reference.id))
        throw Error("cloudRecovery");
    }
    check();
    const firstKey = this.firstKey(p),
      first = p.firstPlan && !this.app.loadLocalStorage(firstKey),
      silent =
        (p.inheritMode ? this.config.mode : p.mode) === "silent" && !first;
    if ((intent === "run" || intent === "auto") && silent) {
      await this.deliver(p);
      return;
    }
    const started = Date.now();
    const { plan, stats } = await this.engine.run(
      p,
      v.reference,
      v.local,
      true,
      undefined,
      {
        mode:
          (intent === "dry" || intent === "diagnose") && silent
            ? "silent"
            : "plan",
        thorough: intent === "diagnose",
        active: () =>
          this.live &&
          (intent === "dry" || intent === "diagnose" || !this.config.paused),
        scanning: (s) => this.scanProgress(p, s),
      },
    );
    check();
    if (!this.live) return;
    this.statusLabel = p.name;
    this.paint();
    if (intent === "diagnose" || intent === "dry")
      await this.log("checkedRun", plan.count, id, {
        stats,
        deferred: plan.deferred,
        held: plan.held,
        ms: Date.now() - started,
      });
    if (
      intent === "auto" &&
      !plan.ops.some((o) => o.action !== "ack") &&
      !plan.held.length &&
      !plan.deferred.length
    )
      return;
    if (this.openIds.has(id)) return;
    this.openIds.add(id);
    const close = () => {
      this.openIds.delete(id);
      this.activeReview = undefined;
      this.showNext();
    };
    const endpoints = (): [StorageProvider, StorageProvider] =>
      p.role === "subscriber" ? [v.reference, v.local] : [v.local, v.reference];
    this.reviewQueue.push(
      new Review(
        this.app,
        p,
        plan,
        this.t,
        endpoints,
        close,
        intent === "dry" || intent === "diagnose"
          ? undefined
          : (choices, release) => {
              const picked =
                intent === "release"
                  ? new Map(plan.ops.map((o) => [o.path, "skip" as const]))
                  : choices;
              void this.scheduler
                .serial(() => {
                  check();
                  return this.deliver(p, plan, picked, release);
                })
                .catch((e) => this.report(e, p.id));
            },
        intent === "release",
        this.accounts.list().find((a) => a.id === p.cloud?.account)?.label,
      ),
    );
    this.showNext();
  }
  private showNext() {
    if (!this.activeReview && this.live) {
      this.activeReview = this.reviewQueue.shift();
      this.activeReview?.open();
    }
  }
  private firstKey(p: Profile) {
    return (
      this.manifest.id +
      ":first:" +
      JSON.stringify([
        p.id,
        p.scope,
        p.role,
        p.local,
        p.access === "local" ? p.reference : referenceId(p),
      ])
    );
  }
  private async deliver(
    p: Profile,
    approved?: Plan,
    choices?: Choices,
    release?: Set<string>,
  ) {
    const check = this.gate.lease();
    const active = () => {
      check();
      return (
        this.live &&
        !this.config.paused &&
        p.enabled &&
        this.config.profiles.some(
          (q) =>
            q.id === p.id &&
            q.enabled &&
            (q === p ||
              JSON.stringify({ ...q, name: p.name }) === JSON.stringify(p)),
        )
      );
    };
    if (!active()) return;
    const v = this.stores(p);
    const isOpen = (path: string) =>
      this.app.workspace
        .getLeavesOfType("markdown")
        .some(
          (leaf) =>
            leaf.view instanceof MarkdownView &&
            leaf.view.file?.path === join(p.local, path),
        );
    const started = Date.now();
    const reported = new Set<string>();
    const result = await this.engine.run(
      p,
      v.reference,
      v.local,
      false,
      approved,
      {
        mode: approved ? "plan" : "silent",
        choices,
        release,
        active,
        budget: new RunBudget(
          undefined,
          p.access !== "local" ? 90000 : undefined,
          undefined,
          this.engine.applier.fence,
        ),
        scanning: (s) => this.scanProgress(p, s),
        transfer: (path, direction, done, total, resumed) => {
          const k = JSON.stringify([path, direction, resumed]);
          if ((resumed || done === total) && !reported.has(k)) {
            reported.add(k);
            void this.log(resumed ? "transferResumed" : direction, 0, p.id, {
              path,
              bytes: done,
              totalBytes: total,
            }).catch(() => {});
          }
          if (
            !resumed &&
            done !== total &&
            performance.now() - this.lastPaint < 250
          )
            return;
          this.lastPaint = performance.now();
          this.statusLabel = [
            p.name,
            this.t(resumed ? "transferResumed" : direction),
            path,
            byteCount(done, total),
          ].join(" · ");
          this.paint();
        },
        quiet: (path) => this.quiet.check(p, path, isOpen(path)),
        progress: (done, total) => {
          if (done !== total && performance.now() - this.lastPaint < 250)
            return;
          this.lastPaint = performance.now();
          this.statusLabel = p.name + " · " + done + "/" + total;
          this.paint();
        },
      },
    );
    this.app.saveLocalStorage(this.firstKey(p), true);
    this.statusLabel = p.name;
    this.paint();
    const { held, deferred } = result.plan;
    for (let i = 0; i < result.operations.length; i += 128)
      await this.log("operations", 0, p.id, {
        operations: result.operations.slice(i, i + 128),
      });

    await this.log(
      held.length || deferred.length ? "partial" : "done",
      result.changed,
      p.id,
      { held, deferred, stats: result.stats, ms: Date.now() - started },
    );
    if (p.scope === "settings" && p.role === "subscriber" && result.changed) {
      const cfg = p.config ?? legacyConfig(),
        excluded = new Set(deferred.map((d) => d.path));
      const paths = result.plan.ops
        .filter(
          (o) =>
            !excluded.has(o.path) &&
            ["write", "delete"].includes(o.action) &&
            needsReload(o.path),
        )
        .map((o) => o.path);
      if (paths.length) {
        this.pendingReload = {
          paths: [...new Set([...(this.pendingReload?.paths ?? []), ...paths])],
          policy: cfg.reload,
          idleSeconds: cfg.idleSeconds,
          at: Date.now(),
        };
        this.paint();
        if (cfg.reload === "now") this.queueReload();
        else if (
          cfg.reload === "next" &&
          (p.inheritMode ? this.config.mode : p.mode) === "plan"
        )
          this.promptReload();
      }
    }
    if (held.length)
      this.notices.send(
        p.id + ":held",
        p.name + " · " + this.t("held") + " (" + held.length + ")",
      );
    const prefix = p.id + "\n",
      again = new Set(deferred.map((x) => prefix + x.path));
    for (const key of this.retries.keys())
      if (key.startsWith(prefix) && !again.has(key)) this.retries.delete(key);
    for (const key of again) {
      const n = (this.retries.get(key) ?? 0) + 1;
      this.retries.set(key, n);
      if (n === 6)
        this.notices.send(
          p.id + ":deferred",
          p.name + " · " + this.t("deferred"),
        );
    }
  }
  confirm(message: string, fn: () => void | Promise<void>) {
    new Confirmation(
      this.app,
      message,
      this.t,
      () =>
        void Promise.resolve()
          .then(fn)
          .catch((e) => this.report(e)),
    ).open();
  }
  private confirmUndo() {
    const p = this.config.profiles.find((p) => p.id === this.config.current);
    if (!p) return;
    let check;
    try {
      check = this.gate.lease();
    } catch (e) {
      this.report(e);
      return;
    }
    this.confirm(
      this.t("undoText") + " · " + p.name + " · " + this.t("undoPause"),
      () =>
        this.scheduler.serial(async () => {
          await this.ready;
          check();
          const local =
            "vault:" +
            (p.scope === "settings"
              ? this.app.vault.configDir
              : p.local === "/"
                ? ""
                : p.local);
          const remote = referenceId(p),
            ends = p.role === "subscriber" ? [remote, local] : [local, remote];
          await this.engine.exclusive(() =>
            this.engine.applier.undo(
              JSON.stringify([p.id, p.scope, ...ends]),
              undefined,
              (t) => guardedStore(this.recoveryTarget(t), check),
            ),
          );
          await this.put({ ...p, enabled: false });
          await this.log("undo", 1, p.id);
        }),
    );
  }
  private lastScan?: { profile: string; stats: ScanStats };
  private lastPaint = 0;
  scanLabel(s: ScanStats) {
    return [
      [this.t("filesCount"), s.files],
      [this.t("foldersCount"), s.folders],
      [this.t("readCount"), s.read],
      [this.t("reuseCount"), s.reused],
    ]
      .map((x) => x.join(" "))
      .join(" · ");
  }
  private scanProgress(p: Profile, s: ScanStats) {
    this.lastScan = { profile: p.id, stats: s };
    this.statusLabel = p.name + " · " + this.scanLabel(s);
    this.paint();
  }
  async openHistory() {
    const w = this.app.workspace;
    let leaf = w.getLeavesOfType(historyView)[0];
    if (!leaf) {
      leaf = w.getLeaf("tab");
      await leaf.setViewState({ type: historyView, active: true });
    }
    await w.revealLeaf(leaf);
  }
  async historyFiles() {
    await this.logs;
    const a = this.app.vault.adapter,
      out: string[] = [];
    for (const name of ["events.jsonl", "events.jsonl.1"]) {
      const path = join(this.logDir, name);
      if (await a.exists(path)) out.push(await a.read(path));
    }
    return out;
  }
  private logs = Promise.resolve();
  private log(
    event: string,
    count: number,
    profile: string,
    details: object = {},
  ) {
    const write = this.logs.then(() =>
      this.appendLog(event, count, profile, details),
    );
    this.logs = write.catch(() => {});
    return write;
  }
  private async appendLog(
    event: string,
    count: number,
    profile: string,
    details: object = {},
  ) {
    const a = this.app.vault.adapter;
    if (!(await a.exists(this.logDir))) await a.mkdir(this.logDir);
    const f = join(this.logDir, "events.jsonl"),
      prev = f + ".1";
    if (((await a.stat(f))?.size ?? 0) > 2097152) {
      if (await a.exists(prev)) await a.remove(prev);
      await a.rename(f, prev);
    }
    await a.append(
      f,
      JSON.stringify({ at: Date.now(), profile, event, count, ...details }) +
        "\n",
    );
  }
  report(e: unknown, id = this.config?.current ?? "") {
    if (!this.live) return;
    const code = e instanceof Error ? errorKey(e.message) : "failed";
    this.engine?.status.set("error");
    this.notices.send(id + ":" + code, "Sync Studio · " + this.t(code));
    void this.log("error", 0, id, {
      code,
      stats: this.lastScan?.profile === id ? this.lastScan.stats : undefined,
      path: e instanceof PathIssue ? e.path : undefined,
    }).catch(() => {});
  }
}
