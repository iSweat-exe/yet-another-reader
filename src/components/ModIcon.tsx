import { useState } from "react";
import { modIconUrl } from "../lib/mods";

/** A mod's official icon (120×84 source). Falls back to the acronym when there is no icon. */
export function ModIcon({ mod, height = 28 }: { mod: string; height?: number }) {
  const [failed, setFailed] = useState(false);
  const src = modIconUrl(mod);
  if (!src || failed) {
    return (
      <span className="inline-flex flex-none items-center rounded-sm bg-white/15 px-1.5 font-bold" style={{ height, fontSize: height * 0.5 }}>
        {mod}
      </span>
    );
  }
  return <img src={src} alt={mod} title={mod} height={height} draggable={false} decoding="async" style={{ height, width: "auto", maxWidth: "none", flex: "none" }} onError={() => setFailed(true)} />;
}
