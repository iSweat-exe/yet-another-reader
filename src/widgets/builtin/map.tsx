import { useState } from "react";
import { useT } from "../../i18n";
import { useReaderStore } from "../../lib/state/store";
import type { Beatmap } from "../../lib/state/types";
import { Truncated } from "../shared";
import { type BuiltinOption, type WidgetDefinition, type WidgetProps } from "../types";
import { optionValues } from "../web";

const UNICODE_OPTION: BuiltinOption = { key: "unicode", type: "boolean", labelKey: "widget.opt.unicode", default: false };

function Title({ instance }: WidgetProps) {
  const unicode = optionValues({ options: [UNICODE_OPTION] }, instance.options).unicode === true;
  const title = useReaderStore((s) => (unicode ? s.game.beatmap?.titleUnicode : s.game.beatmap?.title) ?? "");
  return (
    <Truncated instance={instance} fraction={0.7}>
      {title}
    </Truncated>
  );
}

function Artist({ instance }: WidgetProps) {
  const unicode = optionValues({ options: [UNICODE_OPTION] }, instance.options).unicode === true;
  const artist = useReaderStore((s) => (unicode ? s.game.beatmap?.artistUnicode : s.game.beatmap?.artist) ?? "");
  return (
    <Truncated instance={instance} fraction={0.6} weight={600}>
      {artist}
    </Truncated>
  );
}

const MAPPER_OPTIONS: BuiltinOption[] = [{ key: "prefix", type: "boolean", labelKey: "widget.opt.prefix", default: true }];

function Mapper({ instance }: WidgetProps) {
  const t = useT();
  const prefix = optionValues({ options: MAPPER_OPTIONS }, instance.options).prefix !== false;
  const creator = useReaderStore((s) => s.game.beatmap?.creator ?? "");
  if (!creator) return null;
  return (
    <Truncated instance={instance} fraction={0.6} weight={600}>
      {prefix ? t("widget.mappedBy", { name: creator }) : creator}
    </Truncated>
  );
}

function Version({ instance }: WidgetProps) {
  const version = useReaderStore((s) => s.game.beatmap?.version ?? "");
  return (
    <Truncated instance={instance} fraction={0.6} weight={600}>
      {version}
    </Truncated>
  );
}

const BACKGROUND_OPTIONS: BuiltinOption[] = [
  {
    key: "fit",
    type: "select",
    labelKey: "widget.opt.fit",
    default: "cover",
    choices: [{ value: "cover" }, { value: "contain" }],
  },
  { key: "radius", type: "number", labelKey: "widget.opt.radius", default: 12, min: 0, max: 400 },
  { key: "blur", type: "number", labelKey: "widget.opt.blur", default: 0, min: 0, max: 60 },
];

/**
 * The beatmap's background picture. It is served by the local API, so it needs the API to be on;
 * while the picture is not available (simulated data, no API) a placeholder keeps the box visible.
 */
function Background({ instance }: WidgetProps) {
  const options = optionValues({ options: BACKGROUND_OPTIONS }, instance.options);
  const map = useReaderStore((s) => s.game.beatmap);
  const api = useReaderStore((s) => s.api);
  const [failed, setFailed] = useState<string | null>(null);
  const radius = typeof options.radius === "number" ? options.radius : 12;
  const blur = typeof options.blur === "number" ? options.blur : 0;
  const src = backgroundUrl(map, api);
  const shape = { borderRadius: radius, filter: blur > 0 ? `blur(${blur}px)` : undefined };

  if (!src || failed === src) {
    return <div className="size-full" style={{ ...shape, background: "linear-gradient(135deg, rgb(255 255 255 / 0.18), rgb(255 255 255 / 0.05))" }} />;
  }
  return <img src={src} alt="" draggable={false} onError={() => setFailed(src)} className="size-full" style={{ ...shape, objectFit: options.fit === "contain" ? "contain" : "cover" }} />;
}

/** Address of the current beatmap's background in the local API, or `null` when there is none. */
export function backgroundUrl(map: Pick<Beatmap, "assets" | "sha256"> | null, api: { running: boolean; url: string | null } | null): string | null {
  if (!map?.assets.background || !api?.running || !api.url) return null;
  // The address is the same for every beatmap: the hash keeps the browser from showing an old picture.
  return `${api.url}/api/v1/assets/background?v=${encodeURIComponent(map.sha256)}`;
}

export const MAP_WIDGETS: WidgetDefinition[] = [
  { type: "title", labelKey: "widget.title", defaultSize: { w: 700, h: 44 }, Component: Title, options: [UNICODE_OPTION] },
  { type: "artist", labelKey: "widget.artist", defaultSize: { w: 600, h: 36 }, Component: Artist, options: [UNICODE_OPTION] },
  { type: "mapper", labelKey: "widget.mapper", defaultSize: { w: 360, h: 32 }, Component: Mapper, options: MAPPER_OPTIONS },
  { type: "version", labelKey: "widget.version", defaultSize: { w: 420, h: 32 }, Component: Version },
  { type: "background", labelKey: "widget.background", defaultSize: { w: 640, h: 360 }, Component: Background, options: BACKGROUND_OPTIONS },
];
