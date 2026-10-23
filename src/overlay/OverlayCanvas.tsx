import { memo, useEffect, useState } from "react";
import { useReaderStore } from "../lib/store";
import { widgetDefinition } from "../widgets/registry";
import { WebWidget } from "./WebWidget";
import { type Layout, type WidgetInstance, alignFromAnchor, resolveRect } from "./layout";
import { pageOf } from "./pages";
import { usePresence } from "../widgets/shared";

function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

interface PlacedProps {
  instance: WidgetInstance;
  viewWidth: number;
  viewHeight: number;
  /** The editor decides which widgets to draw itself (the page being edited). */
  ignoreVisibility?: boolean;
}

const PlacedWidget = memo(function PlacedWidget({ instance, viewWidth, viewHeight, ignoreVisibility }: PlacedProps) {
  const visible = useReaderStore((s) => {
    if (ignoreVisibility) return true;
    const page = pageOf(s.game);
    return page !== null && instance.pages.includes(page);
  });
  // Page switches fade the widget instead of cutting it (the editor always shows everything).
  const { mounted, shown } = usePresence(visible);
  if (!mounted) return null;

  const definition = instance.type === "web" ? undefined : widgetDefinition(instance.type);
  if (instance.type !== "web" && !definition) return null;

  const rect = resolveRect(instance, viewWidth, viewHeight);
  const style = instance.style;
  return (
    <div
      className="absolute"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        color: style?.color ?? "#ffffff",
        opacity: shown ? (style?.opacity ?? 1) : 0,
        transition: ignoreVisibility ? undefined : "opacity 150ms ease-out",
        textAlign: style?.align ?? alignFromAnchor(instance.anchor),
        // Keeps text legible over any game background.
        textShadow: "0 0 2px rgb(0 0 0 / 0.5), 0 1px 3px rgb(0 0 0 / 0.85)",
      }}
    >
      {definition ? <definition.Component instance={instance} /> : <WebWidget instance={instance} />}
    </div>
  );
});

interface SceneProps {
  layout: Layout;
  /** Width of the screen in layout pixels (its height is `layout.referenceHeight`). */
  viewWidth: number;
  ignoreVisibility?: boolean;
}

/** The widgets of a layout in layout pixels, unscaled. Shared by the overlay and the editor. */
export function LayoutScene({ layout, viewWidth, ignoreVisibility }: SceneProps) {
  return (
    <div className="relative" style={{ width: viewWidth, height: layout.referenceHeight }}>
      {layout.widgets.map((widget) => (
        <PlacedWidget key={widget.id} instance={widget} viewWidth={viewWidth} viewHeight={layout.referenceHeight} ignoreVisibility={ignoreVisibility} />
      ))}
    </div>
  );
}

/**
 * Draws a layout scaled by height: the screen is `referenceHeight` layout pixels tall and as wide
 * as the window's aspect ratio requires, so anchored widgets stay on their edges on any screen.
 */
export function OverlayCanvas({ layout }: { layout: Layout }) {
  const { w, h } = useWindowSize();
  const scale = h / layout.referenceHeight;
  return (
    <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
      <LayoutScene layout={layout} viewWidth={w / scale} />
    </div>
  );
}
