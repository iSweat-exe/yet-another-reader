import { type MessageKey, useT } from "../i18n";
import type { GcMode, ReaderStatus } from "../lib/state/types";

interface PhaseView {
  text: MessageKey;
  hint?: MessageKey;
  /** Colour of the status dot. */
  dot: string;
}

const VIEW: Record<ReaderStatus["phase"], PhaseView> = {
  waiting: { text: "status.waiting", hint: "status.waitingHint", dot: "bg-ink-dim" },
  connecting: { text: "status.connecting", hint: "status.connectingHint", dot: "bg-amber-400 animate-pulse motion-reduce:animate-none" },
  connected: { text: "status.connected", dot: "bg-emerald-400" },
  error: { text: "status.error", dot: "bg-red-400" },
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-dim">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** `Interactive` is the game's normal GC mode: anything else is shown with its name; none yet before the first play. */
function gcText(mode: GcMode | null, t: ReturnType<typeof useT>): string {
  if (mode === null) return t("status.gcUnknown");
  if (mode === "interactive") return t("status.gcOn");
  return t("status.gcOff", { mode: mode.charAt(0).toUpperCase() + mode.slice(1) });
}

/** What the reader is doing with the game: one headline, then the facts of the connection on a single line. */
export function StatusCard({ status }: { status: ReaderStatus | null }) {
  const t = useT();
  const view = VIEW[status?.phase ?? "waiting"];
  return (
    <section aria-labelledby="status-heading">
      <h2 id="status-heading" className="sr-only">
        {t("status.title")}
      </h2>
      <p role="status" className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full transition-colors duration-200 ease-out ${view.dot}`} />
        {t(view.text)}
      </p>
      {view.hint && <p className="mt-2 text-sm text-pretty text-ink-dim starting:opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none">{t(view.hint)}</p>}
      {status?.phase === "error" && <p className="mt-2 text-sm text-ink-dim [overflow-wrap:anywhere] starting:opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none">{status.message}</p>}
      {status?.phase === "connected" && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm starting:opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none">
          <Fact label={t("status.version")} value={status.version} />
          <Fact label={t("status.stream")} value={status.stream} />
          <Fact label={t("status.gc")} value={gcText(status.gcMode, t)} />
          <Fact label={t("status.profile")} value={status.profile} />
          <Fact label={t("status.connectTime")} value={t("status.seconds", { n: (status.connectMs / 1000).toFixed(1) })} />
        </dl>
      )}
    </section>
  );
}
