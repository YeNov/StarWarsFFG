// @ts-check
/**
 * Connects Playwright to the Foundry test world: the world allowlist, waiting for a game to be
 * ready, and separate browser sessions for the GM and throwaway players. See tests/README.md.
 *
 *   import { test, expect } from "../playwright/foundry.js";
 *
 *   test("an observer can open the sheet but not edit it", async ({ sessions }) => {
 *     const observer = await sessions.player();
 *     const actor = await sessions.create("Actor", {
 *       name: "hero", type: "character",
 *       ownership: { default: 0, [observer.user.id]: CONST_OWNERSHIP.OBSERVER },
 *     });
 *     await observer.page.evaluate((id) => game.actors.get(id).sheet.render(true), actor.id);
 *     ...
 *   });
 *
 * `sessions.gm` is the test's own `page`, joined as the GM by the global setup. Each player is a
 * new user with a random per-run password, joined in its own browser context. When the test ends,
 * the player contexts are closed and every document and user the test created through `sessions`
 * is deleted, pass or fail. Nothing is written to disk: player sessions live only in memory.
 */

import { randomBytes } from "node:crypto";
import { test as base, expect } from "@playwright/test";

/** Foundry's ownership levels, for `ownership` maps in creation data. */
export const CONST_OWNERSHIP = Object.freeze({ NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 });

/** Foundry's user roles, for `sessions.player({ role })`. */
export const CONST_ROLES = Object.freeze({ PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 });

/** The worlds the tests may touch: FVTT_TEST_WORLDS, comma-separated, default "test". */
export function testWorlds() {
  return (process.env.FVTT_TEST_WORLDS ?? "test").split(",").map((name) => name.trim()).filter(Boolean);
}

/**
 * A client that connects in the first moments after the world activates can receive incomplete
 * game data and never reach `ready` (seen on V14 build 364). The world counts as ready once
 * /api/status reports this much uptime; tools/foundry-test-server.mjs waits the same way.
 */
const WORLD_SETTLE_MS = 5_000;

/**
 * Waits until Foundry at `baseURL` serves an active, settled world, and refuses a world outside
 * the allowlist.
 * @param {string} baseURL
 * @param {{timeout?: number}} [options]
 * @returns {Promise<{world: string, version: string, system: string, systemVersion: string}>}
 */
export async function assertTestWorld(baseURL, { timeout = 120_000 } = {}) {
  const url = new URL("/api/status", baseURL).href;
  const deadline = Date.now() + timeout;
  let status = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      status = response.ok ? await response.json() : null;
    } catch {
      status = null;
    }
    if (status?.active && !(status.uptime < WORLD_SETTLE_MS)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!status?.active) throw new Error(`Foundry at ${baseURL} has no active world (after ${timeout / 1000} s)`);
  const allowed = testWorlds();
  if (!allowed.includes(status.world)) {
    throw new Error(`Foundry at ${baseURL} serves world "${status.world}", which is not in FVTT_TEST_WORLDS `
      + `(${allowed.join(", ")}). The tests run only in a dedicated test world.`);
  }
  return status;
}

/**
 * Opens /game in `page` and waits until `game.ready`.
 * @param {import("@playwright/test").Page} page
 * @param {{timeout?: number}} [options]
 */
export async function openGame(page, { timeout = 120_000 } = {}) {
  await page.goto("/game");
  if (new URL(page.url()).pathname.endsWith("/join")) {
    throw new Error("this browser session is not logged in to the world (Foundry redirected to /join)");
  }
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout });
}

/**
 * Logs a browser context in to the world as the given user, through the same POST /join request
 * Foundry's join form sends.
 * @param {import("@playwright/test").BrowserContext} context
 * @param {string} baseURL
 * @param {{id: string, password?: string}} user
 */
export async function joinAs(context, baseURL, { id, password = "" }) {
  const response = await context.request.post(new URL("/join", baseURL).href, {
    data: { action: "join", userid: id, password },
  });
  if (!response.ok()) throw new Error(`joining as user ${id} failed: ${response.status()} ${await response.text()}`);
}

/** A player join loads the whole game in a new browser; each one adds this to the test's timeout. */
const PLAYER_JOIN_MS = 60_000;

/** The GM and throwaway-player sessions of one Playwright test, and the documents it created. */
export class FoundrySessions {
  /** @type {Array<{documentName: string, id: string}>} */
  #created = [];

  /** @type {import("@playwright/test").BrowserContext[]} */
  #contexts = [];

  /**
   * @param {{browser: import("@playwright/test").Browser, gm: import("@playwright/test").Page,
   *   baseURL: string, contextOptions?: import("@playwright/test").BrowserContextOptions,
   *   testInfo?: import("@playwright/test").TestInfo}} options
   *   `testInfo` lets each player join extend the test's timeout by PLAYER_JOIN_MS.
   */
  constructor({ browser, gm, baseURL, contextOptions = {}, testInfo }) {
    this.browser = browser;
    this.gm = gm;
    this.baseURL = baseURL;
    this.contextOptions = contextOptions;
    this.testInfo = testInfo;
    this.runId = randomBytes(4).toString("hex");
    /** Prefix of every name this test creates. */
    this.prefix = `ffgtest-${this.runId}-`;
  }

  /**
   * Creates a world document as the GM and tracks it for deletion. A `name` gets the prefix.
   * @param {string} documentName  Actor, Item, User, JournalEntry, Scene, ...
   * @param {object} data
   * @returns {Promise<{id: string, uuid: string, name: string|null}>}
   */
  async create(documentName, data) {
    const source = { ...data };
    if (typeof source.name === "string") source.name = `${this.prefix}${source.name}`;
    const created = await this.gm.evaluate(async ({ documentName, source }) => {
      const doc = await getDocumentClass(documentName).create(source);
      return doc ? { id: doc.id, uuid: doc.uuid, name: doc.name ?? null } : null;
    }, { documentName, source });
    if (!created) throw new Error(`creating ${documentName} "${source.name ?? ""}" was refused`);
    this.#created.push({ documentName, id: created.id });
    return created;
  }

  /**
   * A new throwaway user, logged in through its own browser context and waiting at game.ready.
   * @param {{name?: string, role?: number}} [options]
   */
  async player({ name = `player-${this.#contexts.length + 1}`, role = CONST_ROLES.PLAYER } = {}) {
    if (this.testInfo?.timeout) this.testInfo.setTimeout(this.testInfo.timeout + PLAYER_JOIN_MS);
    const password = randomBytes(12).toString("hex");
    const user = await this.create("User", { name, role, password });
    const context = await this.browser.newContext({
      ...this.contextOptions,
      baseURL: this.baseURL,
      storageState: { cookies: [], origins: [] },
    });
    this.#contexts.push(context);
    await joinAs(context, this.baseURL, { id: user.id, password });
    const page = await context.newPage();
    await openGame(page);
    return { user: { id: user.id, name: user.name }, context, page };
  }

  /**
   * Closes the player sessions, then deletes everything created through `create` (users last
   * in reverse order of creation). Throws if anything is left, so the test fails.
   */
  async dispose() {
    await Promise.allSettled(this.#contexts.map((context) => context.close()));
    this.#contexts = [];
    const created = this.#created.reverse();
    this.#created = [];
    const remaining = await this.gm.evaluate(async (entries) => {
      for (const { documentName, id } of entries) {
        try {
          await game.collections.get(documentName)?.get(id)?.delete();
        } catch (error) {
          console.error(`FoundrySessions cleanup: ${documentName} ${id}`, error);
        }
      }
      return entries.filter(({ documentName, id }) => game.collections.get(documentName)?.has(id));
    }, created);
    if (remaining.length) {
      throw new Error(`test documents were not deleted: ${remaining.map((entry) => `${entry.documentName} ${entry.id}`).join(", ")}`);
    }
  }
}

/** Playwright's `test` with a `sessions` fixture: a FoundrySessions on the GM `page`. */
export const test = base.extend({
  sessions: async ({ browser, page, baseURL, viewport }, use, testInfo) => {
    if (!baseURL) throw new Error("Playwright baseURL is not configured");
    await openGame(page);
    const sessions = new FoundrySessions({ browser, gm: page, baseURL, contextOptions: { viewport }, testInfo });
    try {
      await use(sessions);
    } finally {
      await sessions.dispose();
    }
  },
});

export { expect };
