import { Platform, Setting } from "obsidian";
import type Studio from "./main";
import type { Profile } from "./model";
import type { PublicSource } from "./public-location";
import { location } from "./public-location";
import { AccountsView } from "./oauth-ui";
export function connectionFields(
  el: HTMLElement,
  rs: Studio,
  p: Profile,
  redraw: () => void,
  validateForm: () => void,
  fieldRow: (k: keyof Profile) => Setting,
) {
  const t = rs.t;
  fieldRow("access")
    .setName(t("engine"))
    .addDropdown((d) => {
      for (const k of [
        "vaultSource",
        ...(Platform.isDesktopApp || p.access === "webdav" ? ["webdav"] : []),
        "google",
        "yandex",
        "git",
        "googlePrivate",
        "yandexPrivate",
      ])
        d.addOption(k, t(k));
      d.setValue(
        p.access === "webdav"
          ? "webdav"
          : p.access === "oauth"
            ? p.cloud?.engine + "Private"
            : (p.remote?.engine ?? "vaultSource"),
      ).onChange((v) => {
        delete p.cloud;
        delete p.dav;
        if (v === "webdav") {
          p.access = "webdav";
          p.dav = { url: "", user: "" };
          delete p.remote;
          p.reference = "/";
        } else if (v.endsWith("Private")) {
          const engine = v === "googlePrivate" ? "google" : "yandex";
          const a = rs.accounts
            .list()
            .find((a) => a.engine === engine && !a.needsLogin);
          delete p.remote;
          p.cloud = {
            engine,
            account: a?.id ?? "",
            root: engine === "google" ? "root" : a?.full ? "disk:/" : "app:/",
          };
          p.access = "oauth";
          p.reference = "/";
        } else if (v === "vaultSource") {
          delete p.remote;
          p.access = "local";
          p.reference = "Sync Studio-source";
        } else {
          p.access = "public";
          p.role = "subscriber";
          p.reference = "/";
          p.remote = {
            engine: v as PublicSource["engine"],
            url: "",
            branch: "",
          };
        }
        redraw();
      });
    });
  const remote = p.access === "public" ? p.remote : undefined;

  if (p.access === "webdav" && p.dav) {
    const dav = p.dav;
    fieldRow("dav")
      .setName(t("davUrl"))
      .addText((c) =>
        c
          .setPlaceholder("https://server.example/dav/")
          .setValue(dav.url)
          .onChange((v) => {
            dav.url = v.trim();
            validateForm();
          }),
      );
    new Setting(el).setName(t("davUser")).addText((c) =>
      c.setValue(dav.user).onChange((v) => {
        dav.user = v.trim();
        validateForm();
      }),
    );
    let password = "";
    const secret = new Setting(el)
      .setName(t("davPasswordLabel"))
      .setDesc(t("davSecretHelp"));
    secret
      .addText((c) => {
        c.inputEl.type = "password";
        c.inputEl.autocomplete = "new-password";
        c.onChange((v) => (password = v));
      })
      .addButton((b) =>
        b.setButtonText(t("savePassword")).onClick(async () => {
          try {
            await rs.saveDavPassword(dav, password);
            password = "";
            secret.settingEl.querySelector("input")!.value = "";
            b.setButtonText(t("saved"));
          } catch (e) {
            rs.report(e);
          }
        }),
      );
  }
  if (remote) {
    fieldRow("remote")
      .setName(t("remote"))
      .setDesc(t("readonly"))
      .addText((c) =>
        c.setValue(remote.url).onChange((v) => {
          remote.url = v.trim();
          validateForm();
        }),
      );
    if (remote.engine === "git")
      new Setting(el).setName(t("branch")).addText((c) =>
        c.setValue(remote.branch).onChange((v) => {
          remote.branch = v.trim();
          validateForm();
        }),
      );
    if (remote.engine === "google") {
      let key = rs.googleKey();
      new Setting(el)
        .setName(t("deviceKey"))
        .addText((c) => {
          c.inputEl.type = "password";
          c.setValue(key).onChange((v) => {
            key = v;
          });
        })
        .addButton((b) =>
          b.setButtonText(t("save")).onClick(() => {
            rs.saveGoogleKey(key);
            b.setButtonText(t("saved"));
          }),
        );
    }
  }
  if (p.access === "oauth" && p.cloud) {
    const c = p.cloud;
    fieldRow("cloud")
      .setName(t("accounts"))
      .addDropdown((d) => {
        d.addOption("", t("selectAccount"));
        for (const a of rs.accounts.list().filter((a) => a.engine === c.engine))
          d.addOption(
            a.id,
            a.label +
              " · " +
              t(a.full ? "fullAccess" : "appAccess") +
              (a.needsLogin ? " · " + t("loginRequired") : ""),
          );
        d.setValue(c.account).onChange((id) => {
          c.account = id;
          if (c.engine === "yandex")
            c.root = rs.accounts.list().find((a) => a.id === id)?.full
              ? "disk:/"
              : "app:/";
          redraw();
        });
      })
      .addButton((b) =>
        b
          .setButtonText(t("accounts"))
          .onClick(() => new AccountsView(rs.app, rs, () => redraw()).open()),
      );
    if (c.engine === "google")
      new Setting(el).setName(t("driveRoot")).addText((v) =>
        v.setValue(c.root).onChange((raw) => {
          try {
            c.root = location({
              engine: "google",
              url: raw.trim(),
              branch: "",
            }).root;
          } catch {
            c.root = "";
          }
          validateForm();
        }),
      );
  }
}
