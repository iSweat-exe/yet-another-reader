import { useState } from "react";
import { flagUrl, GUEST_AVATAR_URL, UNKNOWN_FLAG_URL } from "../../lib/media/assets";
import { useReaderStore } from "../../lib/state/store";
import type { UserStatistics } from "../../lib/state/types";
import { AnimatedNumber } from "../../overlay/AnimatedNumber";
import { Flag } from "./social";
import { animationMsFor, fontSizeFor, type BuiltinOption, type WidgetDefinition, type WidgetProps } from "../types";
import { optionValues } from "../web";

const count = (n: number) => Math.round(n).toLocaleString("en-US");

function useStats(): UserStatistics | null {
  return useReaderStore((s) => s.game.user?.statistics ?? null);
}

/** One line of text sized from the widget's height, like the gameplay widgets. */
function Line({ instance, fraction, weight = 700, children }: WidgetProps & { fraction: number; weight?: number; children: React.ReactNode }) {
  return (
    <div className="leading-none whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, fraction), fontWeight: weight }}>
      {children}
    </div>
  );
}

const USERNAME_OPTIONS: BuiltinOption[] = [{ key: "showFlag", type: "boolean", labelKey: "widget.opt.showFlag", default: false }];

function Username({ instance }: WidgetProps) {
  const name = useReaderStore((s) => s.game.user?.username ?? "");
  const country = useReaderStore((s) => s.game.user?.countryCode ?? "");
  const showFlag = optionValues({ options: USERNAME_OPTIONS }, instance.options).showFlag === true;
  return (
    <Line instance={instance} fraction={0.8}>
      <span className="flex items-center gap-[0.35em]">
        {showFlag && <Flag code={country} height={fontSizeFor(instance, 0.7)} radius={2} />}
        <span className="block truncate">{name}</span>
      </span>
    </Line>
  );
}

function Avatar() {
  const user = useReaderStore((s) => s.game.user);
  const [failed, setFailed] = useState<string | null>(null);
  if (!user) return null;
  const broken = !user.avatarUrl || failed === user.avatarUrl;
  return <img src={broken ? GUEST_AVATAR_URL : user.avatarUrl} alt={user.username} draggable={false} decoding="async" onError={() => setFailed(user.avatarUrl)} className="size-full rounded-[12%] object-cover" />;
}

function GlobalRank({ instance }: WidgetProps) {
  const rank = useStats()?.globalRank ?? null;
  return (
    <Line instance={instance} fraction={0.8}>
      {rank === null ? "—" : <AnimatedNumber value={rank} format={(n) => `#${count(n)}`} durationMs={animationMsFor(instance)} />}
    </Line>
  );
}

function CountryRank({ instance }: WidgetProps) {
  const rank = useStats()?.countryRank ?? null;
  const country = useReaderStore((s) => s.game.user?.countryCode ?? "");
  const flag = flagUrl(country);
  return (
    <Line instance={instance} fraction={0.8}>
      <span className="inline-flex items-center gap-[0.35em]">
        {rank !== null && <img src={flag} alt="" decoding="async" draggable={false} style={{ height: "0.8em" }} className="w-auto rounded-[2px]" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = UNKNOWN_FLAG_URL; }} />}
        {rank === null ? "—" : <AnimatedNumber value={rank} format={(n) => `#${count(n)}`} durationMs={animationMsFor(instance)} />}
      </span>
    </Line>
  );
}

function PlayerPp({ instance }: WidgetProps) {
  const pp = useStats()?.pp ?? null;
  return (
    <Line instance={instance} fraction={0.8}>
      {pp === null ? "—pp" : <AnimatedNumber value={pp} format={(n) => `${count(n)}pp`} durationMs={animationMsFor(instance)} />}
    </Line>
  );
}

function PlayerAccuracy({ instance }: WidgetProps) {
  const acc = useStats()?.accuracy ?? null;
  return (
    <Line instance={instance} fraction={0.8}>
      {acc === null ? "—" : <AnimatedNumber value={acc} format={(n) => `${n.toFixed(2)}%`} durationMs={animationMsFor(instance)} />}
    </Line>
  );
}

function PlayCount({ instance }: WidgetProps) {
  const plays = useStats()?.playCount ?? null;
  return (
    <Line instance={instance} fraction={0.8}>
      {plays === null ? "—" : <AnimatedNumber value={plays} format={(n) => `${count(n)} plays`} durationMs={animationMsFor(instance)} />}
    </Line>
  );
}

export const PLAYER_WIDGETS: WidgetDefinition[] = [
  { type: "avatar", labelKey: "widget.avatar", defaultSize: { w: 96, h: 96 }, Component: Avatar },
  { type: "username", labelKey: "widget.username", defaultSize: { w: 320, h: 48 }, Component: Username, options: USERNAME_OPTIONS },
  { type: "globalRank", labelKey: "widget.globalRank", defaultSize: { w: 240, h: 44 }, Component: GlobalRank },
  { type: "countryRank", labelKey: "widget.countryRank", defaultSize: { w: 240, h: 44 }, Component: CountryRank },
  { type: "playerPp", labelKey: "widget.playerPp", defaultSize: { w: 240, h: 44 }, Component: PlayerPp },
  { type: "playerAccuracy", labelKey: "widget.playerAccuracy", defaultSize: { w: 240, h: 44 }, Component: PlayerAccuracy },
  { type: "playCount", labelKey: "widget.playCount", defaultSize: { w: 280, h: 44 }, Component: PlayCount },
];
