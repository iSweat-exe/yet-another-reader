import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import serverRoutes from "../../crates/overlay-server/src/routes.rs?raw";
import { highlight } from "./highlight";
import { plainText, renderMarkdown, slugify } from "./markdown";
import { DOC_PAGES, DOC_SECTIONS, type DocPage, docIdOfFile } from "./pages";

/** The pages rendered from Markdown (the playground is drawn by the app and has no text to check). */
const MARKDOWN_PAGES = DOC_PAGES.filter((p) => !p.custom);
import { searchDocs } from "./search";

const render = (source: string) => renderMarkdown(source, (file) => (file === "EDITOR.md" ? "editor" : undefined));

describe("slugify", () => {
  it("lowercases, drops punctuation and keeps accents", () => {
    expect(slugify("Démarrage rapide")).toBe("démarrage-rapide");
    expect(slugify("Ajouter un widget intégré")).toBe("ajouter-un-widget-intégré");
    expect(slugify("GET /beatmap, GET /difficulty")).toBe("get-beatmap-get-difficulty");
  });

  it("strips Markdown from heading text", () => {
    expect(plainText("Le `type` du [widget](X.md)")).toBe("Le type du widget");
  });
});

describe("renderMarkdown", () => {
  it("gives headings stable, unique ids and lists them", () => {
    const { html, headings } = render("# Titre\n\n## Exemple\n\n## Exemple\n");
    expect(html).toContain('<h2 id="exemple">');
    expect(html).toContain('<h2 id="exemple-1">');
    expect(headings.map((h) => [h.level, h.id])).toEqual([[1, "titre"], [2, "exemple"], [2, "exemple-1"]]);
  });

  it("turns links to other pages and to sections into in-app navigation", () => {
    const { html } = render("[Éditeur](EDITOR.md#groupes) et [ici](#plus-bas) et [page](EDITOR.md)");
    expect(html).toContain('data-doc="editor" data-anchor="groupes"');
    expect(html).toContain('data-anchor="plus-bas"');
    expect(html).toContain('data-doc="editor" data-anchor=""');
  });

  it("shows links that lead nowhere as plain text", () => {
    const { html } = render("[x](AUTRE.md) [y](examples/a/index.html) [z](https://example.com)");
    expect(html).not.toContain("<a ");
    expect(html.match(/doc-plain/g)).toHaveLength(3);
  });

  it("wraps tables so they scroll instead of overflowing", () => {
    const { html } = render("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(html).toContain('<div class="doc-table"><table>');
  });
});

/** The text of each page in each language. */
const LANGS = [
  { lang: "fr", text: (p: DocPage) => p.source },
  { lang: "en", text: (p: DocPage) => p.sourceEn },
] as const;

describe.each(LANGS)("documentation pages ($lang)", ({ text }) => {
  const rendered = new Map(MARKDOWN_PAGES.map((p) => [p.id, renderMarkdown(text(p), docIdOfFile)]));

  it("has unique ids and files", () => {
    expect(new Set(DOC_PAGES.map((p) => p.id)).size).toBe(DOC_PAGES.length);
    expect(new Set(DOC_PAGES.map((p) => p.file)).size).toBe(DOC_PAGES.length);
  });

  it("has a text for every page", () => {
    for (const page of MARKDOWN_PAGES) expect(text(page).trim().length, page.file).toBeGreaterThan(100);
  });

  it("starts every page with a single title", () => {
    for (const page of MARKDOWN_PAGES) {
      const levels = rendered.get(page.id)?.headings.map((h) => h.level) ?? [];
      expect(levels[0], page.file).toBe(1);
      expect(levels.filter((l) => l === 1), page.file).toHaveLength(1);
    }
  });

  it("has no broken link to another page or to a section", () => {
    for (const page of MARKDOWN_PAGES) {
      const { html } = rendered.get(page.id) ?? { html: "" };
      for (const [, doc, anchor] of html.matchAll(/data-doc="([^"]*)" data-anchor="([^"]*)"/g)) {
        const target = rendered.get(doc);
        expect(target, `${page.file} -> ${doc}`).toBeDefined();
        if (anchor) expect(target?.headings.map((h) => h.id), `${page.file} -> ${doc}#${anchor}`).toContain(anchor);
      }
      for (const [, anchor] of html.matchAll(/<a href="#[^"]*" data-anchor="([^"]+)"/g)) {
        expect(rendered.get(page.id)?.headings.map((h) => h.id), `${page.file} -> #${anchor}`).toContain(anchor);
      }
    }
  });

  it("links to other pages by an existing file, never a dead reference", () => {
    for (const page of MARKDOWN_PAGES) {
      const { html } = rendered.get(page.id) ?? { html: "" };
      expect(html, page.file).not.toMatch(/doc-plain">[^<]*\.md/);
    }
  });
});

/** The structure of a page: what must be the same in French and in English. */
const shape = (source: string) => {
  const headings = [...source.matchAll(/^(#{1,4}) /gm)].map((m) => m[1].length).join("");
  return {
    headings,
    codeBlocks: [...source.matchAll(/^```(\w*)$/gm)].map((m) => m[1]).join(","),
    tableRows: (source.match(/^\|/gm) ?? []).length,
    callouts: (source.match(/^> \[!/gm) ?? []).length,
    links: (source.match(/\]\(/g) ?? []).length,
  };
};

describe("navigation labels", () => {
  it("are titled and sectioned in both languages", () => {
    for (const key of [...DOC_PAGES.map((p) => p.title), ...DOC_SECTIONS.map((s) => s.title)]) {
      expect(en[key], key).toBeTruthy();
      expect(fr[key], key).toBeTruthy();
    }
  });
});

describe("French and English say the same thing", () => {
  it.each(MARKDOWN_PAGES.map((p) => [p.file, p] as const))("%s has the same structure in both languages", (_file, page) => {
    expect(shape(page.sourceEn)).toEqual(shape(page.source));
  });

  it("has an English page for every French page", () => {
    for (const page of MARKDOWN_PAGES) expect(page.sourceEn.length, page.file).toBeGreaterThan(0);
  });
});

describe("searchDocs", () => {
  const titleOf = (page: { id: string }) => page.id;

  it("finds pages containing every word, titles first", () => {
    const hits = searchDocs(DOC_PAGES, "groupes", titleOf);
    expect(hits.map((h) => h.page.id)).toContain("editor");
    expect(hits[0].snippet.length).toBeGreaterThan(0);
    const byTitle = searchDocs(DOC_PAGES, "api", titleOf);
    expect(byTitle[0].page.id).toBe("api");
  });

  it("ignores case and returns nothing for an empty or unknown query", () => {
    expect(searchDocs(DOC_PAGES, "RTSS", titleOf).length).toBeGreaterThan(0);
    expect(searchDocs(DOC_PAGES, "  ", titleOf)).toEqual([]);
    expect(searchDocs(DOC_PAGES, "zzzz-introuvable", titleOf)).toEqual([]);
  });
});

describe("highlight", () => {
  it("colours JSON keys, strings, numbers and literals", () => {
    const html = highlight('{ "ok": true, "n": 1.5, "s": "x" }', "json");
    expect(html).toContain('<span class="tok-key">"ok"</span>');
    expect(html).toContain('<span class="tok-lit">true</span>');
    expect(html).toContain('<span class="tok-num">1.5</span>');
    expect(html).toContain('<span class="tok-str">"x"</span>');
  });

  it("escapes HTML and leaves unknown languages uncoloured", () => {
    expect(highlight("a < b && c", "text")).toBe("a &lt; b &amp;&amp; c");
    expect(highlight("<b>", "js")).toContain("&lt;b&gt;");
  });

  it("colours JavaScript, shell and the script inside HTML", () => {
    expect(highlight("const ws = new WebSocket(url); // fin", "js")).toMatch(/tok-kw">const.*tok-fn">WebSocket.*tok-com">\/\/ fin/s);
    expect(highlight("curl -s http://x", "bash")).toMatch(/tok-fn">curl.*tok-flag">-s/s);
    const page = highlight('<div class="a">hi</div><script>let x = 1;</script>', "html");
    expect(page).toContain('<span class="tok-tag">div</span>');
    expect(page).toContain('<span class="tok-attr">class</span>');
    expect(page).toContain('<span class="tok-kw">let</span>');
  });
});

describe("callouts and badges", () => {
  it("renders `> [!KIND]` quotes as coloured callouts without the marker", () => {
    const { html } = render("> [!ATTENTION] Prudence.\n\n> Sans marqueur.\n");
    expect(html).toContain('data-kind="warning"');
    expect(html).toContain("Prudence.");
    expect(html).not.toContain("[!ATTENTION]");
    expect(html).toContain('data-kind="note"');
  });

  it("colours the HTTP method of a route", () => {
    const { html } = render("`GET /health` et `curl` et `a < b`");
    expect(html).toContain('<span class="http http-get">GET</span> /health');
    expect(html).toContain("<code>curl</code>");
    expect(html).toContain("<code>a &lt; b</code>");
  });

  it("labels code blocks with their language", () => {
    const { html } = render("```json\n{ \"a\": 1 }\n```\n");
    expect(html).toContain('<pre data-lang="json">');
  });
});

describe.each([
  { lang: "fr", text: (p: DocPage) => p.source, usage: "**Exemple d'utilisation**", response: "**Exemple de réponse**", wsUsage: "### Exemple d'utilisation" },
  { lang: "en", text: (p: DocPage) => p.sourceEn, usage: "**Usage example**", response: "**Response example**", wsUsage: "### Usage example" },
])("API documentation ($lang)", ({ text, usage, response, wsUsage }) => {
  const api = ["api", "rest-api", "websocket", "data-model"].map((id) => DOC_PAGES.find((p) => p.id === id)).filter((p): p is DocPage => p !== undefined);
  const blocks = (source: string, lang: string) => [...source.matchAll(new RegExp("```" + lang + "\n([\s\S]*?)```", "g"))].map((m) => m[1]);

  it("has the four pages", () => {
    expect(api.map((p) => p.id)).toEqual(["api", "rest-api", "websocket", "data-model"]);
  });

  it("holds only JSON examples that parse", () => {
    for (const page of api) {
      for (const code of blocks(text(page), "json")) {
        expect(() => JSON.parse(code), `${page.file}:\n${code.slice(0, 120)}`).not.toThrow();
      }
    }
  });

  it("holds only JavaScript examples that are valid syntax", () => {
    const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (code: string) => unknown;
    for (const page of api) {
      for (const code of blocks(text(page), "js")) {
        expect(() => new AsyncFunction(code), `${page.file}:\n${code.slice(0, 120)}`).not.toThrow();
      }
    }
  });

  // The routes of the server, read from its source: a route added there without documentation fails here.
  const routes = [...serverRoutes.matchAll(/path: "(\/api\/v1[^"]*)"/g)].map((m) => m[1]);
  const rest = api.find((p) => p.id === "rest-api");
  const websocket = api.find((p) => p.id === "websocket");

  it("lists every route of the server", () => {
    expect(routes.length).toBeGreaterThan(15);
  });

  it("documents every REST route with its own section, an example of use and an example of response", () => {
    const sections = text(rest!).split(/^### /m).slice(1);
    for (const route of routes.filter((r) => !r.endsWith("/ws"))) {
      const heading = route === "/api/v1" ? "GET /api/v1" : `GET ${route.replace("/api/v1", "")}`;
      const section = sections.find((s) => s.startsWith(`\`${heading}\``));
      expect(section, `no section for ${heading}`).toBeDefined();
      expect(section, heading).toContain(usage);
      expect(section, heading).toContain(response);
    }
  });

  it("documents both WebSocket streams, with an example of use and every message type", () => {
    for (const route of routes.filter((r) => r.endsWith("/ws"))) expect(text(websocket!), route).toContain(`ws://127.0.0.1:24051${route}`);
    expect(text(websocket!).match(new RegExp(wsUsage, "g"))).toHaveLength(2);
    for (const type of ["hello", "state", "status", "event", "pong", "input"]) expect(text(websocket!), type).toContain(`#### \`${type}\``);
    for (const name of ["connectionChanged", "screenChanged", "beatmapChanged", "modsChanged", "playStarted", "playEnded", "paused", "resumed", "failed"]) {
      expect(text(websocket!), name).toContain(`**\`${name}\``);
    }
  });
});

describe("screenshots", () => {
  const source = "> [!SCREENSHOT] some-id\n> The editor with a layout loaded.\n> Number the zones.\n\nafter\n";

  it("draws an empty frame that says what the picture must show", () => {
    const { html } = renderMarkdown(source, () => undefined, { lang: "en" });
    expect(html).toContain('data-shot="some-id"');
    expect(html).toContain("doc-shot-todo");
    expect(html).toContain("Screenshot to add");
    expect(html).toContain("docs/images/some-id.png");
    expect(html).toContain("The editor with a layout loaded. Number the zones.");
  });

  it("titles the frame in the language of the page", () => {
    expect(renderMarkdown(source, () => undefined, { lang: "fr" }).html).toContain("Capture d'écran à ajouter");
  });

  it("shows the picture, captioned with the first sentence, once its file exists", () => {
    const { html } = renderMarkdown(source, () => undefined, { lang: "en", shotUrl: (id) => `/img/${id}.png` });
    expect(html).toContain('<img src="/img/some-id.png"');
    expect(html).toContain("<figcaption>The editor with a layout loaded.</figcaption>");
    expect(html).not.toContain("doc-shot-todo");
  });

  it("is ignored by the search", () => {
    const page = { id: "x", file: "X.md", title: "docs.page.api", source, sourceEn: source } as DocPage;
    expect(searchDocs([page], "zones", () => "x")).toEqual([]);
    expect(searchDocs([page], "after", () => "x")).toHaveLength(1);
  });

  const ids = (source: string) => [...source.matchAll(/^> \[!SCREENSHOT\] (\S+)/gm)].map((m) => m[1]);

  it.each(MARKDOWN_PAGES.map((p) => [p.file, p] as const))("%s asks for the same pictures in both languages, each once", (_file, page) => {
    expect(ids(page.sourceEn)).toEqual(ids(page.source));
    expect(new Set(ids(page.source)).size).toBe(ids(page.source).length);
  });

  it("gives every picture a description", () => {
    for (const page of MARKDOWN_PAGES) {
      for (const text of [page.source, page.sourceEn]) {
        for (const [, id, description] of text.matchAll(/^> \[!SCREENSHOT\] (\S+)\n((?:> [^\n]*\n?)+)/gm)) {
          expect(description.replace(/^> /gm, "").trim().length, `${page.file}: ${id}`).toBeGreaterThan(40);
        }
      }
    }
  });

  it("titles callouts in the language of the page, English names included", () => {
    expect(renderMarkdown("> [!TIP] Hello.\n", () => undefined, { lang: "en" }).html).toContain('data-kind="tip" data-label="Tip"');
    expect(renderMarkdown("> [!WARNING] Careful.\n", () => undefined, { lang: "en" }).html).toContain('data-kind="warning" data-label="Warning"');
    expect(renderMarkdown("> [!ASTUCE] Salut.\n", () => undefined, { lang: "fr" }).html).toContain('data-label="Astuce"');
  });

  it("never leaves a callout marker as plain text", () => {
    for (const page of MARKDOWN_PAGES) {
      for (const [source, lang] of [[page.source, "fr"], [page.sourceEn, "en"]] as const) {
        expect(renderMarkdown(source, docIdOfFile, { lang }).html, `${page.file} (${lang})`).not.toMatch(/\[!(NOTE|ASTUCE|TIP|IMPORTANT|ATTENTION|WARNING|SCREENSHOT)\]/);
      }
    }
  });
});
