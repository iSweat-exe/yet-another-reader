import { type KeyboardEvent, lazy, type MouseEvent, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { useLang, useT } from "../i18n";
import { ImageViewer, type ViewedImage } from "./ImageViewer";
import { renderMarkdown } from "./markdown";
import { DOC_PAGES, DOC_SECTIONS, FIRST_PAGE, type DocPage, docIdOfFile, docPage } from "./pages";

/** The text of a page in the language of the interface. */
/** The docs are written in French and English: any other language reads the English. */
const docLang = (lang: string): "fr" | "en" => (lang === "fr" ? "fr" : "en");
const sourceOf = (page: DocPage, lang: "fr" | "en") => (lang === "en" ? page.sourceEn : page.source);
import { searchDocs } from "./search";
import { shotUrl } from "./shots";

const Playground = lazy(() => import("./Playground"));

const STORAGE_KEY = "yar.docs.page";

function initialPage(): string {
  const fromUrl = new URLSearchParams(location.search).get("page");
  if (docPage(fromUrl)) return fromUrl as string;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (docPage(stored)) return stored as string;
  } catch {
    // Storage unavailable: start at the first page.
  }
  return FIRST_PAGE;
}

const navItem =
  "relative flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm outline-none transition-colors duration-75 focus-visible:shadow-[0_0_0_2px_var(--color-accent)]";

/** Rendered pages, kept: going back to a page (or forward) costs nothing the second time. */
const renderedPages = new Map<string, ReturnType<typeof renderMarkdown>>();

/** The documentation: sections and pages on the left, the page in the middle, its outline on the right. */
export default function DocsTab() {
  const t = useT();
  const lang = docLang(useLang());
  const [pageId, setPageId] = useState(initialPage);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [viewed, setViewed] = useState<ViewedImage | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const pageList = useRef<HTMLDivElement>(null);
  // Narrow windows: the page list is a menu above the page instead of a column beside it.
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingAnchor = useRef<string | undefined>(undefined);

  const page = docPage(pageId) ?? DOC_PAGES[0];
  const index = DOC_PAGES.indexOf(page);
  const rendered = useMemo(() => {
    const key = `${page.id}:${lang}`;
    const known = renderedPages.get(key);
    if (known) return known;
    const fresh = renderMarkdown(sourceOf(page, lang), docIdOfFile, { lang, shotUrl: (id) => shotUrl(id, lang) });
    renderedPages.set(key, fresh);
    return fresh;
  }, [page, lang]);
  const section = DOC_SECTIONS.find((s) => s.pages.some((p) => p.id === page.id));
  const outline = rendered.headings.filter((h) => h.level === 2 || h.level === 3);
  const results = useMemo(() => searchDocs(DOC_PAGES.map((p) => ({ ...p, source: sourceOf(p, lang) })), query, (p) => t(p.title)), [query, t, lang]);

  const scrollToAnchor = useCallback((anchor: string | undefined) => {
    const box = scroller.current;
    if (!box) return;
    const target = anchor ? box.querySelector<HTMLElement>(`[id="${CSS.escape(anchor)}"]`) : null;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (target) box.scrollTo({ top: target.offsetTop - 16, behavior: smooth ? "smooth" : "auto" });
    else box.scrollTo({ top: 0 });
  }, []);

  const go = useCallback(
    (id: string, anchor?: string) => {
      pendingAnchor.current = anchor;
      if (id === pageId) return scrollToAnchor(anchor);
      setPageId(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // Remembering the page is a convenience only.
      }
    },
    [pageId, scrollToAnchor],
  );

  /** The thin line over the page is the playhead: how far through the page the reader is, 1:1 with the scroll. */
  const moveHead = useCallback(() => {
    const box = scroller.current;
    const head = playhead.current;
    if (!box || !head) return;
    const range = box.scrollHeight - box.clientHeight;
    head.style.transform = `scaleX(${range > 0 ? Math.min(1, Math.max(0, box.scrollTop / range)) : 0})`;
  }, []);

  // A new page is shown from its top, or from the section a link pointed to (before paint: no flash of the old position).
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    pendingAnchor.current = undefined;
    const box = scroller.current;
    if (box) box.scrollTop = 0;
    if (anchor) requestAnimationFrame(() => scrollToAnchor(anchor));
    setCurrent(outline[0]?.id ?? null);
    moveHead();
  }, [page]);

  // The outline follows the reading position.
  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    let active: string | null = outline[0]?.id ?? null;
    for (const h of outline) {
      const el = box.querySelector<HTMLElement>(`[id="${CSS.escape(h.id)}"]`);
      if (el && el.offsetTop - 80 <= box.scrollTop) active = h.id;
    }
    setCurrent(active);
    moveHead();
  };

  /** The picture under an event of the page content, if any. */
  const pictureOf = (target: EventTarget): ViewedImage | null => {
    const img = (target as HTMLElement).closest?.<HTMLImageElement>("img");
    // The caption under the picture is the short sentence that says what it shows; the alt text is the long brief.
    const caption = img?.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
    return img ? { src: img.currentSrc || img.src, alt: caption || img.alt, from: img.getBoundingClientRect() } : null;
  };

  const onContentKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const picture = pictureOf(e.target);
    if (!picture) return;
    e.preventDefault();
    setViewed(picture);
  };

  const copyCode = async (button: HTMLButtonElement) => {
    const code = button.closest("pre")?.querySelector("code")?.textContent;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    const idle = button.dataset.labelCopy ?? "";
    button.dataset.copied = "true";
    button.setAttribute("aria-label", button.dataset.labelCopied ?? idle);
    button.title = button.dataset.labelCopied ?? idle;
    window.setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute("aria-label", idle);
      button.title = idle;
    }, 1500);
  };

  const onContentClick = (e: MouseEvent) => {
    const picture = pictureOf(e.target);
    if (picture) return setViewed(picture);
    const copy = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]");
    if (copy) return void copyCode(copy);
    const link = (e.target as HTMLElement).closest<HTMLElement>("a[data-doc], a[data-anchor]");
    if (!link) return;
    e.preventDefault();
    go(link.dataset.doc ?? pageId, link.dataset.anchor || undefined);
  };

  const pick = (id: string) => {
    setQuery("");
    setMenuOpen(false);
    go(id);
  };

  // The current page stays in view in the list, whichever way it was reached (footer, link, search).
  useEffect(() => {
    pageList.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [page.id, menuOpen, query]);

  const neighbour = (offset: -1 | 1): DocPage | undefined => DOC_PAGES[index + offset];

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <nav aria-label={t("tab.docs")} data-sfx="sidebar" className={`flex flex-col bg-surface-raised md:w-64 md:shrink-0 md:border-r md:border-wash/8 ${menuOpen ? "min-h-0 flex-1" : ""}`}>
        {/* Narrow window: the page being read, as the button that opens the list of pages. */}
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="docs-pages"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-wash/8 px-4 text-left text-sm font-medium outline-none transition-colors duration-150 hover:bg-wash/5 focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] md:hidden"
        >
          <span className="min-w-0 truncate">
            {section && <span className="font-normal text-ink-dim">{t(section.title)} / </span>}
            {t(page.title)}
          </span>
          <Icon name="expand" className="shrink-0 text-ink-dim" />
        </button>
        <div id="docs-pages" className={`min-h-0 flex-1 flex-col ${menuOpen ? "flex" : "hidden md:flex"}`}>
        <div className="p-3 pb-2">
          <label className="relative block">
            <span className="sr-only">{t("docs.search")}</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-dim" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) setQuery("");
                else if (e.key === "Enter" && results[0]) pick(results[0].page.id);
              }}
              placeholder={t("docs.search")}
              className="min-h-9 w-full text-ellipsis rounded-lg bg-surface pr-2.5 pl-8 text-sm text-ink shadow-[0_0_0_1px_var(--ring-field)] outline-none placeholder:text-ink-dim focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
            />
          </label>
        </div>
        {/* The list fades out under the search field and at its foot, instead of being cut by a rule. */}
        <div ref={pageList} className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [mask-image:linear-gradient(to_bottom,transparent,black_0.75rem,black_calc(100%-1rem),transparent)]">
          {query.trim() ? (
            results.length === 0 ? (
              <p className="px-3 text-sm text-ink-dim">{t("docs.noResults")}</p>
            ) : (
              <ul className="space-y-1">
                {results.map(({ page: hit, snippet }) => (
                  <li key={hit.id}>
                    <button type="button" onClick={() => pick(hit.id)} className={`${navItem} flex-col items-start gap-0.5 py-1.5 hover:bg-wash/5`}>
                      <span className="font-medium">{t(hit.title)}</span>
                      <span className="line-clamp-2 text-xs text-ink-dim">{snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            DOC_SECTIONS.map((s) => (
              <section key={s.id} className="mb-4">
                <h2 className={`px-3 pb-1 text-xs font-medium ${section?.id === s.id ? "text-ink" : "text-ink-dim"}`}>
                  {t(s.title)}
                </h2>
                <ul>
                  {s.pages.map((p) => {
                    const active = p.id === page.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-current={active ? "page" : undefined}
                          onClick={() => pick(p.id)}
                          className={`${navItem} doc-nav ${active ? "doc-nav-active font-medium text-ink" : "text-ink-dim hover:bg-wash/5 hover:text-ink"}`}
                        >
                          {t(p.title)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
        </div>
      </nav>

      <div className={`relative min-h-0 min-w-0 flex-1 flex-col ${menuOpen ? "hidden md:flex" : "flex"}`}>
      <div ref={playhead} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 origin-left scale-x-0 bg-accent" />
      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl gap-10 px-4 py-6 md:px-8 md:py-8">
          <article className="min-w-0 max-w-3xl flex-1">
            {/* The pages are bundled with the app (see markdown.ts), so this HTML is trusted. */}
            {page.custom === "playground" ? (
              <Suspense fallback={null}>
                <Playground key={page.id} />
              </Suspense>
            ) : (
              <div key={page.id} className="doc" onClick={onContentClick} onKeyDown={onContentKeyDown} dangerouslySetInnerHTML={{ __html: rendered.html }} />
            )}

            <footer className="mt-12 grid grid-cols-2 gap-3 border-t border-wash/8 pt-6">
              {[neighbour(-1), neighbour(1)].map((other, i) =>
                other ? (
                  <button
                    key={other.id}
                    type="button"
                    onClick={() => pick(other.id)}
                    className={`group flex flex-col rounded-lg px-4 py-3 text-left outline-none transition-colors duration-150 hover:bg-wash/5 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] ${i === 1 ? "col-start-2 items-end text-right" : ""}`}
                  >
                    <span className="flex items-center gap-1 text-xs text-ink-dim">
                      {i === 0 && <Icon name="chevron-right" size={14} className="rotate-180" />}
                      {t(i === 0 ? "docs.previous" : "docs.next")}
                      {i === 1 && <Icon name="chevron-right" size={14} />}
                    </span>
                    <span className="text-sm font-medium">
                      {t(other.title)}
                    </span>
                  </button>
                ) : (
                  <span key={i} />
                ),
              )}
            </footer>
          </article>

          {outline.length > 1 && (
            <aside className="sticky top-0 hidden max-h-[calc(100vh-8rem)] w-52 shrink-0 self-start overflow-y-auto xl:block">
              <h2 className="mb-2 text-xs font-medium text-ink-dim">{t("docs.onThisPage")}</h2>
              <ul className="border-l border-wash/8">
                {outline.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      aria-current={current === h.id ? "location" : undefined}
                      onClick={() => scrollToAnchor(h.id)}
                      className={`-ml-px block w-full border-l py-1 text-left text-[0.8125rem] leading-snug outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] ${h.level === 3 ? "pl-6" : "pl-3"} ${current === h.id ? "border-accent text-ink" : "border-transparent text-ink-dim hover:text-ink"}`}
                    >
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </div>
      </div>
      {viewed && <ImageViewer image={viewed} onClose={() => setViewed(null)} />}
    </div>
  );
}
