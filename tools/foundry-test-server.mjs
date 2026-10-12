#!/usr/bin/env node
/**
 * Starts Foundry VTT on an allow-listed test world for the Foundry test tier (tests/README.md).
 *
 * Playwright runs this as its `webServer` (playwright.config.js) and reuses a server that already
 * answers on the port. It can also run on its own, so one server serves several test runs:
 *
 *   node tools/foundry-test-server.mjs        # Ctrl+C stops the Foundry it started
 *
 * Environment:
 *   FVTT_APP           Foundry's application folder, the one holding main.js. Required to launch.
 *   FVTT_DATA          Foundry's user data folder, passed as --dataPath. Required to launch.
 *   FVTT_WORLD         World to launch. Default "test". It must be listed in FVTT_TEST_WORLDS.
 *   FVTT_TEST_WORLDS   Comma-separated allowlist of worlds the tests may touch. Default "test".
 *   FVTT_PORT          Port to serve on. Default 30000.
 *
 * Safety rules:
 *   - A world outside the allowlist, or a port that already serves another world (or Foundry with
 *     no active world), is refused. The same world already being served is reused as it is.
 *   - Foundry always gets --noupnp, so it never asks the router to open ports.
 *   - Config/options.json.lock is removed only when it is an empty directory that nothing refreshes
 *     and the port is free. A running Foundry refreshes its lock every few seconds; one found doing
 *     so belongs to someone else, and this script stops rather than touch it.
 *   - Only the Foundry process this script started is ever stopped.
 *
 * A forced kill (Playwright stops its webServer that way on Windows) can leave the empty lock
 * directory behind; the next start clears it under the rules above.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

/** proper-lockfile refreshes a held lock every 5 s; a lock this old is no longer held. */
const LOCK_STALE_MS = 15_000;
/**
 * A client that connects in the first moments after the world activates can receive incomplete
 * game data and never reach `ready` (seen on V14 build 364: a ReleaseData validation error). The
 * world counts as ready once /api/status reports this much uptime. playwright/foundry.js waits
 * the same way, for a server it did not start.
 */
const WORLD_SETTLE_MS = 5_000;
const READY_TIMEOUT_MS = 180_000;
const STOP_TIMEOUT_MS = 15_000;

const log = (message) => console.error(`foundry-test-server: ${message}`);

function fail(message) {
  log(message);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readConfig(env) {
  const allowed = (env.FVTT_TEST_WORLDS ?? "test").split(",").map((name) => name.trim()).filter(Boolean);
  const world = env.FVTT_WORLD?.trim() || "test";
  const port = Number(env.FVTT_PORT ?? 30000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) fail(`FVTT_PORT is not a valid port: "${env.FVTT_PORT}"`);
  if (!allowed.includes(world)) {
    fail(`FVTT_WORLD "${world}" is not in the test-world allowlist FVTT_TEST_WORLDS (${allowed.join(", ")})`);
  }
  return { allowed, world, port };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`environment variable ${name} is not set; see tests/README.md`);
  return value;
}

/**
 * Foundry's /api/status on the port, or null when nothing answers. Plain http without keep-alive:
 * a pooled fetch socket still closing when the script exits trips a libuv assertion on Windows.
 */
function fetchStatus(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/api/status", agent: false, timeout: 3000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(response.statusCode === 200 ? JSON.parse(body) : { active: false, world: null });
        } catch {
          resolve({ active: false, world: null });
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timed out")));
    request.on("error", () => resolve(null));
  });
}

/** True when something accepts connections on the port. */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function isEmptyDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

/** Removes an empty, unrefreshed lock directory left by a Foundry that was killed. */
async function clearStaleLock(lockPath, port) {
  let stat;
  try {
    stat = fs.statSync(lockPath);
  } catch {
    return;
  }
  if (!isEmptyDirectory(lockPath)) fail(`${lockPath} is not an empty lock directory; leaving it alone`);
  const age = Date.now() - stat.mtimeMs;
  if (age < LOCK_STALE_MS) {
    log("found a recent Foundry data lock; waiting to see whether a running Foundry still holds it");
    await sleep(LOCK_STALE_MS - age + 1000);
    let again;
    try {
      again = fs.statSync(lockPath);
    } catch {
      return;
    }
    if (again.mtimeMs !== stat.mtimeMs) {
      fail("the Foundry data folder is locked by a running Foundry (perhaps on another port). "
        + "This script never stops a Foundry it did not start; close that one first.");
    }
  }
  if (await portInUse(port)) fail(`port ${port} became busy while clearing the stale lock`);
  fs.rmdirSync(lockPath);
  log("removed a stale, empty Config/options.json.lock");
}

async function main() {
  const { world, port } = readConfig(process.env);

  const status = await fetchStatus(port);
  if (status) {
    if (status.active && status.world === world) {
      log(`port ${port} already serves world "${world}"; reusing it`);
      return;
    }
    fail(`port ${port} already serves ${status.active ? `world "${status.world}"` : "Foundry with no active world"}; `
      + "refusing to use or stop it");
  }
  if (await portInUse(port)) fail(`port ${port} is in use by something that is not Foundry`);

  const app = requireEnv("FVTT_APP");
  const data = requireEnv("FVTT_DATA");
  const mainScript = path.join(app, "main.js");
  if (!fs.existsSync(mainScript)) fail("FVTT_APP does not contain main.js; point it at Foundry's resources/app folder");
  if (!fs.existsSync(path.join(data, "Data", "worlds", world, "world.json"))) {
    fail(`FVTT_DATA has no world "${world}" (expected Data/worlds/${world}/world.json)`);
  }

  const lockPath = path.join(data, "Config", "options.json.lock");
  await clearStaleLock(lockPath, port);

  log(`starting Foundry on port ${port} with world "${world}"`);
  const child = spawn(
    process.execPath,
    [mainScript, `--dataPath=${data}`, `--port=${port}`, "--noupnp", `--world=${world}`],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  let lockedByOther = false;
  const relay = (target) => (chunk) => {
    const text = chunk.toString();
    if (/already locked/i.test(text)) lockedByOther = true;
    target.write(text);
  };
  child.stdout.on("data", relay(process.stdout));
  child.stderr.on("data", relay(process.stderr));

  let stopping = false;
  const childExited = new Promise((resolve) => child.once("exit", resolve));
  const stop = async (code) => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await Promise.race([childExited, sleep(STOP_TIMEOUT_MS)]);
    }
    // Our Foundry is gone; an empty lock it could not release on the way out is its own.
    if (isEmptyDirectory(lockPath) && !(await portInUse(port))) fs.rmdirSync(lockPath);
    process.exit(code);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(signal, () => stop(0));
  process.on("exit", () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  });
  childExited.then((code) => {
    if (stopping) return;
    log(lockedByOther
      ? "Foundry refused to start: its data folder is locked by another running Foundry. Close that one first."
      : `Foundry exited with code ${code}`);
    stop(code || 1);
  });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    if (stopping) return;
    const current = await fetchStatus(port);
    if (current?.active) {
      if (current.world !== world) {
        log(`Foundry came up with world "${current.world}" instead of "${world}"; stopping it`);
        await stop(1);
        return;
      }
      if (!(current.uptime < WORLD_SETTLE_MS)) break;
    }
    if (Date.now() > deadline) {
      log(`world "${world}" was not ready after ${READY_TIMEOUT_MS / 1000} s; stopping Foundry`);
      await stop(1);
      return;
    }
    await sleep(500);
  }
  log(`ready: http://127.0.0.1:${port} serves world "${world}" (Ctrl+C stops it)`);
}

main().catch((error) => fail(error?.stack ?? String(error)));
