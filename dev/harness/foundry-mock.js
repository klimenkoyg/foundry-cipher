/* Имитация API Foundry VTT для стенда: ровно то, чем пользуется модуль.
   Это НЕ Foundry — только чтобы прогнать настоящий код модуля в браузере без установки. */
(() => {
  "use strict";
  const MODULE = "ssl_ciphers";
  const clone = (v) => (v === undefined ? v : structuredClone(v));

  /* ---------- Hooks ---------- */
  let hookId = 0;
  const Hooks = {
    _h: {},
    on(name, fn) {
      const id = ++hookId;
      (this._h[name] ??= []).push({ id, fn });
      return id;
    },
    once(name, fn) {
      const id = this.on(name, (...a) => {
        this.off(name, id);
        return fn(...a);
      });
      return id;
    },
    off(name, ref) {
      this._h[name] = (this._h[name] ?? []).filter((h) => h.id !== ref && h.fn !== ref);
    },
    callAll(name, ...args) {
      for (const h of [...(this._h[name] ?? [])]) h.fn(...args);
      return true;
    },
    call(name, ...args) {
      return this.callAll(name, ...args);
    },
  };

  /* ---------- сохранение стенда ---------- */
  const STORE_KEY = "ciphers-harness";
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    } catch {
      return {};
    }
  })();
  saved.settings ??= {};
  saved.flags ??= {};
  const persist = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      /* приватный режим */
    }
  };

  /* ---------- пути объекта ---------- */
  const getProperty = (obj, path) => path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
  const hasProperty = (obj, path) => getProperty(obj, path) !== undefined;
  function expand(flatData) {
    const out = {};
    for (const [path, value] of Object.entries(flatData)) {
      const keys = path.split(".");
      let o = out;
      while (keys.length > 1) o = o[keys.shift()] ??= {};
      o[keys[0]] = value;
    }
    return out;
  }
  /** Слияние как в Foundry: объекты сливаются, массивы заменяются, ключ «-=x» удаляет x. */
  function mergeInto(target, src) {
    for (const [k, v] of Object.entries(src)) {
      if (k.startsWith("-=")) {
        delete target[k.slice(2)];
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== "object" || Array.isArray(target[k])) target[k] = {};
        mergeInto(target[k], v);
      } else target[k] = clone(v);
    }
    return target;
  }

  /* ---------- пользователи ---------- */
  const users = [];
  function makeUser(id, name, { isGM = false, character = null, color = "#c0a060", active = true } = {}) {
    const user = {
      id,
      name,
      isGM,
      active,
      character,
      color: { css: color },
      get isSelf() {
        return game.user === user;
      },
      get flags() {
        return (saved.flags[id] ??= {});
      },
      // Сервер Foundry доставляет запрос адресату; здесь все «клиенты» живут на одной странице.
      query(name_, data) {
        const handler = CONFIG.queries[name_];
        return new Promise((resolve, reject) => {
          if (!handler) return reject(new Error(`нет обработчика ${name_}`));
          const me = game.user;
          setTimeout(() => {
            game.user = user; // обработчик выполняется «у адресата»
            Promise.resolve(handler(clone(data)))
              .then((r) => resolve(clone(r)), reject)
              .finally(() => (game.user = me));
          }, 30);
        });
      },
      getFlag(scope, key) {
        return clone(getProperty(this.flags[scope] ?? {}, key));
      },
      async update(data) {
        const diff = expand(clone(data));
        mergeInto(this.flags, diff.flags ?? {});
        persist();
        // как в Foundry: обновление доходит до всех «клиентов» — здесь все они живут на одной странице
        await new Promise((r) => setTimeout(r, 20));
        Hooks.callAll("updateUser", user, diff, {}, game.user.id);
        return user;
      },
      setFlag(scope, key, value) {
        return this.update({ [`flags.${scope}.${key}`]: value });
      },
      unsetFlag(scope, key) {
        const keys = key.split(".");
        const last = keys.pop();
        return this.update({ [`flags.${scope}${keys.length ? `.${keys.join(".")}` : ""}.-=${last}`]: null });
      },
    };
    users.push(user);
    return user;
  }
  const gm = makeUser("u-gm", "Ведущий", { isGM: true, color: "#d9b46a" });
  makeUser("u-yura", "Юра", { character: { name: "Элеция" }, color: "#7fb3d5" });
  makeUser("u-katya", "Катя", { character: { name: "Ильва" }, color: "#c39bd3", active: false });

  const collection = (list) => ({
    get: (id) => list.find((x) => x.id === id) ?? null,
    filter: (fn) => list.filter(fn),
    find: (fn) => list.find(fn),
    map: (fn) => list.map(fn),
    get contents() {
      return list;
    },
    [Symbol.iterator]: () => list[Symbol.iterator](),
  });

  /* ---------- настройки ---------- */
  const settings = {
    _reg: new Map(),
    register(ns, key, data) {
      this._reg.set(`${ns}.${key}`, data);
    },
    get(ns, key) {
      const k = `${ns}.${key}`;
      return k in saved.settings ? clone(saved.settings[k]) : clone(this._reg.get(k)?.default);
    },
    async set(ns, key, value) {
      const k = `${ns}.${key}`;
      saved.settings[k] = clone(value);
      persist();
      this._reg.get(k)?.onChange?.(clone(value));
      return value;
    },
  };

  /* ---------- game, CONFIG, ui ---------- */
  const params = new URLSearchParams(location.search);
  window.Hooks = Hooks;
  window.CONFIG = { queries: {} };
  window.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
  window.game = {
    user: gm,
    users: Object.assign(collection(users), {
      get activeGM() {
        return gm;
      },
    }),
    settings,
    world: { id: "harness-world" },
    modules: { get: (id) => (id === MODULE ? (game._module ??= { id }) : null) },
    clipboard: { copyPlainText: (text) => navigator.clipboard.writeText(text) },
    i18n: {
      lang: params.get("lang") ?? "ru",
      translations: {},
      _find(key) {
        return getProperty(this.translations, key);
      },
      localize(key) {
        const v = this._find(key);
        return typeof v === "string" ? v : key;
      },
      has(key) {
        return typeof this._find(key) === "string";
      },
    },
  };
  window.ui = {
    notifications: Object.fromEntries(["info", "warn", "error"].map((level) => [level, (msg) => window.__harness?.toast?.(level, msg)])),
  };

  const ChatMessage = {
    async create(data) {
      window.__harness?.chat?.(data);
      return { id: Math.random().toString(36).slice(2) };
    },
  };
  ChatMessage.implementation = ChatMessage;
  const journal = [];
  const JournalEntry = {
    async create(data) {
      const entry = { id: Math.random().toString(36).slice(2), ...clone(data), sheet: { render: () => window.__harness?.journal?.(entry) } };
      journal.push(entry);
      return entry;
    },
  };
  JournalEntry.implementation = JournalEntry;
  const uploads = new Map();
  const FilePicker = {
    async createDirectory(source, path) {
      if (uploads.has(`dir:${path}`)) throw new Error("EEXIST");
      uploads.set(`dir:${path}`, true);
    },
    async upload(source, path, file) {
      const url = URL.createObjectURL(file);
      uploads.set(`${path}/${file.name}`, url);
      return { status: "success", path: url };
    },
  };
  FilePicker.implementation = FilePicker;

  /* ---------- Handlebars: помощники Foundry ---------- */
  Handlebars.registerHelper("localize", (key) => game.i18n.localize(key));
  const templateCache = new Map();
  const route = (path) => `/${String(path).replace(/^\/+/, "").replace(`modules/${MODULE}/`, "")}`;
  async function getTemplate(path) {
    if (!templateCache.has(path)) {
      const res = await fetch(route(path), { cache: "no-store" });
      if (!res.ok) throw new Error(`шаблон не найден: ${path}`);
      templateCache.set(path, Handlebars.compile(await res.text()));
    }
    return templateCache.get(path);
  }

  /* ---------- ApplicationV2 ---------- */
  function merge(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b ?? {})) {
      out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof a?.[k] === "object" && !Array.isArray(a[k]) ? merge(a[k], v) : v;
    }
    return out;
  }
  const instances = new Map();
  let z = 100;

  class ApplicationV2 {
    static DEFAULT_OPTIONS = {};
    constructor(options = {}) {
      const chain = [];
      for (let c = this.constructor; c && c !== Object; c = Object.getPrototypeOf(c)) {
        if (Object.hasOwn(c, "DEFAULT_OPTIONS")) chain.unshift(c.DEFAULT_OPTIONS);
      }
      this.options = [...chain, options].reduce(merge, {});
      this.position = { ...(this.options.position ?? {}) };
      this.element = null;
      this.rendered = false;
    }
    get id() {
      return this.options.id ?? (this._autoId ??= `app-${Math.random().toString(36).slice(2)}`);
    }
    get title() {
      return this.options.window?.title ?? "";
    }

    async render(options = {}) {
      if (typeof options === "boolean") options = { force: options };
      this._queue = (this._queue ?? Promise.resolve()).then(() => this.#render(options)).catch((err) => {
        console.error(err);
        window.__harness?.toast?.("error", `Ошибка отрисовки: ${err.message}`);
      });
      return this._queue;
    }

    async #render(options) {
      const first = !this.element;
      if (first && !options.force) return this;
      const all = Object.keys(this.constructor.PARTS ?? {});
      options = { ...options, parts: first ? all : (options.parts ?? all).filter((p) => all.includes(p)) };
      if (first) {
        this.element = await this._renderFrame(options);
        document.querySelector("#windows").append(this.element);
        instances.set(this.id, this);
      }
      const context = await this._prepareContext(options);
      if (!this.element) return this;
      await this._renderHTML(context, options);
      if (!this.element) return this;
      this.element.querySelector(".window-title").textContent = this.title;
      this.rendered = true;
      if (first) await this._onFirstRender(context, options);
      await this._onRender(context, options);
      return this;
    }

    async _renderFrame() {
      const el = document.createElement("div");
      el.id = this.id;
      el.className = ["application", ...(this.options.classes ?? [])].join(" ");
      const { width, height, left, top } = this.position;
      const px = (v) => (typeof v === "number" ? `${v}px` : "auto");
      el.style.cssText = `width:${px(width)};height:${px(height)};left:${left ?? 24 + instances.size * 32}px;top:${top ?? 12 + instances.size * 32}px;z-index:${++z}`;
      el.innerHTML = `
        <header class="window-header">
          <i class="window-icon ${this.options.window?.icon ?? ""}"></i>
          <h1 class="window-title"></h1>
          <button type="button" class="header-control icon fa-solid fa-ellipsis-vertical" data-action="toggleControls" aria-label="Ещё"></button>
          <button type="button" class="header-control icon fa-solid fa-xmark" data-action="close" aria-label="Закрыть"></button>
        </header>
        <section class="window-content"></section>
        ${this.options.window?.resizable ? '<div class="window-resize-handle"></div>' : ""}`;
      el.addEventListener("pointerdown", () => this.bringToFront());
      el.addEventListener("click", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target || !el.contains(target)) return;
        const action = target.dataset.action;
        if (action === "close") return this.close();
        const entry = this.options.actions?.[action];
        const handler = typeof entry === "function" ? entry : entry?.handler;
        if (!handler) return console.warn(`нет действия «${action}»`);
        Promise.resolve(handler.call(this, event, target)).catch((err) => {
          console.error(err);
          window.__harness?.toast?.("error", `Ошибка действия «${action}»: ${err.message}`);
        });
      });
      const drag = (handle, onMove) =>
        handle?.addEventListener("pointerdown", (ev) => {
          if (ev.target.closest("button")) return;
          ev.preventDefault();
          const start = { x: ev.clientX, y: ev.clientY, left: el.offsetLeft, top: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
          const move = (e) => onMove(start, e.clientX - start.x, e.clientY - start.y);
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        });
      drag(el.querySelector(".window-header"), (s, dx, dy) => {
        el.style.left = `${s.left + dx}px`;
        el.style.top = `${Math.max(0, s.top + dy)}px`;
      });
      drag(el.querySelector(".window-resize-handle"), (s, dx, dy) => {
        el.style.width = `${Math.max(320, s.w + dx)}px`;
        el.style.height = `${Math.max(240, s.h + dy)}px`;
      });
      return el;
    }

    async _prepareContext() {
      return {};
    }
    async _renderHTML() {}
    _onFirstRender() {}
    _onRender() {}
    _onClose() {}
    bringToFront() {
      if (this.element) this.element.style.zIndex = ++z;
    }
    async close(options = {}) {
      if (!this.element) return this;
      this.element.remove();
      this.element = null;
      this.rendered = false;
      instances.delete(this.id);
      this._onClose(options);
      return this;
    }
  }

  const HandlebarsApplicationMixin = (Base) =>
    class extends Base {
      async _preparePartContext(partId, context) {
        return context;
      }
      async _renderHTML(context, options) {
        const parts = this.constructor.PARTS;
        const content = this.element.querySelector(".window-content");
        for (const [id, part] of Object.entries(parts)) {
          if (!options.parts.includes(id)) continue;
          const template = await getTemplate(part.template);
          const partContext = await this._preparePartContext(id, { ...context }, options);
          if (!this.element) return;
          const holder = document.createElement("template");
          holder.innerHTML = template(partContext, { allowProtoPropertiesByDefault: true, allowProtoMethodsByDefault: true }).trim();
          if (holder.content.children.length !== 1) throw new Error(`Часть «${id}» должна давать ровно один корневой элемент (сейчас ${holder.content.children.length})`);
          const el = holder.content.firstElementChild;
          el.dataset.applicationPart = id;
          const prev = content.querySelector(`:scope > [data-application-part="${id}"]`);
          // как в Foundry: прокрутка частей сохраняется при перерисовке
          const scroll = (part.scrollable ?? []).map((sel) => [sel, prev?.querySelector(sel)?.scrollTop ?? 0]);
          if (prev) prev.replaceWith(el);
          else {
            const order = Object.keys(parts);
            const next = [...content.children].find((c) => order.indexOf(c.dataset.applicationPart) > order.indexOf(id));
            content.insertBefore(el, next ?? null);
          }
          for (const [sel, top] of scroll) {
            const s = el.querySelector(sel);
            if (s) s.scrollTop = top;
          }
        }
      }
    };

  /* ---------- DialogV2 ---------- */
  const DialogV2 = {
    wait({ window: win, content, buttons }) {
      return new Promise((resolve) => {
        const back = document.createElement("div");
        back.className = "mock-dialog";
        back.innerHTML = `<form><h3>${win?.title ?? ""}</h3><div class="mock-dialog__body">${content ?? ""}</div><footer></footer></form>`;
        const form = back.querySelector("form");
        form.addEventListener("submit", (e) => e.preventDefault());
        for (const b of buttons) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = b.label;
          btn.dataset.dialogAction = b.action;
          btn.addEventListener("click", async (event) => {
            const value = b.callback ? await b.callback(event, btn, null) : b.action;
            back.remove();
            resolve(value);
          });
          form.querySelector("footer").append(btn);
        }
        document.body.append(back);
      });
    },
    confirm({ window: win, content }) {
      return this.wait({
        window: win,
        content,
        buttons: [
          { action: "yes", label: "Да", callback: () => true },
          { action: "no", label: "Нет", callback: () => false },
        ],
      });
    },
  };

  window.foundry = {
    utils: {
      deepClone: clone,
      getProperty,
      hasProperty,
      getRoute: route,
      randomID: (n = 16) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join(""),
      escapeHTML: (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]),
    },
    documents: { ChatMessage, JournalEntry },
    applications: {
      instances,
      api: { ApplicationV2, HandlebarsApplicationMixin, DialogV2 },
      apps: { FilePicker },
      handlebars: {
        _pending: Promise.resolve(),
        loadTemplates(map) {
          this._pending = Promise.all(
            Object.entries(map).map(async ([name, path]) => {
              const res = await fetch(route(path), { cache: "no-store" });
              Handlebars.registerPartial(name, await res.text());
            }),
          );
          return this._pending;
        },
      },
    },
  };

  window.__mock = {
    users,
    gm,
    journal,
    reset() {
      localStorage.removeItem(STORE_KEY);
      location.reload();
    },
    /** Чистый мир без перезагрузки — для сценариев снимков. */
    wipe() {
      saved.settings = {};
      saved.flags = {};
      persist();
    },
  };
})();
