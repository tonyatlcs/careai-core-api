import { spawnSync } from "child_process";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const args = process.argv.slice(2).filter((a) => a !== "--");
const name = args[0];
if (!name) {
  console.error("Usage: pnpm migration:create -- <MigrationName>");
  console.error("Example: pnpm migration:create -- AddDocumentsTable");
  process.exit(1);
}

if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
  console.error(
    "Migration name must start with a letter and use only letters, numbers, underscores, and hyphens.",
  );
  process.exit(1);
}

const migrationPath = path.join("src", "db", "migrations", name);
const cli = path.join("node_modules", "typeorm", "cli.js");

const result = spawnSync("tsx", [cli, "migration:create", migrationPath], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
