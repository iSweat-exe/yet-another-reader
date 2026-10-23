import type { MessageKey } from "../i18n";
import api from "../../docs/API.md?raw";
import dataModel from "../../docs/DATA_MODEL.md?raw";
import restApi from "../../docs/REST_API.md?raw";
import websocket from "../../docs/WEBSOCKET.md?raw";
import architecture from "../../docs/ARCHITECTURE.md?raw";
import builtinWidgets from "../../docs/BUILTIN_WIDGETS.md?raw";
import contributing from "../../docs/CONTRIBUTING.md?raw";
import createOverlay from "../../docs/CREATE_OVERLAY.md?raw";
import editor from "../../docs/EDITOR.md?raw";
import gettingStarted from "../../docs/GETTING_STARTED.md?raw";
import layout from "../../docs/LAYOUT.md?raw";
import overlay from "../../docs/OVERLAY.md?raw";
import settings from "../../docs/SETTINGS.md?raw";
import troubleshooting from "../../docs/TROUBLESHOOTING.md?raw";
import communityWidgets from "../../docs/WIDGETS.md?raw";

/** The English translations, in `docs/en/`, keyed by file name. */
const EN: Record<string, string> = import.meta.glob("../../docs/en/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const english = (file: string): string => EN[`../../docs/en/${file}`] ?? "";

export interface DocPage {
  id: string;
  /** Name of the Markdown file in `docs/`, as other pages link to it. */
  file: string;
  title: MessageKey;
  /** The French text. */
  source: string;
  /** The English text, same structure and examples. */
  sourceEn: string;
}

export interface DocSection {
  id: string;
  title: MessageKey;
  pages: DocPage[];
}

/** The sidebar, in reading order: from first steps to reference and contribution. */
export const DOC_SECTIONS: readonly DocSection[] = [
  {
    id: "start",
    title: "docs.section.start",
    pages: [
      { id: "getting-started", file: "GETTING_STARTED.md", title: "docs.page.gettingStarted", source: gettingStarted, sourceEn: english("GETTING_STARTED.md") },
      { id: "create-overlay", file: "CREATE_OVERLAY.md", title: "docs.page.createOverlay", source: createOverlay, sourceEn: english("CREATE_OVERLAY.md") },
    ],
  },
  {
    id: "use",
    title: "docs.section.use",
    pages: [
      { id: "editor", file: "EDITOR.md", title: "docs.page.editor", source: editor, sourceEn: english("EDITOR.md") },
      { id: "overlay", file: "OVERLAY.md", title: "docs.page.overlay", source: overlay, sourceEn: english("OVERLAY.md") },
      { id: "settings", file: "SETTINGS.md", title: "docs.page.settings", source: settings, sourceEn: english("SETTINGS.md") },
    ],
  },
  {
    id: "widgets",
    title: "docs.section.widgets",
    pages: [
      { id: "builtin-widgets", file: "BUILTIN_WIDGETS.md", title: "docs.page.builtinWidgets", source: builtinWidgets, sourceEn: english("BUILTIN_WIDGETS.md") },
      { id: "community-widgets", file: "WIDGETS.md", title: "docs.page.communityWidgets", source: communityWidgets, sourceEn: english("WIDGETS.md") },
    ],
  },
  {
    id: "reference",
    title: "docs.section.reference",
    pages: [{ id: "layout", file: "LAYOUT.md", title: "docs.page.layout", source: layout, sourceEn: english("LAYOUT.md") }],
  },
  {
    id: "api",
    title: "docs.section.api",
    pages: [
      { id: "api", file: "API.md", title: "docs.page.api", source: api, sourceEn: english("API.md") },
      { id: "rest-api", file: "REST_API.md", title: "docs.page.restApi", source: restApi, sourceEn: english("REST_API.md") },
      { id: "websocket", file: "WEBSOCKET.md", title: "docs.page.websocket", source: websocket, sourceEn: english("WEBSOCKET.md") },
      { id: "data-model", file: "DATA_MODEL.md", title: "docs.page.dataModel", source: dataModel, sourceEn: english("DATA_MODEL.md") },
    ],
  },
  {
    id: "project",
    title: "docs.section.project",
    pages: [
      { id: "architecture", file: "ARCHITECTURE.md", title: "docs.page.architecture", source: architecture, sourceEn: english("ARCHITECTURE.md") },
      { id: "contributing", file: "CONTRIBUTING.md", title: "docs.page.contributing", source: contributing, sourceEn: english("CONTRIBUTING.md") },
    ],
  },
  {
    id: "help",
    title: "docs.section.help",
    pages: [{ id: "troubleshooting", file: "TROUBLESHOOTING.md", title: "docs.page.troubleshooting", source: troubleshooting, sourceEn: english("TROUBLESHOOTING.md") }],
  },
];

/** Every page, in reading order (the order of the previous / next links). */
export const DOC_PAGES: readonly DocPage[] = DOC_SECTIONS.flatMap((s) => s.pages);

/** The section a page belongs to. */
export const sectionOf = (pageId: string): DocSection => DOC_SECTIONS.find((s) => s.pages.some((p) => p.id === pageId)) ?? DOC_SECTIONS[0];

export const FIRST_PAGE = DOC_PAGES[0].id;

export const docPage = (id: string | null | undefined): DocPage | undefined => DOC_PAGES.find((p) => p.id === id);

/** The page a Markdown file name (`EDITOR.md`) stands for. */
export const docIdOfFile = (file: string): string | undefined => DOC_PAGES.find((p) => p.file === file)?.id;
