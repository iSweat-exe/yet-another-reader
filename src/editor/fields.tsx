import { type ReactNode, useEffect, useId, useState } from "react";
import { Icon, type IconName } from "../components/icons/Icon";
import { Select } from "../components/select/Select";

export const controlClass =
  "rounded-md bg-surface px-2 py-1 text-sm tabular-nums text-ink shadow-[0_0_0_1px_var(--ring-field)] outline-none transition-shadow duration-150 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] disabled:opacity-50";

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-wash/5 px-3 py-3 last:border-b-0">
      <header className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-ink-dim">{title}</h3>
        {aside}
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs text-ink-dim">
        {label}
      </label>
      <div id={id} className="flex items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  /** Short text shown inside the field, before the value (e.g. `X`). */
  prefix?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Number input that lets the user type freely (including empty / partial values) and only
 * commits valid numbers, instead of fighting the cursor like a controlled `type=number`.
 * ↑/↓ change the value (Shift = ×10).
 */
export function NumberInput({ value, onChange, min, max, step = 1, label, prefix, className = "w-16", disabled }: NumberInputProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return setText(String(value));
    const clamped = clamp(parsed);
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className={`relative ${className}`}>
      {prefix && <span aria-hidden className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[0.6875rem] font-medium text-ink-dim">{prefix}</span>}
      <input
        aria-label={label}
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") return commit(e.currentTarget.value);
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          e.stopPropagation();
          const delta = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
          commit(String(Math.round((value + delta) * 1000) / 1000));
        }}
        className={`${controlClass} min-h-8 w-full text-right ${prefix ? "pl-6" : ""}`}
      />
    </div>
  );
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  // `<input type=color>` only accepts #rrggbb.
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <div className="flex items-center gap-1.5">
      <input aria-label={label} type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0.5" />
      <input aria-label={`${label} (hex)`} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} className={`${controlClass} min-h-8 w-20 font-mono text-xs`} />
    </div>
  );
}

export function SelectInput<T extends string>({ value, onChange, options, label, className = "w-36" }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return <Select size="sm" align="end" label={label} value={value} onChange={onChange} options={options} className={className} />;
}

/** An on/off box: compact, and the ticked state reads without relying on colour alone. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative flex size-[18px] shrink-0 items-center justify-center rounded-sm outline-none transition-[background-color,box-shadow,scale] duration-150 active:scale-[0.92] before:absolute before:-inset-[11px] before:content-[''] focus-visible:shadow-[0_0_0_2px_var(--color-accent)] ${checked ? "bg-accent text-surface" : "bg-surface text-transparent shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.22)]"}`}
    >
      <Icon name="check" size={14} className={`transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none ${checked ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} />
    </button>
  );
}

const buttonBase =
  "relative inline-flex items-center justify-center rounded-md text-sm outline-none transition-[scale,background-color,color,box-shadow,opacity,filter] duration-150 before:absolute before:-inset-0.5 before:content-[''] focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35";

/** Icon-only button; its name is shown as a tooltip and read by screen readers. 40px hit area. */
export function IconButton({ icon, label, onClick, disabled, active, tone = "default" }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; active?: boolean; tone?: "default" | "danger" }) {
  const color = tone === "danger" ? "text-ink-dim hover:bg-red-500/15 hover:text-red-300" : active ? "bg-wash/10 text-ink" : "text-ink-dim hover:bg-wash/8 hover:text-ink";
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className={`${buttonBase} size-9 ${color}`}>
      <Icon name={icon} />
    </button>
  );
}

/** A labelled on/off button for view options (snapping, grid, ...). */
export function ToggleButton({ icon, label, pressed, onChange }: { icon: IconName; label: string; pressed: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={`${buttonBase} h-9 gap-1.5 px-2.5 text-xs ${pressed ? "bg-accent/18 text-accent" : "text-ink-dim hover:bg-wash/8 hover:text-ink"}`}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

/** A text button with an optional leading icon, for the toolbar's main actions. */
export function ActionButton({ icon, children, onClick, variant = "quiet", disabled }: { icon?: IconName; children: ReactNode; onClick: () => void; variant?: "quiet" | "primary"; disabled?: boolean }) {
  const look = variant === "primary" ? "bg-accent font-semibold text-surface hover:brightness-110" : "text-ink hover:bg-wash/8 shadow-[0_0_0_1px_var(--ring-field)]";
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${buttonBase} h-9 gap-1.5 px-3 text-xs ${look}`}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
