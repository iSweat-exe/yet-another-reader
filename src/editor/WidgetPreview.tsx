import { useMemo } from "react";
import { LayoutScene } from "../overlay/OverlayCanvas";
import type { Layout } from "../overlay/layout";
import { backgroundStyle } from "./backgrounds";
import type { WidgetSpec } from "./addables";
import { useEditor } from "./useEditor";

const BOX = { w: 300, h: 168 };
/** A widget is never drawn larger than this, so a tiny one (a progress line) is not blown up into a blur. */
const MAX_SCALE = 1.6;

/**
 * A widget as it will look, alone on the editor's background, at its default size and scaled to fit the box.
 * It is the real widget fed by the same data as the editor's preview, not a picture of it.
 */
export function WidgetPreview({ spec }: { spec: WidgetSpec }) {
  const background = useEditor((s) => s.background);
  const { w, h } = spec.size;
  const scale = Math.min(BOX.w / w, BOX.h / h, MAX_SCALE) * 0.92;
  const layout = useMemo<Layout>(
    () => ({
      version: 2,
      name: "preview",
      referenceHeight: h,
      widgets: [
        {
          id: "preview",
          type: spec.type,
          widget: spec.widget,
          options: spec.options,
          anchor: "top-left",
          x: 0,
          y: 0,
          w,
          h,
          pages: [],
          style: spec.type === "web" ? undefined : { color: "#ffffff" },
        },
      ],
    }),
    [spec, w, h],
  );
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-lg shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.12)]" style={{ width: BOX.w, height: BOX.h, ...backgroundStyle(background) }} aria-hidden>
      <div className="pointer-events-none shrink-0" style={{ width: w * scale, height: h * scale }}>
        <div className="origin-top-left" style={{ transform: `scale(${scale})`, width: w, height: h }}>
          <LayoutScene layout={layout} viewWidth={w} ignoreVisibility />
        </div>
      </div>
    </div>
  );
}
