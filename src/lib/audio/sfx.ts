import { useSyncExternalStore } from "react";

/**
 * Interface sound effects (the osu!lazer UI samples in `public/Samples/UI/`), played with the Web Audio API.
 *
 * - One `AudioContext` for the whole window, created on the first user gesture (autoplay policy): nothing
 *   plays before it.
 * - Samples are fetched and decoded the first time they are needed, then kept as `AudioBuffer`s.
 * - Polyphony is capped, a sound cannot retrigger itself within a few milliseconds, and hover sounds are
 *   the first to be dropped under load (see `Gate`).
 * - Never used by the in-game overlay: `playSfx` does nothing in the `#overlay` window.
 *
 * The choice of the user (on/off, volume) lives in `localStorage`: it is a preference of this window, not a
 * setting of the reader.
 */
export const SFX_NAMES = [
  "bss-complete",
  "bss-progress",
  "bss-stage-0",
  "bss-stage-1",
  "bss-stage-2",
  "bss-stage-3",
  "button-hover",
  "button-select",
  "button-sidebar-hover",
  "button-sidebar-select",
  "check-off",
  "check-on",
  "cursor-tap",
  "default-hover",
  "default-select",
  "default-select-disabled",
  "dialog-cancel-select",
  "dialog-dangerous-select",
  "dialog-dangerous-tick",
  "dialog-ok-select",
  "dialog-pop-in",
  "dialog-pop-out",
  "dropdown-close",
  "dropdown-open",
  "generic-error",
  "item-swap",
  "menu-close",
  "menu-open",
  "menu-open-select",
  "menu-sub-open",
  "metronome-latch",
  "metronome-tick",
  "metronome-tick-downbeat",
  "noclick-hover",
  "noclick-select",
  "notch-tick",
  "notification-cancel",
  "notification-default",
  "notification-done",
  "notification-error",
  "notification-friend-offline",
  "notification-friend-online",
  "notification-mention",
  "osd-change",
  "osd-off",
  "osd-on",
  "overlay-big-pop-in",
  "overlay-big-pop-out",
  "overlay-pop-in",
  "overlay-pop-out",
  "ruleset-select-fruits",
  "ruleset-select-mania",
  "ruleset-select-osu",
  "ruleset-select-taiko",
  "screen-back",
  "scroll-to-previous",
  "scroll-to-top",
  "settings-pop-in",
  "shutter",
  "submit-select",
  "tabselect-select",
  "toolbar-hover",
  "toolbar-select",
  "wave-pop-in",
  "wave-pop-out",
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

const BASE_URL = "/Samples/UI/";
const STORAGE_KEY = "yar.sfx";

/** Sounds that may be dropped when many play at once (they only decorate). */
const LOW_PRIORITY: ReadonlySet<SfxName> = new Set<SfxName>(["default-hover", "button-hover", "button-sidebar-hover", "toolbar-hover", "noclick-hover", "notch-tick"]);
/** Samples fetched once the first gesture happened, so the first clicks do not wait for the disk. */
const WARM: readonly SfxName[] = ["default-hover", "button-select", "default-select", "tabselect-select", "check-on", "check-off", "dialog-pop-in", "dialog-pop-out", "dropdown-open", "dropdown-close"];

/**
 * osu!lazer's `HoverSampleSet`: the name that prefixes a control's `-hover` and `-select` samples
 * (`osu.Game/Graphics/UserInterface/HoverSampleSet.cs`).
 */
export type HoverSampleSet = "default" | "button" | "button-sidebar" | "tabselect" | "dialog-cancel" | "dialog-ok" | "menu-open";

const exists = (name: string): name is SfxName => (SFX_NAMES as readonly string[]).includes(name);

/**
 * `HoverSounds` / `HoverClickSounds`: `UI/<set>-hover`, or the default set's when the set has none
 * (`tabselect`, `dialog-ok`, `dialog-cancel` and `menu-open` have no hover sample of their own).
 */
export function hoverSample(set: HoverSampleSet): SfxName {
  const name = `${set}-hover`;
  return exists(name) ? name : "default-hover";
}

/** `HoverClickSounds.PlayClickSample`: `UI/<set>-select`, or `-select-disabled` while disabled, each falling back to the default set's. */
export function selectSample(set: HoverSampleSet, enabled = true): SfxName {
  const name = `${set}-select${enabled ? "" : "-disabled"}`;
  return exists(name) ? name : enabled ? "default-select" : "default-select-disabled";
}

export const MAX_VOICES = 8;
/** osu!lazer's `SAMPLE_DEBOUNCE_TIME`: the same sample never restarts within 20 ms. */
const SAME_SOUND_GAP_MS = 20;
/** A sound that was still being fetched is not worth playing once it is this late. */
const MAX_LATE_MS = 250;

export interface SfxPrefs {
  enabled: boolean;
  /** 0 to 1. */
  volume: number;
}

export const DEFAULT_PREFS: SfxPrefs = { enabled: true, volume: 0.5 };

/** Turns whatever was stored into valid preferences. */
export function sanitizePrefs(raw: unknown): SfxPrefs {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const volume = typeof value.volume === "number" && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : DEFAULT_PREFS.volume;
  return { enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_PREFS.enabled, volume };
}

/** The slider is linear in what you hear, not in amplitude: a square keeps the low end usable. */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}

/**
 * Decides whether a sound may start, from the sounds already playing and when this one last played.
 * Pure, so it is tested without audio.
 */
export class Gate {
  private last = new Map<string, number>();
  allow(name: string, now: number, voices: number, lowPriority: boolean): boolean {
    const previous = this.last.get(name);
    if (previous !== undefined && now - previous < SAME_SOUND_GAP_MS) return false;
    if (lowPriority && voices >= MAX_VOICES / 2) return false;
    this.last.set(name, now);
    return true;
  }
}

// ---- preferences (an external store, so React can follow it) ----

function loadPrefs(): SfxPrefs {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? sanitizePrefs(JSON.parse(stored)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

let prefs: SfxPrefs = loadPrefs();
const listeners = new Set<() => void>();

export function getSfxPrefs(): SfxPrefs {
  return prefs;
}

export function setSfxPrefs(changes: Partial<SfxPrefs>): void {
  prefs = sanitizePrefs({ ...prefs, ...changes });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the choice holds until the window closes.
  }
  if (master && ctx) master.gain.setTargetAtTime(volumeToGain(prefs.volume), ctx.currentTime, 0.015);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The sound preferences, re-rendering when they change. */
export function useSfxPrefs(): SfxPrefs {
  return useSyncExternalStore(subscribe, getSfxPrefs, getSfxPrefs);
}

// ---- engine ----

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
const buffers = new Map<SfxName, AudioBuffer>();
const loading = new Map<SfxName, Promise<AudioBuffer | null>>();
const voices = new Set<AudioBufferSourceNode>();
const gate = new Gate();

const inOverlay = () => typeof location !== "undefined" && location.hash === "#overlay";

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: "interactive" });
  master = ctx.createGain();
  master.gain.value = volumeToGain(prefs.volume);
  master.connect(ctx.destination);
  return ctx;
}

function load(name: SfxName): Promise<AudioBuffer | null> {
  const cached = loading.get(name);
  if (cached) return cached;
  const audio = context();
  const request = !audio
    ? Promise.resolve(null)
    : fetch(`${BASE_URL}${name}.wav`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => audio.decodeAudioData(data))
        .then((buffer) => {
          buffers.set(name, buffer);
          return buffer;
        })
        .catch(() => null);
  loading.set(name, request);
  return request;
}

function start(buffer: AudioBuffer, volume: number, rate: number): void {
  if (!ctx || !master) return;
  if (voices.size >= MAX_VOICES) voices.values().next().value?.stop();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(master);
  voices.add(source);
  source.onended = () => {
    voices.delete(source);
    source.disconnect();
    gain.disconnect();
  };
  source.start();
}

export interface PlayOptions {
  /** Relative loudness, 0 to 1 (default 1). */
  volume?: number;
  /** Playback speed (default 1). */
  rate?: number;
  /** Random pitch variation around `rate`, like lazer's `PlayWithRandomPitch` (0.02 on hover, 0.01 on click). */
  pitch?: number;
}

/** Plays a sound now, if sounds are on, the window was used and the voice limit allows it. */
export function playSfx(name: SfxName, { volume = 1, rate: baseRate = 1, pitch = 0 }: PlayOptions = {}): void {
  const rate = pitch ? baseRate * (1 + (Math.random() * 2 - 1) * pitch) : baseRate;
  if (!prefs.enabled || prefs.volume === 0 || !unlocked || inOverlay() || document.hidden) return;
  const audio = context();
  if (!audio) return;
  const low = LOW_PRIORITY.has(name);
  const asked = performance.now();
  if (!gate.allow(name, asked, voices.size, low)) return;
  if (audio.state === "suspended") void audio.resume();
  const ready = buffers.get(name);
  if (ready) return start(ready, volume, rate);
  // Not decoded yet: fetch it, and play it if it arrives in time (a late hover would only be noise).
  void load(name).then((buffer) => {
    if (buffer && !low && performance.now() - asked < MAX_LATE_MS) start(buffer, volume, rate);
  });
}

/** Fetches and decodes samples ahead of their first use. */
export function preloadSfx(names: readonly SfxName[] = WARM): void {
  if (inOverlay() || !unlocked) return;
  names.forEach((name) => void load(name));
}

/**
 * Allows sound once the window has been used (browsers refuse to start audio before a gesture). Called by
 * the first trusted pointer or key event.
 */
export function unlockSfx(): void {
  if (unlocked || inOverlay()) return;
  unlocked = true;
  const audio = context();
  if (audio?.state === "suspended") void audio.resume();
  const warm = () => preloadSfx();
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(warm);
  else setTimeout(warm, 500);
}

export const sfx = { play: playSfx, preload: preloadSfx, unlock: unlockSfx };
