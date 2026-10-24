import { type ReactNode, useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { Icon } from "./Icon";

const FIELD_RING = "shadow-[0_0_0_1px_var(--ring-field)] transition-shadow duration-150 ease-out focus-within:shadow-[0_0_0_2px_var(--color-accent)]";

/**
 * A titled group of rows, ruled by hairlines on the page itself (no surface of its own): grouping comes from
 * proximity and the rules, the same on the Status and Settings pages.
 */
export function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <header className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {aside}
      </header>
      <div className="divide-y divide-wash/8 border-y border-wash/8">{children}</div>
    </section>
  );
}

/** A setting: its name and hint on the left, the control on the right. */
export function Row({ id, label, hint, hintTone, disabled, appear, children }: { id?: string; label: string; hint?: string; /** Colour class of the hint (a status that says more than the usual dim text). */ hintTone?: string; disabled?: boolean; /** Fade in when mounted later (a row that only exists while a switch is on). */ appear?: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${appear ? "transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none" : ""}`}>
      <label htmlFor={id} className={`min-w-0 text-sm transition-opacity duration-150 ease-out ${disabled ? "opacity-50" : ""}`}>
        {label}
        {hint && <span className={`mt-0.5 block text-xs leading-snug ${hintTone ?? "text-ink-dim"}`}>{hint}</span>}
      </label>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** On/off switch. The track is 40×24; the hit area is extended to 56×40 without moving anything. */
export function Switch({ id, checked, onChange, disabled, sfx }: { id: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; /** `data-sfx` of the control (`none`: the caller plays the sound itself). */ sfx?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      data-sfx={sfx}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full outline-none transition-[background-color,box-shadow,opacity] duration-150 ease-out before:absolute before:-inset-x-2 before:-inset-y-2 focus-visible:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-accent)] disabled:opacity-40 ${checked ? "bg-accent" : "bg-wash/16"}`}
    >
      <span className={`size-[18px] rounded-full bg-white shadow-[0_1px_2px_oklch(0_0_0/0.35)] transition-transform duration-150 ease-out motion-reduce:transition-none ${checked ? "translate-x-[19px]" : "translate-x-[3px]"}`} />
    </button>
  );
}

interface NumberFieldProps {
  id?: string;
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
  width?: string;
}

/**
 * A number with its unit inside the field, so "33 ms" reads as one value.
 *
 * The text can be typed freely (empty, partial); a valid number is committed as it is typed,
 * clamped to `min`/`max`, and a value that cannot be used snaps back to the last good one on blur.
 * ↑/↓ change the value (Shift = ×10).
 */
export function NumberField({ id, label, value, onChange, min, max, unit, disabled, width = "w-16" }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return setText(String(value));
    const clamped = Math.round(clamp(parsed));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className={`flex min-h-10 items-center rounded-lg bg-surface pr-3 transition-opacity duration-150 ${FIELD_RING} ${disabled ? "opacity-50" : ""}`}>
      <input
        id={id}
        aria-label={label}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = Number(e.target.value);
          // Mid-typing ("5" on the way to "50") is not clamped yet: only a value already in range is committed.
          if (e.target.value.trim() !== "" && Number.isFinite(parsed) && parsed === clamp(parsed)) onChange(Math.round(parsed));
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") return commit(e.currentTarget.value);
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          commit(String(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)));
        }}
        className={`${width} min-w-0 bg-transparent py-1.5 pr-1 pl-3 text-right text-sm tabular-nums outline-none`}
      />
      {unit && <span className="text-sm text-ink-dim">{unit}</span>}
    </div>
  );
}

/** A range input whose filled part follows the thumb (see `.range` in `index.css`). */
export function Slider({ label, value, min, max, onChange, sfx }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; /** `data-sfx` of the input (`none`: the caller plays the sound itself). */ sfx?: string }) {
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  // A range that crosses zero fills from zero (the neutral value), not from the left edge.
  const origin = min < 0 && max > 0 ? pct(0) : 0;
  const here = pct(value);
  const style = { "--fill": `${Math.max(origin, here)}%`, "--lo": `${Math.min(origin, here)}%` } as React.CSSProperties;
  return <input type="range" aria-label={label} min={min} max={max} step={1} value={value} data-sfx={sfx} onChange={(e) => onChange(Number(e.target.value))} className="range" style={style} />;
}

/** Icon-only copy button: the copy icon turns into a check (scale, opacity and blur), then goes back. */
export function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // Clipboard unavailable: the URL stays selectable.
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  const swap = "absolute transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";
  const hidden = "opacity-0 scale-[0.25] blur-[4px]";
  const shown = "opacity-100 scale-100 blur-0";
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={t("common.copy")}
      title={t("common.copy")}
      className={`relative grid size-10 shrink-0 place-items-center rounded-lg outline-none transition-[color,background-color,scale] duration-150 ease-out hover:bg-wash/6 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] ${copied ? "text-emerald-400" : "text-ink-dim hover:text-ink"}`}
    >
      <Icon name="copy" className={`${swap} ${copied ? hidden : shown}`} />
      <Icon name="check" className={`${swap} ${copied ? shown : hidden}`} />
      <span className="sr-only" aria-live="polite">
        {copied ? t("common.copied") : ""}
      </span>
    </button>
  );
}
