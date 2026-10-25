// Creates a community widget from the template (manifest + page), outside the app.
//
//   npm run widget:new -- "My widget"              in the app's widgets folder
//   npm run widget:new -- "My widget" --dir ./out  in another folder
//   npm run widget:new -- "Mon widget" --lang fr   with the documentation in French (English by default)
//
// It does what the editor's "New widget…" button does (same template, same folder naming). The app
// reloads a widget every time one of its files is saved, so the page can be edited with the overlay open.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TEMPLATE = new URL("../docs/examples/widget-template/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DOCS = new URL("../docs/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const IDENTIFIER = "io.github.isweat-exe.yet-another-reader";

/** The app's widgets folder: where Tauri puts the config directory on each system. */
function defaultDir() {
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), IDENTIFIER, "widgets");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", IDENTIFIER, "widgets");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), IDENTIFIER, "widgets");
}

/** `My widget!` -> `my-widget`: lower case words joined by dashes (the same rule as the app). */
export function slug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function scaffold(dir, name, lang = "en") {
  const clean = name.trim();
  const base = slug(clean);
  if (!clean || clean.length > 40 || !base) throw new Error("Give the widget a name with letters or digits (40 characters at most).");
  let id = base;
  for (let n = 2; existsSync(join(dir, id)); n += 1) id = `${base}-${n}`;
  const folder = join(dir, id);
  const french = lang === "fr";
  mkdirSync(join(folder, "docs"), { recursive: true });
  const html = clean.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const file of ["manifest.json", "index.html", "style.css", "script.js", "types.d.ts"]) {
    const text = readFileSync(join(TEMPLATE, file), "utf8");
    writeFileSync(join(folder, file), file === "manifest.json" ? text.replace('"__NAME__"', JSON.stringify(clean)) : text.replaceAll("__NAME__", html));
  }
  writeFileSync(join(folder, "README.md"), readFileSync(join(TEMPLATE, french ? "fr" : "en", "README.md"), "utf8").replaceAll("__NAME__", clean));
  // The API documentation travels with the widget.
  for (const file of ["WIDGETS.md", "DATA_MODEL.md", "REST_API.md", "WEBSOCKET.md"]) {
    writeFileSync(join(folder, "docs", file), readFileSync(join(DOCS, french ? "" : "en", file), "utf8"));
  }
  return folder;
}

if (process.argv[1]?.endsWith("new-widget.mjs")) {
  const args = process.argv.slice(2);
  let dir = defaultDir();
  let lang = "en";
  const words = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--dir") dir = args[++i] ?? dir;
    else if (args[i] === "--lang") lang = args[++i] ?? lang;
    else words.push(args[i]);
  }
  try {
    const folder = scaffold(dir, words.join(" "), lang);
    console.log(`Widget created: ${folder}
Edit index.html: the overlay reloads it on save.`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
