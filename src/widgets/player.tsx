import { useState } from "react";
import { useReaderStore } from "../lib/store";
import type { UserStatistics } from "../lib/types";
import { AnimatedNumber } from "../overlay/AnimatedNumber";
import { animationMsFor, fontSizeFor, type WidgetDefinition, type WidgetProps } from "./types";

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

function Username({ instance }: WidgetProps) {
  const name = useReaderStore((s) => s.game.user?.username ?? "");
  return (
    <Line instance={instance} fraction={0.8}>
      <span className="block truncate">{name}</span>
    </Line>
  );
}

function Avatar({ instance }: WidgetProps) {
  const user = useReaderStore((s) => s.game.user);
  const [failed, setFailed] = useState<string | null>(null);
  if (!user) return null;
  const broken = !user.avatarUrl || failed === user.avatarUrl;
  return broken ? (
    <div className="flex size-full items-center justify-center rounded-[12%] bg-white/20 font-bold" style={{ fontSize: instance.h * 0.45 }}>
      {user.username.slice(0, 1).toUpperCase()}
    </div>
  ) : (
    <img src={user.avatarUrl} alt={user.username} draggable={false} onError={() => setFailed(user.avatarUrl)} className="size-full rounded-[12%] object-cover" />
  );
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
  return (
    <Line instance={instance} fraction={0.8}>
      {rank === null ? "—" : <AnimatedNumber value={rank} format={(n) => `${country} #${count(n)}`.trim()} durationMs={animationMsFor(instance)} />}
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
  { type: "username", labelKey: "widget.username", defaultSize: { w: 320, h: 48 }, Component: Username },
  { type: "globalRank", labelKey: "widget.globalRank", defaultSize: { w: 240, h: 44 }, Component: GlobalRank },
  { type: "countryRank", labelKey: "widget.countryRank", defaultSize: { w: 240, h: 44 }, Component: CountryRank },
  { type: "playerPp", labelKey: "widget.playerPp", defaultSize: { w: 240, h: 44 }, Component: PlayerPp },
  { type: "playerAccuracy", labelKey: "widget.playerAccuracy", defaultSize: { w: 240, h: 44 }, Component: PlayerAccuracy },
  { type: "playCount", labelKey: "widget.playCount", defaultSize: { w: 280, h: 44 }, Component: PlayCount },
];
