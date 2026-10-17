export const MODULE_ID = "ssl_ciphers";

export const SETTINGS = {
  puzzles: "puzzles",
  tables: "tables",
  lastPuzzle: "lastPuzzle",
};

/** Флаги пользователя: что ведущий выдал игроку и как игрок разложил свои вещи. */
export const FLAGS = {
  inbox: "inbox",
  state: "state",
};

/** Запросы игрок → ведущий (User#query): изменить общий стол. */
export const QUERY = {
  table: `${MODULE_ID}.table`,
};

/** Куда в данных мира ложатся картинки для журнала. */
export const imageDir = () => `worlds/${game.world.id}/${MODULE_ID}`;

export const tpl = (path) => `modules/${MODULE_ID}/templates/${path}`;
