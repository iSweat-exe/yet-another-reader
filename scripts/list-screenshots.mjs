// Lists the screenshots the documentation asks for (`> [!SCREENSHOT] id` blocks) and which ones exist.
//
//   npm run docs:shots            every screenshot, with its page and state
//   npm run docs:shots -- --todo  only the missing ones
//
// A picture is `docs/images/<id>.png` (or .webp / .jpg), shared by both languages, or `<id>.fr.png` /
// `<id>.en.png` for one language only.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DOCS = new URL("../docs/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const todoOnly = process.argv.includes("--todo");

const files = readdirSync(DOCS).filter((f) => f.endsWith(".md")).sort();
const images = existsSync(join(DOCS, "images")) ? readdirSync(join(DOCS, "images")) : [];
const has = (id, lang) => images.some((f) => new RegExp(`^${id}(\\.${lang})?\\.(png|webp|jpe?g)$`).test(f));

const shots = [];
for (const file of files) {
  const text = readFileSync(join(DOCS, file), "utf8").replace(/\r\n/g, "\n");
  for (const m of text.matchAll(/^> \[!SCREENSHOT\] (\S+)\n((?:> [^\n]*\n?)+)/gm)) {
    shots.push({ file, id: m[1], description: m[2].replace(/^> /gm, "").replace(/\s+/g, " ").trim() });
  }
}

let missing = 0;
let page = "";
for (const shot of shots) {
  const fr = has(shot.id, "fr");
  const en = has(shot.id, "en");
  if (!(fr && en)) missing++;
  if (todoOnly && fr && en) continue;
  if (shot.file !== page) {
    page = shot.file;
    console.log(`\n${page}`);
  }
  const state = fr && en ? "ok     " : fr || en ? "partial" : "missing";
  console.log(`  [${state}] ${shot.id}`);
  if (!(fr && en)) console.log(`            ${shot.description.slice(0, 110)}${shot.description.length > 110 ? "…" : ""}`);
}
console.log(`\n${shots.length} screenshots, ${shots.length - missing} done, ${missing} to do.`);
