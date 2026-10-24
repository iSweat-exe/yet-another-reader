import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { rulesetIconUrl } from "../lib/assets";
import { clearLog, useReaderStore } from "../lib/store";
import type { InputConsumers, LogLevel, LogLine } from "../lib/types";
import { CopyButton, Group } from "./controls";
import { Icon } from "./Icon";
import { ModIcon } from "./ModIcon";

/** A label and its value on one line; `hint` goes under the value in the dim colour. */
function Fact({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-sm text-ink-dim">{label}</dt>
      <dd className="min-w-0 text-right text-sm tabular-nums [overflow-wrap:anywhere]">
        <span className={tone}>{value}</span>
        {hint && <span className="block text-xs text-ink-dim">{hint}</span>}
      </dd>
    </div>
  );
}

/** `3 min 12 s`, `42 s`, `1 h 05 min`. */
function duration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

function consumersText(c: InputConsumers, t: ReturnType<typeof useT>): string {
  const who = [...c.windows.map((w) => t("debug.window", { name: w })), ...(c.sockets > 0 ? [t("debug.sockets", { n: c.sockets })] : []), ...(c.rest ? [t("debug.restClient")] : [])];
  return who.join(", ");
}

/** What the reader loop is doing: how often it reads the game, how long that takes, who asks for the keys. */
function Metrics() {
  const t = useT();
  const diag = useReaderStore((s) => s.diag);
  if (!diag) return (
      <Group title={t("debug.reader")}>
        <p className="py-3 text-sm text-ink-dim">{t("debug.noData")}</p>
      </Group>
    );

  // Reading well below the asked-for rate means the loop is not keeping up (the game is busy or reads fail).
  const behind = diag.snapshotsPerSec < diag.targetSnapshotsPerSec * 0.8;
  return (
    <Group title={t("debug.reader")}>
      <Fact label={t("debug.snapshots")} value={`${diag.snapshotsPerSec.toFixed(1)} / s`} hint={t("debug.target", { n: diag.targetSnapshotsPerSec.toFixed(0) })} tone={behind ? "text-amber-400" : undefined} />
      <Fact label={t("debug.snapshotTime")} value={`${diag.snapshotMs.toFixed(2)} ms`} hint={t("debug.worst", { ms: diag.snapshotMaxMs.toFixed(1) })} />
      <Fact
        label={t("debug.reads")}
        value={
          <>
            {diag.snapshotsOk.toLocaleString()}
            <span className="text-ink-dim"> ok · </span>
            <span className={diag.snapshotsFailed > 0 ? "text-amber-400" : undefined}>{diag.snapshotsFailed.toLocaleString()}</span>
            <span className="text-ink-dim"> {t("debug.failed")}</span>
          </>
        }
      />
      <Fact
        label={t("debug.inputs")}
        value={diag.inputsReading ? t("debug.inputsOn", { rate: diag.inputReadsPerSec.toFixed(0), us: diag.inputReadUs.toFixed(0) }) : t("debug.inputsOff")}
        hint={diag.inputsReading ? t("debug.askedBy", { who: consumersText(diag.inputConsumers, t) || "?" }) : undefined}
        tone={diag.inputsReading ? "text-emerald-400" : "text-ink-dim"}
      />
      <Fact label={t("debug.clients")} value={diag.stateClients} />
      <Fact label={t("debug.session")} value={duration(diag.sessionMs)} hint={t("debug.sessionCount", { n: diag.sessions })} />
      {diag.lastError && <Fact label={t("debug.lastError")} value={diag.lastError} tone="text-amber-400" />}
    </Group>
  );
}

/** The game as the reader currently sees it, decoded. Updates as fast as the window gets states. */
function Seen() {
  const t = useT();
  const game = useReaderStore((s) => s.game);
  const input = useReaderStore((s) => s.input);
  const none = t("debug.none");
  const play = game.gameplay;
  const held = [...input.keys, ...input.mouse.map((m) => `M:${m}`)];
  const adjust = game.difficultyAdjust;
  const adjustText = adjust ? Object.entries(adjust).filter(([, v]) => v !== null).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(" ") : "";

  return (
    <Group title={t("debug.seen")}>
      <Fact label={t("debug.screen")} value={game.screenType ? game.screenType.split(".").pop() : none} hint={game.screen} />
      <Fact
        label={t("debug.ruleset")}
        value={
          <span className="inline-flex items-center gap-2">
            {rulesetIconUrl(game.ruleset) && <img src={rulesetIconUrl(game.ruleset)} alt="" width={20} height={20} decoding="async" draggable={false} className="size-5 opacity-90" />}
            {game.ruleset ?? none}
          </span>
        }
      />
      <Fact label={t("debug.mods")} value={game.mods.length ? <span className="inline-flex flex-wrap items-center justify-end gap-1">{game.mods.map((mod) => <ModIcon key={mod} mod={mod} height={22} />)}</span> : none} hint={`${t("debug.speed", { n: game.clockRate })}${adjustText ? ` · ${adjustText}` : ""}`} />
      <Fact label={t("debug.beatmap")} value={game.beatmap ? `${game.beatmap.artist} - ${game.beatmap.title}` : none} hint={game.beatmap ? `[${game.beatmap.version}]${game.difficulty ? ` · ${game.difficulty.stars.toFixed(2)}★ · ${game.difficulty.pp100.toFixed(0)} pp` : ""}` : undefined} />
      <Fact label={t("debug.clock")} value={game.time ? `${(game.time.currentMs / 1000).toFixed(1)} s` : none} hint={game.time ? `${game.time.source}${game.time.running ? "" : " · paused"}` : undefined} />
      <Fact
        label={t("debug.play")}
        value={play ? `${play.score.toLocaleString()} · ${play.combo}x · ${(play.accuracy * 100).toFixed(2)}%` : none}
        hint={play ? `${play.hits.great}/${play.hits.ok}/${play.hits.meh}/${play.hits.miss}${play.pp ? ` · ${play.pp.live.toFixed(0)} pp` : ""}${play.paused ? " · paused" : ""}` : undefined}
      />
      <Fact label={t("debug.held")} value={held.length ? held.join(" ") : "—"} tone={held.length ? "text-accent" : "text-ink-dim"} />
    </Group>
  );
}

const LEVEL_TONE: Record<LogLevel, string> = {
  info: "text-ink-dim",
  warn: "text-amber-400",
  error: "text-red-400",
};

const SOURCE_TONE: Record<string, string> = {
  reader: "text-sky-300",
  game: "text-emerald-300",
  inputs: "text-violet-300",
  api: "text-orange-300",
  settings: "text-pink-300",
};

function clock(atMs: number): string {
  const d = new Date(atMs);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function lineText(l: LogLine): string {
  return `${clock(l.atMs)} ${l.level.toUpperCase().padEnd(5)} ${l.source.padEnd(8)} ${l.text}`;
}

/** The last things the app did, newest at the bottom; follows the end unless the user scrolled up. */
function Journal() {
  const t = useT();
  const log = useReaderStore((s) => s.log);
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [log, follow]);
  useEffect(() => {
    const el = box.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [follow]);

  return (
    <Group
      title={t("debug.log")}
      aside={
        <div className="-my-2 flex items-center gap-1">
          <button type="button" aria-pressed={follow} onClick={() => setFollow(!follow)} className={`min-h-10 rounded-lg px-2.5 text-xs outline-none transition-[color,background-color,scale] duration-150 ease-out hover:bg-wash/6 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] ${follow ? "text-accent" : "text-ink-dim"}`}>
            {t("debug.follow")}
          </button>
          <button type="button" onClick={clearLog} disabled={log.length === 0} className="min-h-10 rounded-lg px-2.5 text-xs text-ink-dim outline-none transition-[color,background-color,scale] duration-150 ease-out hover:bg-wash/6 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100">
            {t("debug.clear")}
          </button>
          <CopyButton text={log.map(lineText).join("\n")} />
        </div>
      }
    >
      <div
        ref={box}
        role="log"
        aria-label={t("debug.log")}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
          if (atEnd !== follow) setFollow(atEnd);
        }}
        className="my-3 max-h-72 overflow-y-auto rounded-lg bg-canvas px-3 py-2 font-mono text-xs leading-5 shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.06)]"
      >
        {log.length === 0 ? (
          <p className="py-1 font-sans text-sm text-ink-dim">{t("debug.logEmpty")}</p>
        ) : (
          log.map((l, i) => (
            <p key={`${l.atMs}-${i}`} className="flex gap-3 whitespace-pre-wrap">
              <span className="shrink-0 text-ink-dim tabular-nums">{clock(l.atMs)}</span>
              <span className={`w-14 shrink-0 ${SOURCE_TONE[l.source] ?? "text-ink-dim"}`}>{l.source}</span>
              <span className={`min-w-0 [overflow-wrap:anywhere] ${LEVEL_TONE[l.level]}`}>{l.text}</span>
            </p>
          ))
        )}
      </div>
    </Group>
  );
}

/** Debug section of the Status page: what the reader loop does, what it sees, and a journal. */
export function DebugCard() {
  const t = useT();
  return (
    <section aria-labelledby="debug-heading" className="space-y-6">
      <div className="flex items-center gap-2">
        <Icon name="debug" className="text-ink-dim" />
        <h2 id="debug-heading" className="text-base font-semibold">
          {t("debug.title")}
        </h2>
      </div>
      <Metrics />
      <Seen />
      <Journal />
    </section>
  );
}

