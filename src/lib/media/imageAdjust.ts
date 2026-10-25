/**
 * The "picture editor" of the image widget: tone and colour adjustments applied as a live filter, never to the
 * file. A filter (not a canvas redraw) keeps GIF and animated WebP moving, and the picture imported stays as it was.
 *
 * Every adjustment is a number from -100 to 100 (hue: -180 to 180 degrees), `0` meaning "untouched".
 */

export const ADJUSTMENTS = ["exposure", "contrast", "saturation", "hue", "temperature", "shadows", "highlights"] as const;
export type Adjustment = (typeof ADJUSTMENTS)[number];
export type Adjustments = Record<Adjustment, number>;

export const NO_ADJUSTMENTS: Adjustments = { exposure: 0, contrast: 0, saturation: 0, hue: 0, temperature: 0, shadows: 0, highlights: 0 };

/** The range of each adjustment, for the editor's number fields. */
export const ADJUSTMENT_RANGE: Record<Adjustment, { min: number; max: number }> = {
  exposure: { min: -100, max: 100 },
  contrast: { min: -100, max: 100 },
  saturation: { min: -100, max: 100 },
  hue: { min: -180, max: 180 },
  temperature: { min: -100, max: 100 },
  shadows: { min: -100, max: 100 },
  highlights: { min: -100, max: 100 },
};

/** The adjustments saved in a widget's options, each clamped to its range (anything but a number is `0`). */
export function readAdjustments(options: Record<string, unknown>): Adjustments {
  const out = { ...NO_ADJUSTMENTS };
  for (const key of ADJUSTMENTS) {
    const v = options[key];
    const { min, max } = ADJUSTMENT_RANGE[key];
    out[key] = typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0;
  }
  return out;
}

export const isUntouched = (a: Adjustments): boolean => ADJUSTMENTS.every((k) => a[k] === 0);

/** Points of the tone curve (input 0..1 evenly spaced); more points than the 3 of a gamma so the bend stays local. */
const CURVE_POINTS = 9;
/** How far, at most, shadows or highlights move a tone (fraction of the full range). */
const CURVE_REACH = 0.25;

/**
 * The tone curve of the shadows and highlights sliders as `feFuncX` table values: shadows lift (or sink) the dark
 * half, highlights the bright half, and black and white themselves stay where they are.
 */
export function toneTable(shadows: number, highlights: number): number[] {
  const s = shadows / 100;
  const h = highlights / 100;
  const table: number[] = [];
  for (let i = 0; i < CURVE_POINTS; i++) {
    const x = i / (CURVE_POINTS - 1);
    const bell = Math.sin(Math.PI * x);
    const y = x + CURVE_REACH * bell * (s * (1 - x) + h * x) * 1.5;
    table.push(Math.min(1, Math.max(0, y)));
  }
  return table;
}

/** Per-channel gain of the temperature slider: warm (positive) pushes red up and blue down, cool does the opposite. */
export function temperatureGain(temperature: number): { r: number; g: number; b: number } {
  const t = temperature / 100;
  return { r: 1 + 0.2 * t, g: 1 + 0.02 * t, b: 1 - 0.2 * t };
}

/** The CSS filter functions for the adjustments that CSS already has. */
export function cssFilter(a: Adjustments): string {
  const parts: string[] = [];
  if (a.exposure !== 0) parts.push(`brightness(${(2 ** (a.exposure / 100)).toFixed(3)})`);
  if (a.contrast !== 0) parts.push(`contrast(${(1 + a.contrast / 100).toFixed(3)})`);
  if (a.saturation !== 0) parts.push(`saturate(${(1 + a.saturation / 100).toFixed(3)})`);
  if (a.hue !== 0) parts.push(`hue-rotate(${a.hue}deg)`);
  return parts.join(" ");
}

/** Whether the adjustments need the SVG filter (temperature and tone curve), on top of `cssFilter`. */
export const needsSvgFilter = (a: Adjustments): boolean => a.temperature !== 0 || a.shadows !== 0 || a.highlights !== 0;
