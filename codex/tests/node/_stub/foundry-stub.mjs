/**
 * The one Foundry surface Codex's pure modules read in Node: game.settings.get, seeded per test.
 */
const settings = new Map();

globalThis.game = {
  settings: { get: (namespace, key) => settings.get(`${namespace}.${key}`) },
};

/** Test helper: seed a setting value. */
export function setSetting(namespace, key, value) {
  settings.set(`${namespace}.${key}`, value);
}

/** Test helper: clear every seeded value. */
export function resetSettings() {
  settings.clear();
}
