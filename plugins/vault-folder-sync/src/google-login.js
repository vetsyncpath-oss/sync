import { Modal, Setting } from "obsidian";
import { parseGoogleClient } from "../../../src/auth/google-auth";
import { signInGoogle } from "./cloud";

export class GoogleLogin extends Modal {
  constructor(app, lifetime, onGrant) {
    super(app);
    this.onGrant = onGrant;
    this.lifetime = lifetime;
    this.controller = new AbortController();
    this.cancel = () => this.close();
  }
  onOpen() {
    this.lifetime.addEventListener("abort", this.cancel, { once: true });
    this.setTitle("Подключить Google Drive");
    const el = this.contentEl;
    el.createEl("p", {
      text: "Выберите JSON OAuth-клиента типа Desktop app или вставьте его содержимое. Вход выполняется в браузере.",
    });
    let raw = "",
      busy = false;
    const file = el.createEl("input", {
      attr: {
        type: "file",
        accept: ".json,application/json",
        "aria-label": "Файл OAuth-клиента",
      },
    });
    const paste = el.createEl("textarea", {
      attr: {
        "aria-label": "JSON OAuth-клиента",
        placeholder: "Или вставьте JSON здесь",
        spellcheck: "false",
        autocomplete: "off",
      },
    });
    const status = el.createEl("p", {
      attr: { role: "status", "aria-live": "polite" },
    });
    const links = el.createDiv();
    const actions = new Setting(el);
    let start;
    const validate = (value) => {
      raw = "";
      try {
        if (!value.trim()) {
          status.setText("Выберите файл или вставьте JSON.");
          return;
        }
        parseGoogleClient(value.trim().replace(/^\uFEFF/, ""));
        raw = value.trim();
        status.setText("Клиент Desktop app готов к входу.");
      } catch {
        status.setText(
          "Нужен корректный JSON клиента Desktop app с полем installed.client_id.",
        );
      } finally {
        start.setDisabled(!raw || busy);
      }
    };
    let edit = 0;
    file.onchange = async () => {
      const seq = ++edit;
      const selected = file.files?.[0];
      if (!selected) return;
      paste.value = "";
      validate("");
      try {
        const text = await selected.text();
        if (seq === edit) validate(text);
      } catch {
        status.setText("Файл не удалось прочитать. Вставьте содержимое JSON.");
      }
    };
    paste.oninput = () => {
      edit++;
      file.value = "";
      validate(paste.value);
    };
    actions.addButton((b) => {
      start = b;
      b.setButtonText("Открыть вход Google")
        .setCta()
        .setDisabled(true)
        .onClick(async () => {
          if (!raw || busy) return;
          busy = true;
          start.setDisabled(true);
          file.disabled = paste.disabled = true;
          links.empty();
          status.setText("Подготовка входа…");
          try {
            const grant = await signInGoogle(
              raw,
              this.controller.signal,
              async (url) => {
                status.setText(
                  "Завершите вход в браузере и вернитесь в Obsidian.",
                );
                links.createEl("a", {
                  text: "Открыть страницу Google",
                  href: url,
                  attr: { target: "_blank", rel: "noopener noreferrer" },
                });
                new Setting(links).addButton((copy) =>
                  copy.setButtonText("Скопировать ссылку").onClick(async () => {
                    try {
                      await el.ownerDocument.defaultView.navigator.clipboard.writeText(
                        url,
                      );
                      status.setText("Ссылка скопирована.");
                    } catch {
                      status.setText(
                        "Используйте ссылку «Открыть страницу Google».",
                      );
                    }
                  }),
                );
                try {
                  await require("electron").shell.openExternal(url);
                } catch {
                  status.setText("Откройте страницу Google по ссылке ниже.");
                }
              },
            );
            if (!this.controller.signal.aborted) {
              this.onGrant(grant);
              this.close();
            }
          } catch (e) {
            if (!this.controller.signal.aborted)
              status.setText("Вход не завершён. " + (e.message || String(e)));
          } finally {
            busy = false;
            links.empty();
            start.setDisabled(!raw);
            file.disabled = paste.disabled = false;
          }
        });
    });
    actions.addButton((b) =>
      b.setButtonText("Отмена").onClick(() => this.close()),
    );
  }
  onClose() {
    this.lifetime.removeEventListener("abort", this.cancel);
    this.controller.abort();
    this.contentEl.empty();
  }
}
