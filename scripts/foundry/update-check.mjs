/* «Вышла новая версия». Ведущий входит в мир — модуль спрашивает GitHub, какой релиз последний (не
   чаще раза в час: перезагрузки страницы не в счёт); если он новее установленного, ведущему всплывает
   окошко: что нового и как обновить. Так же сделано в «Западне» и «Таверне».
   Окошко — один раз на версию («Понятно») или снова завтра («Напомнить завтра»). Игроки ничего
   не видят; проверку можно выключить в настройках модуля.
   «Что нового» берётся из описания релиза, а его собирает из CHANGELOG.md scripts-dev/release-notes.mjs. */

import { inlineHtml, isNewer, parseReleaseNotes, repoOf, versionOf } from "../core/release.mjs";
import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { esc, t } from "./i18n.mjs";
import { setSetting, setting } from "./settings.mjs";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Ответ GitHub помним час: новый релиз ведущий увидит при следующем входе, а не через сутки. */
const CHECK_EVERY = HOUR;
const FALLBACK_REPO = "klimenkoyg/foundry-cipher";
/** Сколько пунктов «что нового» показать в окошке; остальное — на странице релиза. */
const MAX_ITEMS = 6;

/** Последний релиз на GitHub → { version, notes, url } или null (нет сети, лимит запросов). */
async function fetchLatest(repo) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.tag_name || data.draft || data.prerelease) return null;
    return { version: versionOf(data.tag_name), notes: String(data.body ?? "").slice(0, 12000), url: String(data.html_url ?? "") };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Содержимое окошка: что установлено, что нового (на языке Foundry), как обновить. */
function content(state, installed) {
  const notes = parseReleaseNotes(state.notes);
  const ru = String(game.i18n.lang ?? "").startsWith("ru");
  const list = (items) => `<ul>${items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ul>`;
  let news = "";
  if (ru && notes.ru.length) {
    const shown = notes.ru.slice(0, MAX_ITEMS);
    const more = notes.ru.length - shown.length;
    news = list(shown) + (more > 0 ? `<p class="cp-update__more">${esc(t("Update.more", { n: more }))}</p>` : "");
  } else if (!ru && notes.en) {
    // По-английски в CHANGELOG — один абзац «**English.** …»; нет его — список не показываем.
    news = `<p>${inlineHtml(notes.en)}</p>`;
  }
  const link = /^https:\/\/github\.com\//.test(state.url ?? "")
    ? `<p><a href="${esc(state.url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square" inert></i> ${esc(t("Update.page"))}</a></p>`
    : "";
  return `<div class="ssl-ciphers cp-update">
    <p class="cp-update__lead">${esc(t("Update.lead", { installed, version: state.version }))}</p>
    ${news ? `<h4>${esc(t("Update.whatsNew"))}</h4>${news}` : ""}
    <p class="cp-update__how"><i class="fa-solid fa-circle-info" inert></i> ${esc(t("Update.how"))}</p>
    ${link}
  </div>`;
}

/** Окошко ведущему → "seen" (понятно), "later" (напомнить завтра) или null (закрыли). */
async function showUpdate(state, installed) {
  const { DialogV2 } = foundry.applications.api;
  try {
    return await DialogV2.wait({
      window: { title: t("Update.title", { version: state.version }), icon: "fa-solid fa-key" },
      content: content(state, installed),
      buttons: [
        { action: "seen", label: t("Update.ok"), icon: "fa-solid fa-check", default: true, callback: () => "seen" },
        { action: "later", label: t("Update.later"), icon: "fa-solid fa-clock", callback: () => "later" },
      ],
      rejectClose: false,
    });
  } catch {
    return null;
  }
}

/**
 * Проверить, вышла ли новая версия, и показать окошко. Только у ведущего; GitHub спрашиваем не
 * чаще раза в час (ответ хранится в настройке этого ведущего). force — спросить сейчас.
 */
export async function checkForUpdate({ force = false } = {}) {
  if (!game.user?.isGM || setting(SETTINGS.updateCheck) === false) return null;
  const mod = game.modules.get(MODULE_ID);
  const installed = versionOf(mod?.version);
  if (!installed) return null;

  const state = { ...(setting(SETTINGS.updateState) ?? {}) };
  const now = Date.now();
  if (force || !state.checkedAt || now - state.checkedAt > CHECK_EVERY) {
    const latest = await fetchLatest(repoOf(mod?.url) ?? FALLBACK_REPO);
    state.checkedAt = now;
    if (latest) Object.assign(state, latest);
    await setSetting(SETTINGS.updateState, state);
  }

  if (!state.version || !isNewer(state.version, installed)) return null;
  if (state.seen === state.version) return null;
  if (state.snoozeUntil && now < state.snoozeUntil) return null;

  const answer = await showUpdate(state, installed);
  // Закрыли крестиком — как «напомнить завтра»: окно не должно всплывать при каждом входе.
  if (answer === "seen") state.seen = state.version;
  else state.snoozeUntil = now + DAY;
  await setSetting(SETTINGS.updateState, state);
  return answer;
}
