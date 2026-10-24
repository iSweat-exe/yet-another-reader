import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";

export interface ViewedImage {
  src: string;
  alt: string;
  /** Where the thumbnail was on screen: the picture grows from there. */
  from?: DOMRect;
}

const EXIT_MS = 120;
/** Travel (px) before a press on the picture is a drag to look around rather than a click to zoom. */
const DRAG_PX = 4;

/**
 * A picture of the documentation shown large over the page. Clicking it switches between "fit the
 * window" and its real size; at real size it can be grabbed and moved (or scrolled). Esc, the close
 * button or a click outside close it, through a short fade.
 */
export function ImageViewer({ image, onClose }: { image: ViewedImage; onClose: () => void }) {
  const t = useT();
  const [actualSize, setActualSize] = useState(false);
  const [closing, setClosing] = useState(false);
  const [panning, setPanning] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  const leave = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Focus goes into the dialog and comes back to the picture that opened it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => opener?.focus();
  }, []);

  // The picture grows from its thumbnail to its place (transform only, once, in "fit" mode).
  useEffect(() => {
    const img = picture.current;
    const box = scroller.current;
    const from = image.from;
    if (!img || !box || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let animation: Animation | undefined;
    const grow = () => {
      const to = img.getBoundingClientRect();
      if (!to.width || !from.width) return;
      const scale = from.width / to.width;
      box.style.overflow = "hidden";
      animation = img.animate(
        [{ transformOrigin: "0 0", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})` }, { transformOrigin: "0 0", transform: "none" }],
        { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
      animation.onfinish = animation.oncancel = () => {
        box.style.overflow = "";
      };
    };
    if (img.complete && img.naturalWidth) grow();
    else img.addEventListener("load", grow, { once: true });
    return () => {
      img.removeEventListener("load", grow);
      animation?.cancel();
    };
  }, [image]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        leave();
      } else if (e.key === "Tab") {
        // The close button is the only control: keep the focus on it.
        e.preventDefault();
        close.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [leave]);

  const onPointerDown = (e: PointerEvent<HTMLImageElement>) => {
    const box = scroller.current;
    if (e.button !== 0 || !box || !actualSize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false };
  };

  // The picture stays under the pointer: 1:1, from wherever it was grabbed.
  const onPointerMove = (e: PointerEvent<HTMLImageElement>) => {
    const start = pan.current;
    const box = scroller.current;
    if (!start || !box) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!start.moved) setPanning(true);
    start.moved = true;
    box.scrollLeft = start.left - dx;
    box.scrollTop = start.top - dy;
  };

  const onPointerEnd = () => {
    setPanning(false);
    // `click` fires right after this; `moved` tells it the press was a drag, not a zoom toggle.
    window.setTimeout(() => (pan.current = null), 0);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={image.alt} data-closing={closing} className="viewer fixed inset-0 z-50 flex flex-col bg-black/85" onClick={leave}>
      <div className="flex min-h-12 items-center justify-between gap-4 px-4">
        <p className="min-w-0 truncate text-sm text-ink-dim">{image.alt}</p>
        <button
          ref={close}
          type="button"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={leave}
          className="grid size-10 shrink-0 place-items-center rounded-lg text-ink outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-wash/10 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <div ref={scroller} className={`flex min-h-0 flex-1 overflow-auto p-4 pt-0 ${actualSize ? "" : "items-center justify-center"}`}>
        <img
          ref={picture}
          src={image.src}
          alt={image.alt}
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClick={(e) => {
            e.stopPropagation();
            if (pan.current?.moved) return;
            setActualSize(!actualSize);
          }}
          className={`m-auto touch-none rounded-lg shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.1),0_20px_60px_oklch(0_0_0/0.6)] ${actualSize ? `max-w-none ${panning ? "cursor-grabbing" : "cursor-grab"}` : "max-h-full max-w-full cursor-zoom-in object-contain"}`}
        />
      </div>
    </div>
  );
}
