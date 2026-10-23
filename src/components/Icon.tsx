import { type SVGProps, useEffect, useRef } from "react";
import { GESTURES } from "./iconGestures";

/**
 * One outline icon set for the whole UI: 16×16 grid, 1.5px strokes, round joins, `currentColor`.
 * States (hover, selected, disabled) come from the surrounding text colour, never from a second
 * asset. A few icons use a filled shape (see {@link FILLED}).
 */
const PATHS = {
  // actions
  plus: "M8 3v10M3 8h10",
  close: "M4 4l8 8M12 4l-8 8",
  check: "M3.5 8.5l3 3 6-7",
  copy: "M5.5 5.5h7a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM3.5 10.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V4",
  pencil: "M10.5 3.5l2 2L6 12l-3 1 1-3 6.5-6.5z",
  trash: "M3 4.5h10M6.5 4.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.5M4.5 4.5l.5 8a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-8",
  download: "M8 2.5v8M5 7.5l3 3 3-3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2",
  upload: "M8 10.5v-8M5 5.5l3-3 3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2",
  undo: "M5.5 3l-3 3 3 3M2.5 6h6a4 4 0 0 1 0 8H6",
  redo: "M10.5 3l3 3-3 3M13.5 6h-6a4 4 0 0 0 0 8H10",
  refresh: "M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3",
  folder: "M2.5 4.5a1 1 0 0 1 1-1h2.7l1.3 1.5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z",
  external: "M9 3.5h3.5V7M12.5 3.5L7 9M6 4.5H4a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1V10",
  lock: "M4.5 7.5h7a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2",
  unlock: "M4.5 7.5h7a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM5.5 7.5V5.5a2.5 2.5 0 0 1 4.8-1",
  "chevron-up": "M4 9.5l4-4 4 4",
  "chevron-down": "M4 6.5l4 4 4-4",
  "chevron-right": "M6.5 4l4 4-4 4",
  save: "M3.5 2.5h7l2 2v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5.5 2.5v3h4v-3M5.5 13.5v-4h5v4",
  spinner: "M8 2.5a5.5 5.5 0 1 0 5.5 5.5",
  "check-circle": "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM5.5 8.5l2 2 3.5-4",
  // view
  grid: "M2.5 2.5h11v11h-11zM2.5 8h11M8 2.5v11",
  magnet: "M4 2.5v6a4 4 0 0 0 8 0v-6M4 5.5h2.5M9.5 5.5H12",
  monitor: "M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3",
  layers: "M8 2.5l5.5 3-5.5 3-5.5-3zM2.5 8.5l5.5 3 5.5-3M2.5 11.5l5.5 3 5.5-3",
  search: "M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14 14l-3.5-3.5",
  cursor: "M3.5 2.5l9 4-4 1.5-1.5 4z",
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
  keyboard: "M2.5 4.5h11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1zM4.5 7h.01M7 7h.01M9 7h.01M11.5 7h.01M5 9.5h6",
  text: "M3 4h10M8 4v9M6 13h4",
  clock: "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5v3.2l2 1.3",
  // widgets
  score: "M5 2.5h6v3a3 3 0 0 1-6 0zM5 4H3v1a2 2 0 0 0 2 2M11 4h2v1a2 2 0 0 1-2 2M8 8.5v2.5M5.5 13.5h5",
  combo: "M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.5.5M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.5-.5",
  accuracy: "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  rank: "M8 9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 9l-1 4.5L8 12l3.5 1.5-1-4.5",
  ur: "M1.5 8h3l2-5 3 10 2-5h3",
  pp: "M9 2L3.5 9H8l-1 5L12.5 7H8z",
  health: "M8 13.5S2.5 10 2.5 6a2.8 2.8 0 0 1 5.5-.8A2.8 2.8 0 0 1 13.5 6c0 4-5.5 7.5-5.5 7.5z",
  progress: "M2.5 6.5h11v3h-11zM2.5 6.5h5v3h-5z",
  beatmap: "M6 12.5V4l6-1.5v8.5M6 12.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0zM12 11a1.8 1.8 0 1 1-3.6 0A1.8 1.8 0 0 1 12 11z",
  mods: "M3 5h6M11 5h2M3 11h2M7 11h6M9 3.5v3M5 9.5v3",
  hits: "M4 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M8 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M12 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  errors: "M3 5v6M6 3.5v9M8 2.5v11M10 4.5v7M13 6v4",
  user: "M8 7.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5zM2.75 13.5a5.25 5.25 0 0 1 10.5 0",
  flag: "M4 14V2.5M4 3h8l-1.5 2.75L12 8.5H4",
  globe: "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11",
  web: "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11",
} as const;

export type IconName = keyof typeof PATHS;

/** Icons drawn as a filled shape rather than an outline. */
const FILLED: ReadonlySet<IconName> = new Set(["star"]);

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

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
 * Plays the icon's gesture (see `iconGestures.ts`) when the pointer or the keyboard focus reaches the
 * control it sits in. Skipped for a disabled control, with "reduce motion", and while a gesture is
 * still running (no restarting from the middle).
 */
function useIconGesture(name: IconName) {
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  useEffect(() => {
    const icon = svg.current;
    const host = icon?.closest<HTMLElement>(HOSTS);
    if (!icon || !host || !GESTURES[name]) return;
    preloadMotion();
    let playing = false;
    const play = () => {
      if (playing || !path.current) return;
      if (host.matches(':disabled, [aria-disabled="true"]') || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      playing = true;
      void import("./iconMotion")
        .then(({ playGesture }) => path.current && playGesture(name, icon, path.current))
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
  return { svg, path };
}

export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  const filled = FILLED.has(name);
  const { svg, path } = useIconGesture(name);
  return (
    <svg
      ref={svg}
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
      {...rest}
    >
      <path ref={path} d={PATHS[name]} />
    </svg>
  );
}
