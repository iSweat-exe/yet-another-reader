#!/usr/bin/env node
// One version for the whole app: package.json, package-lock.json, tauri.conf.json, src-tauri/Cargo.toml
// and its entry in Cargo.lock must all say the same thing, and a release tag must match them.
//
//   node scripts/version.mjs check [--tag v1.2.3]   fails when the files disagree (or disagree with the tag)
//   node scripts/version.mjs set 1.2.3              writes the version everywhere
//
// The updater compares these versions: a release whose numbers disagree would never be offered, or worse,
// be offered forever.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const file = (path) => join(root, path);
const read = (path) => readFileSync(file(path), "utf8");
const write = (path, text) => writeFileSync(file(path), text);

/** Each place a version lives: how to read it, and how to write it. */
const places = [
  {
    name: "package.json",
    get: () => JSON.parse(read("package.json")).version,
    set: (v) => write("package.json", read("package.json").replace(/("version":\s*")[^"]+(")/, `$1${v}$2`)),
  },
  {
    name: "package-lock.json",
    get: () => JSON.parse(read("package-lock.json")).packages[""].version,
    set: (v) => {
      const lock = JSON.parse(read("package-lock.json"));
      lock.version = v;
      lock.packages[""].version = v;
      write("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
    },
  },
  {
    name: "src-tauri/tauri.conf.json",
    get: () => JSON.parse(read("src-tauri/tauri.conf.json")).version,
    set: (v) => write("src-tauri/tauri.conf.json", read("src-tauri/tauri.conf.json").replace(/("version":\s*")[^"]+(")/, `$1${v}$2`)),
  },
  {
    name: "src-tauri/Cargo.toml",
    get: () => /^\[package\][^[]*?^version\s*=\s*"([^"]+)"/ms.exec(read("src-tauri/Cargo.toml"))?.[1],
    set: (v) => write("src-tauri/Cargo.toml", read("src-tauri/Cargo.toml").replace(/(^\[package\][^[]*?^version\s*=\s*")[^"]+(")/ms, `$1${v}$2`)),
  },
  {
    name: "Cargo.lock",
    get: () => /name = "yet-another-reader"\r?\nversion = "([^"]+)"/.exec(read("Cargo.lock"))?.[1],
    set: (v) => write("Cargo.lock", read("Cargo.lock").replace(/(name = "yet-another-reader"\r?\nversion = ")[^"]+(")/, `$1${v}$2`)),
  },
];

const [command, arg, extra] = process.argv.slice(2);

if (command === "set") {
  if (!arg || !SEMVER.test(arg)) fail(`"${arg ?? ""}" is not a version like 1.2.3 or 1.2.3-rc.1`);
  for (const place of places) place.set(arg);
  console.log(`Version set to ${arg} in ${places.length} files.`);
} else if (command === "check") {
  const found = places.map((place) => ({ name: place.name, version: place.get() }));
  const expected = arg === "--tag" ? extra?.replace(/^v/, "") : found[0].version;
  if (arg === "--tag" && (!extra || !SEMVER.test(expected))) fail(`The tag "${extra ?? ""}" is not a version tag like v1.2.3`);
  const wrong = found.filter((f) => f.version !== expected);
  for (const f of found) console.log(`${f.version === expected ? "ok " : "BAD"} ${f.name}: ${f.version ?? "not found"}`);
  if (wrong.length > 0) fail(`Expected ${expected} everywhere. Run: node scripts/version.mjs set ${expected}`);
  console.log(`All versions are ${expected}.`);
} else {
  fail("Usage: node scripts/version.mjs check [--tag vX.Y.Z] | set X.Y.Z");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
