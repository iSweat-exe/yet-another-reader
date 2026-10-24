import { useMemo, useState } from "react";
import { flagUrl, GUEST_AVATAR_URL, UNKNOWN_FLAG_URL } from "../lib/assets";
import { useReaderStore } from "../lib/store";
import type { Spectator } from "../lib/types";
import { Line } from "./shared";
import { fontSizeFor, type BuiltinOption, type WidgetDefinition, type WidgetProps } from "./types";
import { optionValues } from "./web";

/**
 * The flag of a country; the unknown flag (`__.png`) when the code is missing, malformed or has no file.
 */
export function Flag({ code, height, radius = 0, showCode = false }: { code: string; height: number; radius?: number; showCode?: boolean }) {
  const url = flagUrl(code);
  const [failed, setFailed] = useState<string | null>(null);
  const src = failed === url ? UNKNOWN_FLAG_URL : url;
  const text = code.trim().toUpperCase();
  return (
    <span className="inline-flex items-center whitespace-nowrap" style={{ gap: height * 0.3 }}>
      <img src={src} alt={text} decoding="async" draggable={false} onError={() => setFailed(url)} style={{ height, borderRadius: radius }} className="w-auto" />
      {showCode && text && (
        <span className="font-bold leading-none tabular-nums" style={{ fontSize: height * 0.7 }}>
          {text}
        </span>
      )}
    </span>
  );
}

const FLAG_OPTIONS: BuiltinOption[] = [
  { key: "showCode", type: "boolean", labelKey: "widget.opt.showCode", default: false },
  { key: "radius", type: "number", labelKey: "widget.opt.radius", default: 4, min: 0, max: 200 },
];

/** The country flag of the signed-in player. */
function FlagWidget({ instance }: WidgetProps) {
  const options = optionValues({ options: FLAG_OPTIONS }, instance.options);
  const code = useReaderStore((s) => s.game.user?.countryCode ?? "");
  const radius = typeof options.radius === "number" ? options.radius : 4;
  return <Flag code={code} height={instance.h * (instance.style?.scale ?? 1)} radius={radius} showCode={options.showCode === true} />;
}

/** An avatar from osu!'s servers, or the guest picture when remote avatars are off, missing or unreachable. */
function SpectatorAvatar({ user, size, remote, ring }: { user: Spectator; size: number; remote: boolean; ring: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = remote && user.avatarUrl && failed !== user.avatarUrl ? user.avatarUrl : GUEST_AVATAR_URL;
  return (
    <img
      src={url}
      alt={user.username}
      title={user.username}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => user.avatarUrl && setFailed(user.avatarUrl)}
      style={{ width: size, height: size, boxShadow: ring ? "0 0 0 2px rgb(24 24 28)" : undefined }}
      className="shrink-0 rounded-full bg-white/20 object-cover"
    />
  );
}

export const SPECTATOR_MODES = ["count", "names", "avatars", "namesAvatars"] as const;
type SpectatorMode = (typeof SPECTATOR_MODES)[number];

const SPECTATORS_OPTIONS: BuiltinOption[] = [
  { key: "mode", type: "select", labelKey: "widget.opt.mode", default: "avatars", choices: SPECTATOR_MODES.map((value) => ({ value })) },
  { key: "showCount", type: "boolean", labelKey: "widget.opt.showCount.spectators", default: true },
  { key: "limit", type: "number", labelKey: "widget.opt.limit", default: 5, min: 1, max: 20 },
  { key: "stack", type: "boolean", labelKey: "widget.opt.stack", default: true },
  { key: "remoteAvatars", type: "boolean", labelKey: "widget.opt.remoteAvatars", default: true },
  { key: "hideEmpty", type: "boolean", labelKey: "widget.opt.hideEmpty", default: false },
];

/** What the widget shows, from its saved options (unknown values fall back to the defaults). */
export function spectatorSettings(saved: Record<string, unknown> | undefined) {
  const o = optionValues({ options: SPECTATORS_OPTIONS }, saved);
  const mode: SpectatorMode = SPECTATOR_MODES.includes(o.mode as SpectatorMode) ? (o.mode as SpectatorMode) : "avatars";
  const limit = typeof o.limit === "number" && o.limit >= 1 ? Math.min(Math.floor(o.limit), 20) : 5;
  return { mode, limit, showCount: o.showCount !== false, stack: o.stack !== false, remote: o.remoteAvatars !== false, hideEmpty: o.hideEmpty === true };
}

/** Who is spectating the player: a count, names, avatars (optionally piled up), or a mix. */
function Spectators({ instance }: WidgetProps) {
  const { mode, limit, showCount, stack, remote, hideEmpty } = spectatorSettings(instance.options);
  const list = useReaderStore((s) => s.game.spectators);
  const total = useReaderStore((s) => s.game.spectatorCount);
  const shown = useMemo(() => list.slice(0, limit), [list, limit]);
  const count = Math.max(total, list.length);
  if (hideEmpty && count === 0) return null;

  const size = instance.h * (instance.style?.scale ?? 1);
  const hidden = Math.max(0, count - shown.length);
  const withAvatars = mode === "avatars" || mode === "namesAvatars";
  const withNames = mode === "names" || mode === "namesAvatars";
  const countLabel = <span className="font-bold tabular-nums">{count.toLocaleString("en-US")}</span>;

  if (mode === "count") {
    return (
      <Line instance={instance} fraction={0.8}>
        {countLabel}
      </Line>
    );
  }

  const overlap = withAvatars && !withNames && stack;
  return (
    <div className="flex size-full items-center overflow-hidden" style={{ gap: overlap ? 0 : size * 0.25, fontSize: fontSizeFor(instance, 0.6) }}>
      {showCount && <span className="mr-[0.4em] leading-none tabular-nums" style={{ fontSize: fontSizeFor(instance, 0.8), fontWeight: 700 }}>{count.toLocaleString("en-US")}</span>}
      {shown.map((user, i) => (
        <span key={user.id} className="flex min-w-0 shrink-0 items-center gap-[0.4em]" style={{ marginLeft: overlap && i > 0 ? -size * 0.3 : 0, zIndex: shown.length - i }}>
          {withAvatars && <SpectatorAvatar user={user} size={size * (withNames ? 0.8 : 1)} remote={remote} ring={overlap} />}
          {withNames && (
            <span className="max-w-[12em] truncate leading-none font-bold">
              {user.username}
              {i < shown.length - 1 && !withAvatars ? "," : ""}
            </span>
          )}
        </span>
      ))}
      {hidden > 0 && (
        <span
          className="flex shrink-0 items-center justify-center rounded-full bg-white/20 leading-none font-bold tabular-nums"
          style={{ height: size, minWidth: size, paddingInline: size * 0.15, marginLeft: overlap ? -size * 0.3 : 0, boxShadow: overlap ? "0 0 0 2px rgb(24 24 28)" : undefined }}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}

export const SOCIAL_WIDGETS: WidgetDefinition[] = [
  { type: "flag", labelKey: "widget.flag", defaultSize: { w: 72, h: 48 }, Component: FlagWidget, options: FLAG_OPTIONS },
  { type: "spectators", labelKey: "widget.spectators", defaultSize: { w: 280, h: 48 }, Component: Spectators, options: SPECTATORS_OPTIONS },
];
