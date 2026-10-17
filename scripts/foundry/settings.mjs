import { MODULE_ID, SETTINGS } from "./constants.mjs";

export const setting = (key) => game.settings.get(MODULE_ID, key);

export const setSetting = (key, value) => game.settings.set(MODULE_ID, key, value);

export function registerSettings({ onPuzzles, onTables }) {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);
  // Шифры мира вместе с ответами: пишет только ведущий.
  reg(SETTINGS.puzzles, { scope: "world", config: false, type: Object, default: {}, onChange: onPuzzles });
  // Общие столы: шифр без ответа, кто за столом и как лежат вещи. Пишет ведущий, в том числе по просьбе игроков.
  reg(SETTINGS.tables, { scope: "world", config: false, type: Object, default: {}, onChange: onTables });
  reg(SETTINGS.lastPuzzle, { scope: "client", config: false, type: String, default: "" });
}
