import { type MessageKey, useT } from "../i18n";
import type { ApiStatus } from "../lib/types";
import { CopyButton, Group } from "./controls";

const EXAMPLES = ["/api/v1/state", "/api/v1/gameplay", "/api/v1/beatmap", "/api/v1/docs"];

/** One copyable address: the protocol tag, the host dimmed so the path stands out, and the copy button. */
function Endpoint({ tag, base, path }: { tag: string; base: string; path: string }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <span className="w-9 shrink-0 text-xs font-medium text-ink-dim">{tag}</span>
      <code className="flex min-w-0 flex-1 text-sm tabular-nums" title={`${base}${path}`}>
        <span className="min-w-0 truncate text-ink-dim">{base}</span>
        <span className="shrink-0">{path}</span>
      </code>
      <CopyButton text={`${base}${path}`} />
    </div>
  );
}

export function ApiCard({ api }: { api: ApiStatus | null }) {
  const t = useT();

  const badge: { text: MessageKey | null; dot: string } = !api
    ? { text: null, dot: "bg-ink-dim" }
    : api.running
      ? { text: "api.online", dot: "bg-emerald-400" }
      : api.error
        ? { text: "api.error", dot: "bg-red-400" }
        : { text: "api.disabled", dot: "bg-ink-dim" };

  const aside = (
    <span className="flex items-center gap-1.5 text-xs text-ink-dim">
      <span className={`size-1.5 rounded-full transition-colors duration-200 ease-out ${badge.dot}`} aria-hidden />
      {badge.text ? t(badge.text) : "…"}
    </span>
  );

  if (api?.running && api.url) {
    return (
      <div className="space-y-2">
        <Group title={t("api.title")} aside={aside}>
          {EXAMPLES.map((path) => (
            <Endpoint key={path} tag="GET" base={api.url ?? ""} path={path} />
          ))}
          <Endpoint tag="WS" base={api.url.replace("http", "ws")} path="/api/v1/ws" />
        </Group>
        <p className="text-xs text-pretty text-ink-dim">{t("api.hint")}</p>
      </div>
    );
  }

  return (
    <Group title={t("api.title")} aside={aside}>
      <div className="py-3 text-sm">
        {api?.error && <p className="text-red-400">{api.error}</p>}
        {!api?.error && <p className="text-ink-dim">{t("api.enableHint")}</p>}
      </div>
    </Group>
  );
}
