import { memo } from "react";

const RANGE_MS = 60;

/** Timing errors in ms; the centre line is a perfect hit, bars to the right are late. */
type Props = { errors: number[]; className?: string; label?: string };

/** The game state is replaced on every emission: compare the values so an unchanged list does not repaint. */
function sameProps(a: Props, b: Props): boolean {
  if (a.className !== b.className || a.label !== b.label || a.errors.length !== b.errors.length) return false;
  return a.errors.every((e, i) => e === b.errors[i]);
}

export const HitErrorStrip = memo(function HitErrorStrip({ errors, className = "h-6 w-full", label }: Props) {
  return (
    // The shadow keeps the lines readable over a bright game background (SVG ignores text-shadow).
    <svg viewBox="0 0 200 24" preserveAspectRatio="none" className={className} role="img" aria-label={label} style={{ filter: "drop-shadow(0 0 1px rgb(0 0 0 / 0.7))" }}>
      <line x1="100" x2="100" y1="0" y2="24" stroke="currentColor" strokeOpacity="0.5" />
      {errors.map((e, i) => {
        const x = 100 + (Math.max(-RANGE_MS, Math.min(RANGE_MS, e)) / RANGE_MS) * 100;
        return <line key={i} x1={x} x2={x} y1="4" y2="20" stroke="currentColor" strokeOpacity={0.25 + (0.75 * i) / errors.length} />;
      })}
    </svg>
  );
}, sameProps);
