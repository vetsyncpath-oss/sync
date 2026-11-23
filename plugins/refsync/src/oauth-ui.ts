import { Modal, Setting, Platform, type App } from "obsidian";
import {
  authorize,
  callback,
  googleClient,
  type Attempt,
  type Client,
  type CloudEngine,
  type Account,
} from "./accounts";
import type SyncStudio from "./main";
import type { Server } from "node:http";

export class AccountsView extends Modal {
  constructor(
    app: App,
    private rs: SyncStudio,
    private after: () => void,
  ) {
    super(app);
  }
  onOpen() {
    const el = this.contentEl,
      t = this.rs.t;
    el.empty();
    this.titleEl.setText(t("accounts"));
    for (const a of this.rs.accounts.list()) {
      const users = this.rs.config.profiles
        .filter((p) => p.cloud?.account === a.id)
        .map((p) => p.name);
      new Setting(el)
        .setName(t(a.engine) + " · " + a.label)
        .setDesc(
          [
            t(
              a.needsLogin
                ? "loginRequired"
                : a.expires < Date.now() + 60000
                  ? "refreshDue"
                  : "accountActive",
            ),
            t(a.full ? "fullAccess" : "appAccess"),
            ...users,
          ].join(" · "),
        )
        .addButton((b) =>
          b.setButtonText(t("signIn")).onClick(() => this.login(a.engine, a)),
        )
        .addButton((b) =>
          b
            .setButtonText(t("signOut"))
            .setDisabled(a.needsLogin)
            .onClick(() =>
              this.rs.confirm(t("logoutHint"), () => {
                this.rs.accounts.logout(a.id);
                this.onOpen();
              }),
            ),
        );
    }
    for (const engine of ["google", "yandex"] as const)
      new Setting(el)
        .setName(t(engine))
        .addButton((b) =>
          b.setButtonText(t("addAccount")).onClick(() => this.login(engine)),
        );
  }
  private login(engine: CloudEngine, a?: Account) {
    new Login(this.app, this.rs, engine, a, () => this.onOpen()).open();
  }
  onClose() {
    this.contentEl.empty();
    this.after();
  }
}
class Login extends Modal {
  private invalidJson = false;
  private webClient = false;
  private client: Client;
  private attempt?: Attempt;
  private server?: Server;
  private waiting = false;
  private busy = false;
  private alive = true;
  private status!: HTMLElement;
  private timer?: number;
  constructor(
    app: App,
    private rs: SyncStudio,
    engine: CloudEngine,
    private previous: Account | undefined,
    private done: () => void,
  ) {
    super(app);
    this.client = {
      engine,
      clientId: "",
      secret: "",
      full: previous?.full ?? false,
      redirect:
        engine === "google" && Platform.isDesktopApp
          ? ""
          : engine === "yandex"
            ? callback
            : "",
    };
    if (previous) {
      try {
        const saved = rs.accounts.client(previous.id);
        this.client = {
          ...saved,
          redirect: saved.redirect.startsWith("http://127.0.0.1:")
            ? ""
            : saved.redirect,
        };
      } catch {
        /* Signed-out users supply their client again. */
      }
    }
  }
  onOpen() {
    const el = this.contentEl,
      t = this.rs.t,
      c = this.client;
    el.empty();
    this.titleEl.setText(t("signIn") + " · " + t(c.engine));
    if (!this.waiting) {
      if (c.engine === "google") {
        const apply = (s: string) => {
          try {
            const v = googleClient(s);
            this.invalidJson = false;
            this.webClient = v.web;
            c.clientId = v.clientId;
            c.secret = v.secret;
            c.redirect = v.web ? (v.redirects[0] ?? "") : "";
            this.onOpen();
            this.status.setText(t("clientReady"));
          } catch {
            this.invalidJson = true;
            this.status.setText(t("clientJson"));
          }
        };
        const input = el.createEl("input", {
          attr: {
            type: "file",
            accept: ".json,application/json",
            "aria-label": t("clientImport"),
          },
        });
        input.onchange = async () => {
          const f = input.files?.[0];
          if (f) {
            if (f.size > 262144) {
              this.status.setText(t("clientJson"));
              return;
            }
            try {
              apply(await f.text());
            } catch {
              this.status.setText(t("clientJson"));
            }
          }
        };
        new Setting(el).setName(t("clientPaste")).addTextArea((v) =>
          v.onChange((s) => {
            if (s.trim()) apply(s);
            else this.invalidJson = false;
          }),
        );
      }
      new Setting(el).setName("Client ID").addText((v) =>
        v.setValue(c.clientId).onChange((s) => {
          c.clientId = s.trim();
          this.invalidJson = false;
        }),
      );
      new Setting(el).setName("Client secret").addText((v) => {
        v.inputEl.type = "password";
        v.setValue(c.secret).onChange((s) => {
          c.secret = s.trim();
        });
      });
      new Setting(el)
        .setName(t("redirect"))
        .setDesc(
          t(
            c.engine === "google" && Platform.isDesktopApp
              ? "loopbackHint"
              : "redirectHint",
          ),
        )
        .addText((v) =>
          v.setValue(c.redirect).onChange((s) => {
            c.redirect = s.trim();
          }),
        );
      new Setting(el)
        .setName(t("fullAccess"))
        .setDesc(t("scopeHint"))
        .addToggle((v) =>
          v
            .setValue(c.full)
            .setDisabled(!!this.previous)
            .onChange((full) => {
              c.full = full;
            }),
        );
      new Setting(el).addButton((b) =>
        b
          .setButtonText(t("signIn"))
          .setCta()
          .onClick(() => this.start()),
      );
    } else if (this.attempt) {
      el.createEl("a", {
        text: t("reopenLogin"),
        href: this.attempt.url,
        attr: { target: "_blank", rel: "noreferrer" },
      });
      let response = "";
      new Setting(el)
        .setName(t("callbackPaste"))
        .addText((v) =>
          v.onChange((s) => {
            response = s;
          }),
        )
        .addButton((b) =>
          b
            .setButtonText(t("connect"))
            .onClick(() => this.finish(response, true)),
        );
      new Setting(el).addButton((b) =>
        b.setButtonText(t("retryLogin")).onClick(() => {
          this.stop();
          this.onOpen();
        }),
      );
    }
    this.status = el.createEl("p", { attr: { role: "status" } });
  }
  private cancel = () => this.close();
  private stop() {
    if (this.rs.oauthCancel === this.cancel) this.rs.oauthCancel = undefined;
    if (this.rs.oauthCallback === this.receive)
      this.rs.oauthCallback = undefined;
    this.server?.close();
    this.server?.closeAllConnections();
    this.server = undefined;
    window.clearTimeout(this.timer);
    this.waiting = false;
    this.attempt = undefined;
  }
  private receive = (url: string) => {
    void this.finish(url, false);
  };
  private async start() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.rs.oauthCancel) throw Error("busy");
      this.rs.oauthCancel = this.cancel;
      if (this.invalidJson) throw Error("clientJson");
      const c = { ...this.client };
      if (
        !c.redirect &&
        c.engine === "google" &&
        !this.webClient &&
        Platform.isDesktopApp
      ) {
        const http: typeof import("node:http") = require("node:http");
        const server = http.createServer((req, res) => {
          const a = this.attempt;
          let valid = false;
          if (
            a &&
            req.method === "GET" &&
            req.headers.host === new URL(a.client.redirect).host
          ) {
            try {
              const u = new URL(req.url ?? "", a.client.redirect);
              valid =
                u.origin === new URL(a.client.redirect).origin &&
                u.pathname === "/" &&
                u.searchParams.get("state") === a.state;
              if (valid) this.receive(u.href);
            } catch {
              /* invalid request */
            }
          }
          res.writeHead(valid ? 200 : 400, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(valid ? "Return to Obsidian." : "Invalid callback.");
        });
        this.server = server;
        await new Promise<void>((yes, no) => {
          server.once("error", no);
          server.listen(0, "127.0.0.1", yes);
        });
        const addr = server.address();
        if (!addr || typeof addr === "string") throw Error("redirect");
        c.redirect = "http://127.0.0.1:" + addr.port + "/";
      }
      if (!c.redirect) throw Error("redirect");
      this.attempt = await authorize(c);
      if (!this.alive) {
        this.stop();
        return;
      }
      this.waiting = true;
      this.rs.oauthCallback = this.receive;
      this.timer = window.setTimeout(() => {
        this.stop();
        this.onOpen();
        this.status.setText(this.rs.t("oauthExpired"));
      }, 600000);
      this.onOpen();
      if (Platform.isDesktopApp)
        await require("electron").shell.openExternal(this.attempt.url);
      else window.open(this.attempt.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      this.stop();
      this.onOpen();
      this.status.setText(this.rs.t(e instanceof Error ? e.message : "failed"));
    } finally {
      this.busy = false;
    }
  }
  private async finish(response: string, manual: boolean) {
    if (!this.attempt || this.busy) return;
    this.busy = true;
    try {
      const a = this.attempt;
      await this.rs.accounts.connect(
        a,
        response,
        manual,
        this.previous?.id,
        () => this.alive && this.attempt === a,
      );
      this.close();
      this.done();
    } catch (e) {
      this.status.setText(this.rs.t(e instanceof Error ? e.message : "failed"));
    } finally {
      this.busy = false;
    }
  }
  onClose() {
    this.alive = false;
    this.stop();
    this.contentEl.empty();
  }
}
