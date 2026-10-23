import { Marked, type Tokens } from "marked";
import { highlight } from "./highlight";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export interface Rendered {
  html: string;
  headings: Heading[];
}

/** GitHub-style anchor: lowercase, punctuation dropped, each space to a dash like GitHub (accents are kept). */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

/** The words of a heading, without its Markdown (`code`, links, emphasis). */
export const plainText = (markdown: string) =>
  markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .trim();

/** Kinds of callout, written `> [!KIND]` at the start of a quote; a plain quote is a note. French and English names. */
const CALLOUTS = { NOTE: "note", ASTUCE: "tip", TIP: "tip", IMPORTANT: "important", ATTENTION: "warning", WARNING: "warning" } as const;

type Lang = "fr" | "en";

/** The title printed on a callout, in the language of the page. */
const CALLOUT_LABELS: Record<Lang, Record<(typeof CALLOUTS)[keyof typeof CALLOUTS], string>> = {
  fr: { note: "Note", tip: "Astuce", important: "Important", warning: "Attention" },
  en: { note: "Note", tip: "Tip", important: "Important", warning: "Warning" },
};

const SHOT_LABELS: Record<Lang, string> = { fr: "Capture d'écran à ajouter", en: "Screenshot to add" };
const ENLARGE: Record<Lang, string> = { fr: "Cliquer pour agrandir", en: "Click to enlarge" };
const COPY: Record<Lang, { copy: string; copied: string }> = { fr: { copy: "Copier le code", copied: "Copié" }, en: { copy: "Copy code", copied: "Copied" } };
const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/></svg>';

export interface RenderOptions {
  /** Language of the page: the titles of callouts and of screenshot placeholders. Default `fr`. */
  lang?: Lang;
  /** Address of the image of a screenshot (`docs/images/<id>.png`), when it exists. */
  shotUrl?: (id: string) => string | undefined;
}

/** The first sentence of a description: the caption under a real screenshot. */
const firstSentence = (text: string) => /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const CAMERA_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 5.5a1 1 0 0 1 1-1h1.2l.8-1.5h5l.8 1.5h1.2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM8 10.8a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z"/></svg>';

/** A screenshot: the image when it exists, otherwise a frame that describes what it must show. */
function screenshot(id: string, description: string, lang: Lang, url: string | undefined): string {
  const text = new Marked().parseInline(description, { async: false }) as string;
  if (url) {
    const caption = new Marked().parseInline(firstSentence(description), { async: false }) as string;
    return `<figure class="doc-shot" data-shot="${escapeAttr(id)}"><img src="${escapeAttr(url)}" alt="${escapeAttr(description)}" title="${ENLARGE[lang]}" role="button" tabindex="0" loading="lazy" /><figcaption>${caption}</figcaption></figure>
`;
  }
  return (
    `<figure class="doc-shot doc-shot-todo" data-shot="${escapeAttr(id)}">` +
    `<div class="doc-shot-head">${CAMERA_ICON}<span class="doc-shot-label">${SHOT_LABELS[lang]}</span><code>docs/images/${escapeHtml(id)}.png</code></div>` +
    `<p>${text}</p></figure>
`
  );
}

/**
 * Turns one documentation page into HTML. The pages are bundled with the app, so the output is trusted.
 *
 * Links never leave the page: `OTHER.md#section` and `#section` become in-app navigation (the
 * `data-doc` / `data-anchor` attributes read by the viewer); anything else (external or relative
 * to the repository) is shown as plain text, because the app opens no browser.
 *
 * A quote `> [!SCREENSHOT] some-id` followed by a description marks a place for a screenshot: it is
 * drawn as an empty frame that says what the picture must show, until a file `docs/images/some-id.png`
 * exists (see `shots.ts`), which then replaces the frame.
 *
 * @param docIdOf Maps a file name (`EDITOR.md`) to the id of its page, if there is one.
 */
export function renderMarkdown(source: string, docIdOf: (file: string) => string | undefined, options: RenderOptions = {}): Rendered {
  const lang = options.lang ?? "fr";
  const headings: Heading[] = [];
  const used = new Map<string, number>();

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const label = plainText(text);
        const base = slugify(label) || "section";
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        headings.push({ id, text: label, level: depth });
        return `<h${depth} id="${escapeAttr(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code({ text, lang: fence }: Tokens.Code) {
        const language = (fence ?? "").trim().split(/\s+/)[0];
        const label = language ? ` data-lang="${escapeAttr(language)}"` : "";
        const copy = `<button type="button" class="doc-copy" data-copy data-label-copy="${escapeAttr(COPY[lang].copy)}" data-label-copied="${escapeAttr(COPY[lang].copied)}" aria-label="${escapeAttr(COPY[lang].copy)}" title="${escapeAttr(COPY[lang].copy)}">${COPY_ICON}</button>`;
        return `<pre${label}>${copy}<code>${highlight(text.replace(/\n$/, ""), language)}</code></pre>\n`;
      },
      // `GET /health`: the HTTP method gets its own colour.
      codespan({ text }: Tokens.Codespan) {
        const method = /^(GET|POST|PUT|PATCH|DELETE)(\s.*)?$/.exec(text);
        return method ? `<code><span class="http http-${method[1].toLowerCase()}">${method[1]}</span>${escapeHtml(method[2] ?? "")}</code>` : `<code>${escapeHtml(text)}</code>`;
      },
      blockquote({ tokens }: Tokens.Blockquote) {
        const first = tokens[0];
        const shot = /^\[!SCREENSHOT\][ \t]*([\w.-]+)[ \t]*\n?([\s\S]*)$/.exec(first?.raw ?? "");
        if (shot) return screenshot(shot[1], shot[2].replace(/\s+/g, " ").trim(), lang, options.shotUrl?.(shot[1]));
        const marker = /^\[!(NOTE|ASTUCE|TIP|IMPORTANT|ATTENTION|WARNING)\]\s*/.exec(first?.raw ?? "");
        if (marker && first.type === "paragraph") {
          const lead = first.tokens?.[0];
          if (lead?.type === "text") lead.text = lead.text.replace(marker[0], "");
        }
        const kind = CALLOUTS[(marker?.[1] ?? "NOTE") as keyof typeof CALLOUTS];
        return `<aside class="doc-callout" data-kind="${kind}" data-label="${escapeAttr(CALLOUT_LABELS[lang][kind])}">${this.parser.parse(tokens)}</aside>\n`;
      },
      link({ href, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        if (href.startsWith("#")) return `<a href="${escapeAttr(href)}" data-anchor="${escapeAttr(href.slice(1))}">${inner}</a>`;
        const file = /^([\w-]+\.md)(?:#(.*))?$/.exec(href);
        const doc = file ? docIdOf(file[1]) : undefined;
        if (file && doc) return `<a href="#" data-doc="${escapeAttr(doc)}" data-anchor="${escapeAttr(file[2] ?? "")}">${inner}</a>`;
        return `<span class="doc-plain">${inner}</span>`;
      },
    },
  });

  const html = (marked.parse(source, { async: false }) as string).replace(/<table>/g, '<div class="doc-table"><table>').replace(/<\/table>/g, "</table></div>");
  return { html, headings };
}
