#!/usr/bin/env node
/**
 * Runs compiled API + worker together (after `pnpm run build`).
 * For local/dev hot reload, use `pnpm run dev:all` instead.
 */
import { spawn } from "node:child_process";

const shell = process.platform === "win32";

function spawnPnpm(args) {
  return spawn("pnpm", args, {
    stdio: "inherit",
    shell,
    env: process.env,
  });
}

const api = spawnPnpm(["start"]);
const worker = spawnPnpm(["run", "start:worker"]);

function killBoth(signal) {
  for (const child of [api, worker]) {
    if (!child.killed && child.exitCode === null) {
      child.kill(signal);
    }
  }
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  killBoth(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

let exitCode = 0;

function onExit(code, from) {
  if (typeof code === "number" && code !== 0) {
    exitCode = code;
  }
  if (!shuttingDown) {
    console.error(`start:all: "${from}" exited; stopping the other process.`);
    shutdown("SIGTERM");
    setTimeout(() => process.exit(exitCode), 750);
  } else if (api.exitCode !== null && worker.exitCode !== null) {
    process.exit(exitCode);
  }
}

api.on("exit", (code) => onExit(code ?? 0, "start"));
worker.on("exit", (code) => onExit(code ?? 0, "start:worker"));
