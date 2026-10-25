import { useState } from "react";

/**
 * A texture behind the top of a page: dark, blurred, faded out toward the bottom, and decorative only (hidden
 * from assistive tech, no pointer events). The image is lazy, decoded off the main thread, and fades in once
 * loaded, so it never delays the page. Used on the main window only, never in the in-game overlay.
 */
export function Backdrop({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`size-full scale-110 object-cover blur-2xl saturate-125 transition-opacity duration-500 ease-out motion-reduce:transition-none ${loaded ? "opacity-[0.16]" : "opacity-0"}`}
      />
    </div>
  );
}
