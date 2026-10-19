import { ItemView, Modal, Notice, WorkspaceLeaf, App } from "obsidian";
import type SyncStudio from "./controller";
import type {
  Category,
  Connection,
  Plan,
  Profile,
  Operation,
} from "./core/model";
import { newProfile } from "./core/model";
import { DriveStore } from "./sources/remotes";
import { category, join, path } from "./core/paths";
export const VIEW_TYPE = "sync-studio-workspace";
const providers = {
  gdrive: "Google Drive · OAuth",
  "gdrive-public": "Google Drive · публичная папка",
  yandex: "Яндекс Диск",
  github: "GitHub",
};
const directions = {
  pull: "Получать обновления",
  push: "Отправлять обновления",
  both: "В обе стороны",
};
const policies = {
  both: "Сохранить обе версии",
  local: "Выигрывает локальный",
  remote: "Выигрывает удалённый",
  newest: "Выигрывает недавно изменённый",
  ask: "Спросить",
};
const categories: Record<Category, string> = {
  notes: "Заметки",
  attachments: "Вложения",
  settings: "Настройки Obsidian",
  "plugin-settings": "Настройки плагинов",
  "plugin-code": "Код плагинов — пока только план",
  themes: "Темы и CSS",
};
const actionLabels = {
  download: "Получить",
  upload: "Отправить",
  "delete-local": "Удалить локально",
  "delete-remote": "Удалить удалённо",
  "keep-both": "Сохранить обе версии",
  adopt: "Зафиксировать состояние",
  skip: "Оставить без изменений",
  conflict: "Требует решения",
};
function el<K extends keyof HTMLElementTagNameMap>(
  at: HTMLElement,
  tag: K,
  text = "",
  cls = "",
) {
  return at.createEl(tag, { text, cls });
}
function button(
  at: HTMLElement,
  text: string,
  fn: () => void | Promise<void>,
  primary = false,
) {
  const b = el(at, "button", text, primary ? "mod-cta" : "");
  b.onclick = () => {
    void Promise.resolve()
      .then(fn)
      .catch((e) => new Notice((e as Error).message));
  };
  return b;
}
function title(at: HTMLElement, text: string, sub = "") {
  el(at, "h2", text);
  if (sub) el(at, "p", sub, "ss-muted");
}
function row(at: HTMLElement, text: string, description = "") {
  const r = el(at, "div", "", "ss-row"),
    left = el(r, "div");
  el(left, "strong", text);
  if (description) el(left, "small", description, "ss-muted");
  return r;
}
function text(
  at: HTMLElement,
  label: string,
  value: string,
  fn: (v: string) => void,
  type = "text",
) {
  const wrap = el(at, "label", "", "ss-field");
  el(wrap, "span", label);
  const i = el(wrap, "input");
  i.type = type;
  i.value = value;
  i.onchange = () => fn(i.value);
  return i;
}
function select(
  at: HTMLElement,
  label: string,
  value: string,
  options: Record<string, string>,
  fn: (v: string) => void,
) {
  const wrap = el(at, "label", "", "ss-field");
  el(wrap, "span", label);
  const s = el(wrap, "select");
  for (const [k, v] of Object.entries(options)) {
    const o = el(s, "option", v);
    o.value = k;
  }
  s.value = value;
  s.onchange = () => fn(s.value);
  return s;
}
function check(
  at: HTMLElement,
  label: string,
  value: boolean,
  fn: (v: boolean) => void,
  sub = "",
) {
  const wrap = el(at, "label", "", "ss-check");
  const i = el(wrap, "input");
  i.type = "checkbox";
  i.checked = value;
  i.onchange = () => fn(i.checked);
  const body = el(wrap, "span", label);
  if (sub) el(body, "small", sub, "ss-muted");
  return i;
}
function card(at: HTMLElement) {
  return el(at, "section", "", "ss-card");
}
function badge(at: HTMLElement, text: string) {
  return el(at, "span", text, "ss-badge");
}
function grid(at: HTMLElement) {
  return el(at, "div", "", "ss-grid");
}
function banner(at: HTMLElement, text: string) {
  return el(at, "p", text, "ss-banner");
}
class Dialog extends Modal {
  constructor(
    app: App,
    private draw: (at: HTMLElement, modal: Dialog) => void,
  ) {
    super(app);
  }
  onOpen() {
    this.contentEl.addClass("sync-studio");
    this.draw(this.contentEl, this);
  }
  onClose() {
    this.contentEl.empty();
  }
}
export class StudioView extends ItemView {
  private page: "profiles" | "operations" | "import" = "profiles";
  private active = "";
  private tab = "scope";
  constructor(
    leaf: WorkspaceLeaf,
    private studio: SyncStudio,
  ) {
    super(leaf);
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Sync Studio";
  }
  getIcon() {
    return "refresh-cw";
  }
  async onOpen() {
    this.render();
  }
  private selected() {
    return (
      this.studio.data.profiles.find((p) => p.id === this.active) ||
      this.studio.data.profiles[0]
    );
  }
  private async save() {
    await this.studio.save();
    this.render();
  }
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("sync-studio");
    const header = el(root, "header", "", "ss-header");
    const b = el(header, "div");
    el(b, "small", "OBSIDIAN / SYNC STUDIO", "ss-kicker");
    el(b, "h1", "Ваши файлы. Ваши правила.");
    const actions = el(header, "div", "", "ss-actions");
    badge(actions, "0.1 · Desktop alpha");
    if (this.studio.busy)
      button(actions, "Остановить", () => this.studio.controller?.abort());
    else badge(actions, this.studio.phase);
    const nav = el(root, "nav", "", "ss-topnav");
    for (const [key, value] of Object.entries({
      profiles: "01 / Профили",
      operations: "02 / Центр операций",
      import: "03 / Импорт",
    })) {
      const b = button(nav, value, () => {
        this.page = key as typeof this.page;
        this.render();
      });
      b.toggleClass("is-active", this.page === key);
    }
    if (this.studio.busy)
      banner(root, this.studio.phase + "… Настройки временно заблокированы.");
    const content = el(root, "div");
    if (this.page === "profiles") this.profilePage(content);
    else if (this.page === "operations") this.operations(content);
    else this.importPage(content);
  }
  private profilePage(at: HTMLElement) {
    const layout = el(at, "div", "", "ss-layout"),
      side = el(layout, "aside"),
      main = el(layout, "main");
    el(side, "small", "ПРОФИЛИ", "ss-kicker");
    for (const p of this.studio.data.profiles) {
      const b = button(side, p.name, () => {
        this.active = p.id;
        this.render();
      });
      b.toggleClass("is-active", this.selected()?.id === p.id);
      el(
        b,
        "small",
        (this.studio.data.connections.find((c) => c.id === p.connectionId)
          ?.name || "Не подключён") +
          " · " +
          (p.enabled ? "автоматически" : "вручную"),
      );
    }
    button(side, "＋ Новый профиль", async () => {
      const p = newProfile(this.studio.data.connections[0]?.id);
      this.studio.data.profiles.push(p);
      this.active = p.id;
      this.tab = "route";
      await this.save();
    }).disabled = this.studio.busy;
    el(side, "hr");
    button(side, "◎ Подключения", () => this.connections());
    button(side, "▧ Возможности", () => this.capabilities());
    const p = this.selected();
    if (!p) {
      title(
        main,
        "Начните с подключения",
        "Профили и настройки старого плагина не импортируются.",
      );
      button(main, "Добавить источник", () => this.connections(), true);
      banner(
        main,
        "После подключения создайте профиль. Первый запуск всегда начинается с просмотра плана.",
      );
      return;
    }
    const head = el(main, "div", "", "ss-between");
    const h = el(head, "div");
    title(
      h,
      p.name,
      `${directions[p.direction]} · ${p.localRoot || "Корень vault"}`,
    );
    const actions = el(head, "div", "", "ss-actions");
    button(actions, "Дублировать", async () => {
      const next = structuredClone(p);
      next.id = crypto.randomUUID();
      next.name += " — копия";
      next.enabled = false;
      this.studio.data.profiles.push(next);
      this.active = next.id;
      await this.save();
    }).disabled = this.studio.busy;
    button(
      actions,
      "Проверить изменения",
      async () => this.preview(await this.studio.inspect(p)),
      true,
    ).disabled = this.studio.busy;
    const nav = el(main, "nav", "", "ss-tabs");
    for (const [key, value] of Object.entries({
      scope: "Что переносить",
      route: "Подключение",
      behavior: "Изменения",
      schedule: "Автозапуск",
      history: "История",
    })) {
      const b = button(nav, value, () => {
        this.tab = key;
        this.render();
      });
      b.toggleClass("is-active", this.tab === key);
    }
    const body = el(main, "fieldset");
    body.disabled = this.studio.busy;
    if (this.tab === "scope") this.scopePanel(body, p);
    else if (this.tab === "route") this.route(body, p);
    else if (this.tab === "behavior") this.behavior(body, p);
    else if (this.tab === "schedule") this.schedule(body, p);
    else this.history(body, p.id);
    const footer = el(main, "footer", "", "ss-between");
    el(
      footer,
      "small",
      "Изменения сохраняются после завершения редактирования поля.",
      "ss-muted",
    );
    button(footer, "Удалить профиль", () =>
      new Dialog(this.app, (at, m) => {
        title(at, "Удалить профиль?", p.name);
        banner(
          at,
          "Файлы остаются на месте. История соответствия этого профиля будет удалена.",
        );
        button(at, "Удалить профиль", async () => {
          if (this.studio.state.pending[p.id])
            throw Error(
              "Сначала завершите восстановление незаконченной операции",
            );
          this.studio.data.profiles = this.studio.data.profiles.filter(
            (x) => x.id !== p.id,
          );
          delete this.studio.state.baselines[p.id];
          await this.studio.saveState();
          await this.save();
          m.close();
        });
      }).open(),
    ).disabled = this.studio.busy;
  }
  private patch<K extends keyof Profile>(
    p: Profile,
    key: K,
    value: Profile[K],
  ) {
    p[key] = value;
    void this.save().catch((e) => new Notice((e as Error).message));
  }
  private scopePanel(at: HTMLElement, p: Profile) {
    title(
      at,
      "Что входит в синхронизацию",
      "Папки и категории пересекаются; исключения всегда имеют приоритет.",
    );
    select(
      at,
      "Область",
      p.scope,
      {
        all: "Весь выбранный корень",
        folders: "Выбранные папки",
        categories: "Категории файлов",
      },
      (v) => this.patch(p, "scope", v as Profile["scope"]),
    );
    const g = grid(at),
      folders = card(g),
      cats = card(g);
    el(folders, "h3", "Папки источника");
    el(
      folders,
      "p",
      p.scope === "folders"
        ? "Выберите папки или укажите точные относительные пути."
        : "Все папки выбранного корня включены.",
      "ss-muted",
    );
    if (p.scope === "folders") {
      text(folders, "Папки через ;", p.folders.join("; "), (v) =>
        this.patch(
          p,
          "folders",
          v
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );
      button(folders, "Выбрать в дереве", () => this.folderScope(p));
    } else
      button(folders, "Посмотреть дерево источника", () => this.folderScope(p));
    el(cats, "h3", "Категории содержимого");
    for (const [key, label] of Object.entries(categories))
      check(cats, label, p.categories.includes(key as Category), (v) =>
        this.patch(
          p,
          "categories",
          v
            ? [...p.categories, key as Category]
            : p.categories.filter((x) => x !== key),
        ),
      );
    const exclusions = card(at);
    el(exclusions, "h3", "Исключения");
    check(exclusions, "Не переносить data.json плагинов", p.excludeData, (v) =>
      this.patch(p, "excludeData", v),
    );
    check(exclusions, "Не переносить состояние окон", p.excludeWorkspace, (v) =>
      this.patch(p, "excludeWorkspace", v),
    );
    text(exclusions, "Исключить пути через ;", p.excludePaths.join("; "), (v) =>
      this.patch(
        p,
        "excludePaths",
        v
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    text(
      exclusions,
      "Максимальный размер файла, МБ",
      String(p.maxMB),
      (v) => this.patch(p, "maxMB", Number(v)),
      "number",
    );
    banner(
      at,
      "Всегда исключены: .git, .trash, .sync-studio, .sync-conflicts и собственная папка плагина. Изменение состава не удаляет файлы.",
    );
  }
  private route(at: HTMLElement, p: Profile) {
    title(
      at,
      "Откуда и куда",
      "Существующая папка может содержать файлы, созданные любым приложением.",
    );
    if (p.sourceKind) {
      const source = card(at);
      el(source, "h3", "Внешний источник");
      text(source, "Папка / корень источника", p.sourceRoot || "", (v) =>
        this.patch(p, "sourceRoot", v),
      );
      if (p.sourceKind === "connection") {
        select(
          source,
          "Подключение источника",
          p.sourceConnectionId || "",
          Object.fromEntries(
            this.studio.data.connections.map((c) => [c.id, c.name]),
          ),
          (v) => this.patch(p, "sourceConnectionId", v),
        );
        text(source, "Ветка GitHub", p.sourceBranch || "main", (v) =>
          this.patch(p, "sourceBranch", v),
        );
        text(source, "Подкаталог GitHub", p.sourceSubpath || "", (v) =>
          this.patch(p, "sourceSubpath", v),
        );
      }
    }
    text(at, "Название профиля", p.name, (v) => this.patch(p, "name", v));
    const g = grid(at),
      remote = card(g),
      local = card(g);
    el(remote, "h3", "Удалённая сторона");
    select(
      remote,
      "Подключение",
      p.connectionId,
      Object.fromEntries([
        ["", "Выберите подключение"],
        ...this.studio.data.connections.map((c) => [c.id, c.name]),
      ]),
      (v) => this.patch(p, "connectionId", v),
    );
    const c = this.studio.data.connections.find((c) => c.id === p.connectionId);
    text(
      remote,
      c?.provider === "github"
        ? "Репозиторий owner/repo"
        : c?.provider === "yandex"
          ? "Путь на Яндекс Диске"
          : "Ссылка или ID папки Drive",
      p.remoteRoot,
      (v) => this.patch(p, "remoteRoot", v),
    );
    if (c?.provider === "gdrive" || c?.provider === "gdrive-public")
      button(remote, "Выбрать папку Drive", () => this.pickDrive(p));
    if (c?.provider === "github") {
      text(remote, "Ветка / тег", p.branch, (v) => this.patch(p, "branch", v));
      text(remote, "Подкаталог репозитория", p.subpath, (v) =>
        this.patch(p, "subpath", v),
      );
    }
    el(
      local,
      "h3",
      p.sourceKind ? "Источник защищён от записи" : "Локальная сторона",
    );
    if (!p.sourceKind)
      text(local, "Папка внутри vault (пусто = корень)", p.localRoot, (v) =>
        this.patch(p, "localRoot", v),
      );
    select(
      local,
      "Направление",
      p.direction,
      p.sourceKind
        ? { push: "Импорт в удалённое назначение" }
        : c?.provider === "github" || c?.provider === "gdrive-public"
          ? { pull: directions.pull }
          : directions,
      (v) => this.patch(p, "direction", v as Profile["direction"]),
    );
    banner(
      at,
      "Получение не записывает в источник. Отправка не изменяет локальный оригинал. Зеркалирование локальных неизвестных файлов в этой версии отсутствует.",
    );
  }
  private behavior(at: HTMLElement, p: Profile) {
    title(
      at,
      "Что делать с изменениями",
      "Политика удаления не подменяется политикой конфликтов.",
    );
    select(at, "Если версии различаются", p.conflict, policies, (v) =>
      this.patch(p, "conflict", v as Profile["conflict"]),
    );
    select(
      at,
      "Когда применять политику",
      p.conflictWhen,
      {
        "both-changed": "Обе стороны изменились / первичное подключение",
        "any-difference": "Любое различие содержимого",
      },
      (v) => this.patch(p, "conflictWhen", v as Profile["conflictWhen"]),
    );
    select(
      at,
      "Удаления в источнике",
      p.deletion,
      {
        ignore: "Не распространять",
        trash: "Перемещать в корзину",
        permanent: "Удалять окончательно",
      },
      (v) => this.patch(p, "deletion", v as Profile["deletion"]),
    );
    select(
      at,
      "Файл удалён с одной стороны, изменён с другой",
      p.deleteConflict,
      {
        ask: "Спросить",
        keep: "Сохранить изменённый файл",
        delete: "Применить удаление",
      },
      (v) => this.patch(p, "deleteConflict", v as Profile["deleteConflict"]),
    );
    banner(
      at,
      "«Сохранить оба»: проигрывающая версия сохраняется в .sync-conflicts/<запуск>/<путь>. При получении основной становится удалённая версия; при отправке — локальная.",
    );
    if (p.deletion === "permanent")
      banner(
        at,
        "Окончательное удаление необратимо для этого плагина. Просмотрите полный план перед выполнением.",
      );
  }
  private schedule(at: HTMLElement, p: Profile) {
    title(
      at,
      "Когда запускать",
      "Пока Obsidian открыт. На закрытое приложение расписание не действует.",
    );
    check(at, "Автосинхронизация включена", p.enabled, (v) =>
      this.patch(p, "enabled", v),
    );
    text(
      at,
      "Интервал, минут",
      String(p.intervalMinutes),
      (v) => this.patch(p, "intervalMinutes", Number(v)),
      "number",
    );
    check(at, "Проверять после запуска Obsidian", p.startup, (v) =>
      this.patch(p, "startup", v),
    );
    check(
      at,
      "После изменения локальных файлов",
      p.onChange,
      (v) => this.patch(p, "onChange", v),
      "Для отправки и двусторонней синхронизации; задержка 10 секунд.",
    );
    check(
      at,
      "Спрашивать перед автоматическим удалением",
      p.confirmDeletes,
      (v) => this.patch(p, "confirmDeletes", v),
    );
    banner(
      at,
      "При конфликте или необходимости подтвердить удаление план попадёт в центр операций. Профиль ждёт решения и не повторяет одинаковые уведомления.",
    );
  }
  private history(at: HTMLElement, id?: string) {
    title(at, "История запусков");
    const runs = this.studio.data.history.filter(
      (r) => !id || r.profileId === id,
    );
    if (!runs.length) {
      el(at, "p", "Запусков пока нет.", "ss-muted");
      return;
    }
    for (const r of runs) {
      const item = card(at);
      const head = el(item, "div", "", "ss-between");
      el(head, "strong", r.name);
      badge(head, r.status);
      el(item, "small", new Date(r.at).toLocaleString());
      el(
        item,
        "p",
        `${r.message} · операций: ${r.applied} · конфликтов: ${r.conflicts}`,
      );
      button(item, "Детали", () =>
        new Dialog(this.app, (at) => {
          title(at, r.name, r.message);
          const table = el(at, "table");
          for (const d of r.details) {
            const tr = el(table, "tr");
            el(tr, "td", d.path);
            el(tr, "td", actionLabels[d.action]);
            el(tr, "td", d.status);
          }
        }).open(),
      );
    }
  }
  private operations(at: HTMLElement) {
    const main = el(at, "main"),
      head = el(main, "div", "", "ss-between");
    title(
      head,
      "Центр операций",
      "Каждый запуск имеет план и отдельный результат.",
    );
    button(
      head,
      this.studio.paused
        ? "Возобновить автозапуск"
        : "Приостановить автозапуск",
      () => {
        this.studio.paused = !this.studio.paused;
        this.render();
      },
    );
    const g = grid(main),
      left = card(g),
      right = card(g);
    title(left, "Ожидают решения");
    const pending = this.studio.getPendingPlans();
    if (!pending.length)
      el(left, "p", "Нет планов, ожидающих подтверждения.", "ss-muted");
    for (const p of pending) {
      const r = row(left, p.profile.name);
      button(r, "Открыть план", () => this.preview(p));
    }
    title(right, "Проверить вручную");
    for (const p of this.studio.data.profiles) {
      const r = row(right, p.name, directions[p.direction]);
      button(r, "Проверить", async () =>
        this.preview(await this.studio.inspect(p)),
      ).disabled = this.studio.busy;
    }
    this.history(main);
  }
  private importPage(at: HTMLElement) {
    const main = el(at, "main");
    title(
      main,
      "Соедините нужные папки",
      "Импорт идёт через это устройство. Промежуточные файлы не добавляются в vault.",
    );
    const draft = newProfile();
    draft.name = "Импорт внешних материалов";
    draft.direction = "push";
    draft.sourceKind = "folder";
    draft.sourceRoot = "";
    draft.sourceBranch = "main";
    const g = grid(main),
      left = card(g),
      right = card(g);
    title(left, "Откуда брать файлы");
    select(
      left,
      "Источник",
      "folder",
      Object.fromEntries([
        ["folder", "Папка на компьютере"],
        ...this.studio.data.connections.map((c) => [c.id, c.name]),
      ]),
      (v) => {
        draft.sourceKind = v === "folder" ? "folder" : "connection";
        draft.sourceConnectionId = v === "folder" ? undefined : v;
      },
    );
    text(
      left,
      "Абсолютный путь / ID папки / owner/repo",
      "",
      (v) => (draft.sourceRoot = v),
    );
    text(
      left,
      "Ветка GitHub (если применимо)",
      "main",
      (v) => (draft.sourceBranch = v),
    );
    text(
      left,
      "Подкаталог GitHub (необязательно)",
      "",
      (v) => (draft.sourceSubpath = v),
    );
    el(
      left,
      "p",
      "Внешняя папка используется только для чтения. Символические ссылки не обходятся.",
      "ss-muted",
    );
    title(right, "Куда поместить");
    const targets = this.studio.data.connections.filter(
      (c) => c.provider === "gdrive" || c.provider === "yandex",
    );
    draft.connectionId = targets[0]?.id || "";
    select(
      right,
      "Подключение назначения",
      draft.connectionId,
      Object.fromEntries(targets.map((c) => [c.id, c.name])),
      (v) => (draft.connectionId = v),
    );
    text(
      right,
      "Существующая папка Drive / путь Яндекс Диска",
      "",
      (v) => (draft.remoteRoot = v),
    );
    text(right, "Название профиля", draft.name, (v) => (draft.name = v));
    select(
      right,
      "При совпадении имён",
      draft.conflict,
      policies,
      (v) => (draft.conflict = v as Profile["conflict"]),
    );
    if (!targets.length)
      button(right, "Добавить подключение", () => this.connections());
    banner(
      main,
      "По умолчанию импорт переносит заметки и вложения, без удалений. Состав и расписание можно изменить в созданном профиле. Лимит файла — 50 МБ.",
    );
    button(
      main,
      "Создать профиль и проверить файлы",
      async () => {
        if (!draft.sourceRoot || !draft.remoteRoot || !draft.connectionId)
          throw Error("Заполните источник и назначение");
        this.studio.data.profiles.push(draft);
        this.active = draft.id;
        this.page = "profiles";
        this.tab = "route";
        await this.save();
        this.preview(await this.studio.inspect(draft));
      },
      true,
    ).disabled = this.studio.busy;
  }
  private capabilities() {
    new Dialog(this.app, (at) => {
      title(
        at,
        "Возможности",
        "Основные источники входят в сборку; устанавливать модули не требуется.",
      );
      for (const [name, desc] of [
        [
          "Google Drive OAuth",
          "Существующие папки: получение, отправка, двусторонняя работа.",
        ],
        ["Публичный Google Drive", "Получение по folder ID и API key."],
        ["Яндекс Диск", "OAuth-токен; получение и отправка."],
        ["GitHub", "Публичные и приватные репозитории; только получение."],
        [
          "Пакетное обновление плагинов",
          "Пока только обнаружение в плане; код автоматически не заменяется.",
        ],
        ["Мобильные устройства", "Не поддерживаются этой desktop alpha."],
      ])
        row(at, name, desc);
    }).open();
  }
  private connections() {
    new Dialog(this.app, (at, m) => {
      title(
        at,
        "Подключения",
        "Аккаунты независимы от профилей. Секреты хранятся через Obsidian Secret Storage.",
      );
      for (const c of this.studio.data.connections) {
        const r = row(at, c.name, providers[c.provider]);
        button(r, "Настроить", () => {
          m.close();
          this.editConnection(c);
        }).disabled = this.studio.busy;
      }
      button(at, "＋ Добавить", () => {
        m.close();
        const id = crypto.randomUUID();
        this.editConnection(
          {
            id,
            name: "Новое подключение",
            provider: "gdrive",
            secretRef: "sync-studio-" + id,
          },
          true,
        );
      }).disabled = this.studio.busy;
    }).open();
  }
  private editConnection(original: Connection, isNew = false) {
    const c = structuredClone(original);
    new Dialog(this.app, (at, m) => {
      title(at, "Подключение");
      text(at, "Название", c.name, (v) => (c.name = v));
      const provider = select(
        at,
        "Сервис",
        c.provider,
        providers,
        (v) => (c.provider = v as Connection["provider"]),
      );
      provider.disabled = !isNew;
      let value = "";
      text(
        at,
        "Токен / API key (кроме Google OAuth)",
        value,
        (v) => (value = v),
        "password",
      );
      el(
        at,
        "p",
        "Для Google OAuth импортируйте JSON клиента типа Desktop app из Google Cloud. У существующего подключения пустое поле токена сохраняет прежний секрет.",
        "ss-muted",
      );
      const label = el(at, "label", "", "ss-field");
      el(label, "span", "Google Desktop OAuth client JSON");
      const json = el(label, "textarea");
      json.rows = 5;
      json.placeholder = '{"installed": {"client_id": "…"}}';
      const file = el(label, "input");
      file.type = "file";
      file.accept = ".json,application/json";
      file.onchange = () => {
        const f = file.files?.[0];
        if (f)
          void f.text().then((s) => {
            json.value = s;
          });
      };
      const persist = async () => {
        if (!c.name.trim()) throw Error("Укажите название");
        if (isNew) {
          if (!this.studio.data.connections.some((x) => x.id === c.id))
            this.studio.data.connections.push(c);
        } else Object.assign(original, c);
        await this.studio.save();
      };
      button(
        at,
        "Подключить Google OAuth",
        async () => {
          if (c.provider !== "gdrive")
            throw Error("Выберите Google Drive OAuth");
          await this.studio.connectGoogle(c, json.value);
          await persist();
          m.close();
          this.render();
        },
        true,
      );
      button(at, "Сохранить", async () => {
        if (c.provider === "gdrive" && !c.clientId)
          throw Error("Сначала выполните Google OAuth");
        if (value) this.studio.setSecret(c, value);
        if (
          c.provider !== "github" &&
          c.provider !== "gdrive" &&
          !this.studio.getSecret(c)
        )
          throw Error("Требуется токен / API key");
        await persist();
        m.close();
        this.render();
      });
      if (!isNew)
        button(at, "Отключить на этом устройстве", async () => {
          await this.studio.disconnect(original);
          m.close();
          this.render();
        });
      banner(
        at,
        "Выбор папки ограничивает работу профиля, но не OAuth-права аккаунта. Google OAuth запрашивает drive для существующих файлов. Отозвать доступ полностью можно в настройках Google-аккаунта.",
      );
    }).open();
  }
  private async folderScope(p: Profile) {
    await this.studio.exclusive("Получение дерева папок", async (signal) => {
      const source =
        p.direction === "push"
          ? await this.studio.local(p)
          : await this.studio.remote(p);
      const snap = await source.scan(signal);
      if (!snap.complete) throw Error("Дерево неполно");
      const dirs = new Set<string>();
      for (const f of Object.keys(snap.files)) {
        const parts = f.split("/");
        parts.pop();
        let at = "";
        for (const part of parts) {
          at = at ? at + "/" + part : part;
          dirs.add(at);
        }
      }
      const chosen = new Set(p.folders);
      new Dialog(this.app, (at, m) => {
        title(
          at,
          "Папки источника",
          "Выбор родительской папки включает всё её содержимое.",
        );
        if (!dirs.size)
          el(
            at,
            "p",
            "В корне нет вложенных папок с файлами. Выберите область «Весь корень».",
          );
        for (const d of [...dirs].sort()) {
          const c = check(at, d, chosen.has(d), (on) => {
            if (on) chosen.add(d);
            else chosen.delete(d);
          });
          c.parentElement!.style.paddingLeft =
            (d.split("/").length - 1) * 16 + "px";
        }
        button(
          at,
          "Использовать выбранные",
          async () => {
            if (!chosen.size) throw Error("Выберите хотя бы одну папку");
            p.scope = "folders";
            p.folders = [...chosen];
            await this.save();
            m.close();
          },
          true,
        );
      }).open();
    });
  }
  private async pickDrive(p: Profile) {
    await this.studio.exclusive("Чтение папок Drive", async (signal) => {
      const temp = { ...p, remoteRoot: p.remoteRoot || "root" };
      const store = await this.studio.remote(temp);
      if (!(store instanceof DriveStore)) throw Error("Выберите Google Drive");
      const stack: { id: string; name: string }[] = [
        { id: p.remoteRoot ? "root" : "root", name: "Начальная папка" },
      ];
      const { driveRoot } = await import("./sources/remotes");
      stack[0].id = driveRoot(temp.remoteRoot);
      const navigate = async (id: string, name: string) => {
        const folders = (await store.children(id, signal)).filter(
          (f) => f.mimeType === "application/vnd.google-apps.folder",
        );
        new Dialog(this.app, (at, m) => {
          title(
            at,
            name,
            "Выберите существующую папку; файлы других приложений не скрываются.",
          );
          for (const f of folders) {
            const r = row(at, f.name);
            button(r, "Открыть", async () => {
              m.close();
              await this.pickDrive({ ...p, remoteRoot: f.id });
            });
            button(r, "Выбрать", async () => {
              const target = this.studio.data.profiles.find(
                (x) => x.id === p.id,
              )!;
              target.remoteRoot = f.id;
              await this.save();
              m.close();
            });
          }
          button(
            at,
            "Использовать текущую папку",
            async () => {
              const target = this.studio.data.profiles.find(
                (x) => x.id === p.id,
              )!;
              target.remoteRoot = id;
              await this.save();
              m.close();
            },
            true,
          );
        }).open();
      };
      await navigate(stack[0].id, p.remoteRoot || "Мой диск");
    });
  }
  private preview(plan: Plan) {
    new Dialog(this.app, (at, m) => {
      title(
        at,
        "Перед синхронизацией",
        plan.profile.name + " · " + directions[plan.profile.direction],
      );
      const summary = el(at, "div", "", "ss-actions");
      badge(
        summary,
        `Операций: ${plan.operations.filter((o) => !["adopt", "skip"].includes(o.action)).length}`,
      );
      badge(summary, "Удаления: " + plan.profile.deletion);
      for (const warning of plan.warnings) banner(at, warning);
      const rows = plan.operations.filter((o) => o.action !== "adopt");
      if (!rows.length)
        banner(
          at,
          "Файлы актуальны. Выполнение зафиксирует состояние без изменения содержимого.",
        );
      const scroll = el(at, "div", "", "ss-table-scroll"),
        table = el(scroll, "table"),
        head = el(table, "tr");
      for (const x of ["Файл", "Действие", "Причина"]) el(head, "th", x);
      for (const op of rows) {
        const r = el(table, "tr");
        el(r, "td", op.path);
        const cell = el(r, "td");
        el(cell, "span", actionLabels[op.action]);
        el(r, "td", op.reason);
        if (
          op.action === "conflict" &&
          category(
            join(plan.profile.localRoot, op.path),
            this.app.vault.configDir,
          ) !== "plugin-code"
        )
          button(cell, "Решить", () =>
            this.resolve(plan, op, () => {
              m.close();
              this.preview(plan);
            }),
          );
      }
      banner(
        at,
        "Перед записью версии будут проверены повторно. Новые изменения потребуют нового плана. Неразрешённые конфликты останутся нетронутыми.",
      );
      const actions = el(at, "div", "", "ss-actions");
      button(actions, "Отмена", () => m.close());
      button(
        actions,
        "Выполнить этот план",
        async () => {
          m.close();
          const log = await this.studio.apply(plan);
          new Notice(log.message);
          this.page = "operations";
          this.render();
        },
        true,
      ).disabled = this.studio.busy;
    }).open();
  }
  private resolve(plan: Plan, op: Operation, done: () => void) {
    new Dialog(this.app, (at, m) => {
      title(at, op.path, op.reason);
      const g = grid(at);
      for (const [label, f] of [
        ["На устройстве", op.local],
        ["В источнике", op.remote],
      ] as const) {
        const c = card(g);
        el(c, "h3", label);
        if (f) {
          el(c, "p", `${f.size} байт`);
          el(
            c,
            "small",
            f.mtime ? new Date(f.mtime).toLocaleString() : "Время недоступно",
          );
          el(c, "code", f.hash.slice(0, 24));
        } else el(c, "p", "Удалён / отсутствует");
      }
      const set = (action: Operation["action"]) => {
        op.action = action;
        op.reason = "Решено пользователем для этой пары версий";
        m.close();
        done();
      };
      if (op.local && op.remote) {
        button(at, "Сохранить обе", () => set("keep-both"), true);
        button(at, "Локальный", () =>
          set(plan.profile.direction === "pull" ? "adopt" : "upload"),
        );
        button(at, "Удалённый", () =>
          set(plan.profile.direction === "push" ? "adopt" : "download"),
        );
      } else {
        button(at, "Оставить существующий", () => set("adopt"));
        if (plan.profile.deletion !== "ignore")
          button(at, "Применить удаление", () =>
            set(op.local ? "delete-local" : "delete-remote"),
          );
      }
    }).open();
  }
}
