#!/usr/bin/env node
// Builds the installer with the updater signing key kept in .secret/ (never committed), the way CI does it with
// its repository secrets. Needed because `createUpdaterArtifacts` makes `tauri build` refuse to run unsigned.
//
//   npm run build:signed            (extra arguments go to `tauri build`)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const secrets = join(dirname(fileURLToPath(import.meta.url)), "..", ".secret");
const keyPath = join(secrets, "updater.key");
const passwordPath = join(secrets, "updater.password");

if (!existsSync(keyPath)) {
  console.error("No signing key at .secret/updater.key. Create one: npx tauri signer generate -w .secret/updater.key");
  process.exit(1);
}

const env = {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, "utf8"),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: existsSync(passwordPath) ? readFileSync(passwordPath, "utf8").trim() : "",
};
const result = spawnSync("npx", ["tauri", "build", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
process.exit(result.status ?? 1);
