import { type CSSProperties, useEffect, useRef, useState } from "react";
import { GESTURES } from "./iconGestures";
import { OSU_ICONS, type OsuIconName, osuIconScale, osuIconUrl } from "./osuIcons";

/**
 * One icon set for the whole UI. Where an osu!lazer icon has the right meaning it is used (see
 * `osuIcons.ts`, drawn as a CSS mask); the others are the outline icons below: 16×16 grid, 1.5px strokes,
 * round joins, `currentColor`. Either way, states (hover, selected, disabled) come from the surrounding
 * text colour, never from a second asset. A few SVG icons use a filled shape (see {@link FILLED}).
 */
const PATHS = {
  // actions
  check: "M3.5 8.5l3 3 6-7",
  download: "M8 2.5v8M5 7.5l3 3 3-3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2",
  upload: "M8 10.5v-8M5 5.5l3-3 3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2",
  refresh: "M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3",
  external: "M9 3.5h3.5V7M12.5 3.5L7 9M6 4.5H4a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1V10",
  lock: "M4.5 7.5h7a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2",
  unlock: "M4.5 7.5h7a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM5.5 7.5V5.5a2.5 2.5 0 0 1 4.8-1",
  "chevron-up": "M4 9.5l4-4 4 4",
  "chevron-down": "M4 6.5l4 4 4-4",
  "chevron-right": "M6.5 4l4 4-4 4",
  save: "M3.5 2.5h7l2 2v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5.5 2.5v3h4v-3M5.5 13.5v-4h5v4",
  spinner: "M8 2.5a5.5 5.5 0 1 0 5.5 5.5",
  // view
  layers: "M8 2.5l5.5 3-5.5 3-5.5-3zM2.5 8.5l5.5 3 5.5-3M2.5 11.5l5.5 3 5.5-3",
  star: "M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4 4.4 13.3l.7-4L2.2 6.5l4-.6z",
  // alignment
  "align-left": "M2 1.5v13M5 4h9v3H5zM5 9h5v3H5z",
  "align-center": "M8 1.5v13M3 4h10v3H3zM5 9h6v3H5z",
  "align-right": "M14 1.5v13M2 4h9v3H2zM6 9h5v3H6z",
  "align-top": "M1.5 2h13M4 5v9h3V5zM9 5v5h3V5z",
  "align-middle": "M1.5 8h13M4 3v10h3V3zM9 5v6h3V5z",
  "align-bottom": "M1.5 14h13M4 2v9h3V2zM9 6v5h3V6z",
  group: "M2 2h3M11 2h3M2 14h3M11 14h3M2 5v6M14 5v6M5 5.5h6v5H5z",
  ungroup: "M2.5 2.5h5v5h-5zM8.5 8.5h5v5h-5z",
  "distribute-h": "M2 1.5v13M14 1.5v13M6.5 4.5h3v7h-3z",
  "distribute-v": "M1.5 2h13M1.5 14h13M4.5 6.5h7v3h-7z",
  text: "M3 4h10M8 4v9M6 13h4",
  // widgets
  combo: "M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.5.5M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.5-.5",
  ur: "M1.5 8h3l2-5 3 10 2-5h3",
  pp: "M9 2L3.5 9H8l-1 5L12.5 7H8z",
  progress: "M2.5 6.5h11v3h-11zM2.5 6.5h5v3h-5z",
  graph: "M2.5 13.5v-3h2v3zM6 13.5v-7h2v7zM9.5 13.5v-9.5h2v9.5zM13 13.5v-5h2v5z",
  mods: "M3 5h6M11 5h2M3 11h2M7 11h6M9 3.5v3M5 9.5v3",
  errors: "M3 5v6M6 3.5v9M8 2.5v11M10 4.5v7M13 6v4",
  eye: "M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8s-2.3 4.5-6.5 4.5S1.5 8 1.5 8zM8 9.8a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  flag: "M4 14V2.5M4 3h8l-1.5 2.75L12 8.5H4",
  image: "M2.5 3.5h11v9h-11zM2.5 11l3.5-3.5 3 3 2-2 2.5 2.5M10.5 6.25h.01",
} as const;

export type IconName = keyof typeof PATHS | OsuIconName;

/** Icons drawn as a filled shape rather than an outline. */
const FILLED: ReadonlySet<IconName> = new Set(["star"]);

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const isOsu = (name: IconName): name is OsuIconName => Object.prototype.hasOwnProperty.call(OSU_ICONS, name);

/** The controls an icon reacts to: an icon that is not inside one of them stays still. */
const HOSTS = 'button, a, [role="tab"], [role="radio"]';

let preloaded = false;
/** Fetches the animation library once the app is idle, so the first hover does not wait for it. */
function preloadMotion() {
  if (preloaded) return;
  preloaded = true;
  const load = () => void import("./iconMotion");
  // Not every webview has requestIdleCallback.
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(load);
  else setTimeout(load, 1000);
}

/**
 * Pictures already fetched. A mask whose picture is still loading would paint the whole box in
 * `currentColor`, so an osu icon stays invisible (but keeps its room) until its picture is here.
 */
const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

function loadPicture(url: string): Promise<void> {
  let pending = loading.get(url);
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded.add(url);
        resolve();
      };
      img.src = url;
    });
    loading.set(url, pending);
  }
  return pending;
}

/** Fetches every osu icon of the interface (small files), once. Not called by the in-game overlay. */
export function preloadOsuIcons(): void {
  for (const { file } of Object.values(OSU_ICONS)) void loadPicture(osuIconUrl(file));
}

/**
 * Plays the icon's gesture (see `iconGestures.ts`) when the pointer or the keyboard focus reaches the
 * control it sits in. Skipped for a disabled control, with "reduce motion", and while a gesture is
 * still running (no restarting from the middle).
 */
function useIconGesture(name: IconName) {
  const root = useRef<SVGSVGElement & HTMLSpanElement>(null);
  const path = useRef<SVGPathElement>(null);
  useEffect(() => {
    const icon = root.current;
    const host = icon?.closest<HTMLElement>(HOSTS);
    if (!icon || !host || !GESTURES[name]) return;
    preloadMotion();
    let playing = false;
    const play = () => {
      if (playing || !root.current) return;
      if (host.matches(':disabled, [aria-disabled="true"]') || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      playing = true;
      void import("./iconMotion")
        .then(({ playGesture }) => root.current && playGesture(name, icon, path.current))
        .finally(() => (playing = false));
    };
    // Keyboard focus counts (`:focus-visible`); a click's focus does not replay what the hover just showed.
    const onFocus = () => host.matches(":focus-visible") && play();
    host.addEventListener("pointerenter", play);
    host.addEventListener("focus", onFocus);
    return () => {
      host.removeEventListener("pointerenter", play);
      host.removeEventListener("focus", onFocus);
    };
  }, [name]);
  return { root, path };
}

export function Icon({ name, size = 16, className, style }: IconProps) {
  const { root, path } = useIconGesture(name);
  const osu = isOsu(name) ? OSU_ICONS[name] : undefined;
  const url = osu ? osuIconUrl(osu.file) : "";
  const [ready, setReady] = useState(() => loaded.has(url));
  useEffect(() => {
    if (!osu || ready) return;
    let live = true;
    void loadPicture(url).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [osu, ready, url]);

  if (osu) {
    const scale = osuIconScale(osu.ext);
    // The box has the size of the icon (or what the caller's class gives it); the mask is centred in it and
    // sized relative to it, so `size-[0.9em]` and the like keep working.
    return (
      <span ref={root} aria-hidden className={`osu-icon ${className ?? ""}`} style={{ "--icon-size": `${size}px`, ...style } as CSSProperties}>
        <span
          className="osu-icon-mask"
          style={{
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
            visibility: ready ? "visible" : "hidden",
            maskImage: `url(${url})`,
            WebkitMaskImage: `url(${url})`,
            ...(osu.flip ? { scale: "-1 1" } : {}),
          }}
        />
      </span>
    );
  }

  const filled = FILLED.has(name);
  const svgName = name as keyof typeof PATHS;
  return (
    <svg
      ref={root}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${name === "spinner" ? "animate-spin" : ""} ${className ?? ""}`}
      style={style}
    >
      <path ref={path} d={PATHS[svgName]} />
    </svg>
  );
}
