import { useId, useState } from "react";
import { useT } from "../../i18n";
import { ADJUSTMENTS, ADJUSTMENT_RANGE, type Adjustments, cssFilter, needsSvgFilter, readAdjustments, temperatureGain, toneTable } from "../../lib/media/imageAdjust";
import { imageIdOf, imageSrc } from "../../lib/media/images";
import { useReaderStore } from "../../lib/state/store";
import { type BuiltinOption, type WidgetDefinition, type WidgetProps } from "../types";
import { optionValues } from "../web";

export type ImageFit = "cover" | "contain" | "fill";

export const IMAGE_OPTIONS: BuiltinOption[] = [
  { key: "image", type: "image", labelKey: "widget.opt.image", default: "" },
  {
    key: "fit",
    type: "select",
    labelKey: "widget.opt.fit",
    default: "cover",
    choices: [{ value: "cover" }, { value: "contain" }, { value: "fill" }],
  },
  { key: "radius", type: "number", labelKey: "widget.opt.radius", default: 0, min: 0, max: 400 },
  { key: "borderWidth", type: "number", labelKey: "widget.opt.borderWidth", default: 0, min: 0, max: 40 },
  { key: "borderColor", type: "color", labelKey: "widget.opt.borderColor", default: "#ffffff" },
  // The picture editor: a live filter, the imported file is never changed.
  ...ADJUSTMENTS.map((key): BuiltinOption => ({ key, type: "number", labelKey: `widget.opt.${key}`, default: 0, ...ADJUSTMENT_RANGE[key] })),
];

const num = (value: unknown, fallback: number, min: number, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

/** The widget's settings, each one brought back into its range so a hand-edited layout cannot break the drawing. */
export function imageSettings(saved: Record<string, unknown> | undefined) {
  const o = optionValues({ options: IMAGE_OPTIONS }, saved);
  const fit: ImageFit = o.fit === "contain" || o.fit === "fill" ? o.fit : "cover";
  return {
    id: imageIdOf(o.image),
    fit,
    radius: num(o.radius, 0, 0, 400),
    borderWidth: num(o.borderWidth, 0, 0, 40),
    borderColor: typeof o.borderColor === "string" ? o.borderColor : "#ffffff",
    adjust: readAdjustments(o),
  };
}

/**
 * The SVG filter for temperature and the tone curve. Declared inline, next to the picture; the colour space is
 * sRGB so the sliders act on the values the eye sees, not on linear light.
 */
function ToneFilter({ id, adjust }: { id: string; adjust: Adjustments }) {
  const gain = temperatureGain(adjust.temperature);
  const table = toneTable(adjust.shadows, adjust.highlights).join(" ");
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`${gain.r} 0 0 0 0  0 ${gain.g} 0 0 0  0 0 ${gain.b} 0 0  0 0 0 1 0`} />
        <feComponentTransfer>
          <feFuncR type="table" tableValues={table} />
          <feFuncG type="table" tableValues={table} />
          <feFuncB type="table" tableValues={table} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

/**
 * A picture the user imported. It is decoded asynchronously and drawn as is (no filter, no animation); its
 * opacity is the widget's own `style.opacity`. A picture that is missing (deleted, API off, nothing chosen yet)
 * leaves a quiet placeholder so the box stays findable.
 */
function ImageWidget({ instance }: WidgetProps) {
  const t = useT();
  const filterId = `yar-tone-${useId().replace(/\W/g, "")}`;
  const s = imageSettings(instance.options);
  const api = useReaderStore((st) => st.api);
  const src = imageSrc(s.id, api);
  const [failed, setFailed] = useState<string | null>(null);
  const shape = { borderRadius: s.radius, border: s.borderWidth > 0 ? `${s.borderWidth}px solid ${s.borderColor}` : undefined };

  if (!src || failed === src) {
    return (
      <div
        role="img"
        aria-label={t("images.missing")}
        title={t("images.missing")}
        className="size-full"
        style={{ ...shape, background: "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.1) 0 8px, rgb(255 255 255 / 0.04) 8px 16px)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.18)" }}
      />
    );
  }
  const filter = [needsSvgFilter(s.adjust) ? `url(#${filterId})` : "", cssFilter(s.adjust)].filter(Boolean).join(" ");
  return (
    <div className="size-full overflow-hidden" style={shape}>
      {needsSvgFilter(s.adjust) && <ToneFilter id={filterId} adjust={s.adjust} />}
      {/* A GIF or an animated WebP keeps playing: the browser animates the picture and the filter follows each frame. */}
      <img src={src} alt="" decoding="async" draggable={false} onError={() => setFailed(src)} className="size-full" style={{ objectFit: s.fit, filter: filter || undefined }} />
    </div>
  );
}

export const IMAGE_WIDGETS: WidgetDefinition[] = [{ type: "image", labelKey: "widget.image", defaultSize: { w: 320, h: 320 }, Component: ImageWidget, options: IMAGE_OPTIONS }];
