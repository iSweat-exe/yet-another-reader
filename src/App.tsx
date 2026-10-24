import { lazy, Suspense, useEffect, useState } from "react";
import { ApiCard } from "./components/ApiCard";
import { Icon, type IconName, preloadOsuIcons } from "./components/Icon";
import { Backdrop } from "./components/Backdrop";
import { DebugCard } from "./components/DebugCard";
import { SettingsCard } from "./components/SettingsCard";
import { onTabListKeyDown } from "./components/tabKeys";
import { UpdateChip } from "./components/UpdateChip";
import { StatusCard } from "./components/StatusCard";
import { useT } from "./i18n";
import { LOGO_URL, menuBackgroundUrl } from "./lib/assets";
import { isTauri, startMock } from "./lib/mock";
import { WindowControls } from "./components/WindowControls";
import { ThemePicker } from "./components/ThemePicker";
import { Group } from "./components/controls";
import { connectReaderStore, useReaderStore } from "./lib/store";
import { useUiSounds } from "./lib/uiSounds";

// The editor is only needed when its tab is opened.
const EditorTab = lazy(() => import("./editor/EditorTab"));
const loadDocsTab = () => import("./docs/DocsTab");
const DocsTab = lazy(loadDocsTab);
const preloadDocs = () => void loadDocsTab();

type Tab = "status" | "settings" | "editor" | "docs";

const TABS: readonly Tab[] = ["status", "settings", "editor", "docs"];

/** Read-only: what the reader is doing (game connection, local API). */
function StatusTab() {
  const status = useReaderStore((s) => s.status);
  const api = useReaderStore((s) => s.api);

  return (
    <div className="relative min-h-0 flex-1">
      <Backdrop src={menuBackgroundUrl(2)} />
      <div className="relative h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
          <StatusCard status={status} />
          <ApiCard api={api} />
          <DebugCard />
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const t = useT();
  const settings = useReaderStore((s) => s.settings);
  const rtss = useReaderStore((s) => s.rtss);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 pt-8 pb-6">
        <h2 className="mb-6 text-xl font-semibold">{t("settings.title")}</h2>
        <div className="mb-8">
          <Group title={t("theme.title")}>
            <ThemePicker />
          </Group>
        </div>
        {settings && <SettingsCard settings={settings} rtss={rtss} />}
      </div>
    </div>
  );
}

export default function App() {
  const t = useT();
  useUiSounds();
  // The documentation stays mounted once it has been opened: coming back to it is instant, on the page and the
  // scroll position where it was left.
  const [docsOpened, setDocsOpened] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    const requested = new URLSearchParams(location.search).get("tab");
    return TABS.find((id) => id === requested) ?? "status";
  });

  useEffect(() => {
    if (tab === "docs") setDocsOpened(true);
  }, [tab]);

  // The editor is fetched once the app is idle; the docs (the heaviest chunk) only when their tab is approached.
  useEffect(() => {
    const preload = () => {
      void import("./editor/EditorTab");
      preloadOsuIcons();
    };
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(preload);
    else setTimeout(preload, 1500);
  }, []);

  useEffect(() => {
    // Plain browser (design preview): animated fake data instead of the Tauri backend.
    if (!isTauri) return startMock();
    const ready = connectReaderStore();
    return () => void ready.then((unlisten) => unlisten());
  }, []);

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: "status", label: t("tab.status"), icon: "online" },
    { id: "settings", label: t("tab.settings"), icon: "settings" },
    { id: "editor", label: t("tab.editor"), icon: "pencil" },
    { id: "docs", label: t("tab.docs"), icon: "wiki" },
  ];

  return (
    <div className="relative flex h-screen flex-col">
      {/* The header is also the window's title bar (the system one is off): its empty parts drag the window. */}
      <header data-tauri-drag-region className="flex items-center gap-6 border-b border-wash/8 px-4 select-none">
        <h1 data-tauri-drag-region className="hidden shrink-0 items-center gap-2 py-3 text-sm font-semibold sm:flex">
          <img data-tauri-drag-region src={LOGO_URL} alt="" width={20} height={20} decoding="async" draggable={false} className="logo size-5" />
          {t("app.title")}
        </h1>
        <nav role="tablist" aria-label={t("app.title")} onKeyDown={onTabListKeyDown} className="scroll-hidden -mb-px flex min-w-0 overflow-x-auto overflow-y-hidden pb-px">
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls="tab-panel"
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onPointerEnter={item.id === "docs" ? preloadDocs : undefined}
              onFocus={item.id === "docs" ? preloadDocs : undefined}
              className={`relative min-h-11 shrink-0 px-3 text-sm outline-none transition-[color,scale] duration-150 ease-out after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-center after:bg-accent after:transition-transform after:duration-200 after:ease-out focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] active:scale-[0.96] motion-reduce:after:transition-none ${tab === item.id ? "text-ink after:scale-x-100" : "text-ink-dim after:scale-x-0 hover:text-ink"}`}
            >
              <span className="flex items-center gap-1.5">
                <Icon name={item.icon} />
                {item.label}
              </span>
            </button>
          ))}
        </nav>
        <div data-tauri-drag-region className="min-w-6 flex-1 self-stretch" />
        <UpdateChip onOpen={() => setTab("settings")} />
        <WindowControls />
      </header>
      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === "status" && <StatusTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "editor" && (
          <Suspense fallback={null}>
            <EditorTab />
          </Suspense>
        )}
        {(tab === "docs" || docsOpened) && (
          <div className={tab === "docs" ? "contents" : "hidden"}>
            <Suspense fallback={null}>
              <DocsTab />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
