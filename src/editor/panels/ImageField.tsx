import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/icons/Icon";
import { useT } from "../../i18n";
import { IMAGE_ACCEPT, type ImageInfo, deleteImage, imageSrc, importImage, isImageId, listImages } from "../../lib/media/images";
import { isTauri } from "../../lib/state/mock";
import { useReaderStore } from "../../lib/state/store";
import { ActionButton } from "../fields";

/** The picker of the `image` widget: the imported pictures as thumbnails, and the button that imports another. */
export function ImageField({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const t = useT();
  const api = useReaderStore((s) => s.api);
  const fileInput = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => void listImages().then((all) => setImages(all.filter((i) => isImageId(i.id)))).catch(() => setImages([])), []);
  useEffect(refresh, [refresh]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await importImage(file);
    setBusy(false);
    if (!result.ok) return setError(t(result.error, { detail: result.detail ?? "" }));
    refresh();
    onChange(result.id);
  };

  const remove = async (id: string) => {
    await deleteImage(id).catch(() => undefined);
    refresh();
  };

  const missing = value !== null && images.length > 0 && !images.some((i) => i.id === value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-dim">{t("images.library")}</span>
        <ActionButton icon="upload" onClick={() => fileInput.current?.click()} disabled={busy}>
          {t("images.import")}
        </ActionButton>
        <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden aria-label={t("images.import")} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <p className="text-[0.6875rem] leading-snug text-ink-dim">{t("images.hint")}</p>
      {error && (
        <p role="alert" className="text-xs text-amber-400">
          {error}
        </p>
      )}
      {isTauri && api && !api.running && <p className="text-xs text-amber-400">{t("images.apiOff")}</p>}
      {missing && <p className="text-xs text-amber-400">{t("images.missing")}</p>}
      {images.length === 0 ? (
        <p className="py-2 text-xs text-ink-dim">{t("images.empty")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5">
          {images.map((image, index) => {
            const src = imageSrc(image.id, api);
            const selected = image.id === value;
            return (
              <li key={image.id} className="group relative">
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={t("images.use", { n: index + 1 })}
                  onClick={() => onChange(image.id)}
                  className={`block aspect-square w-full overflow-hidden rounded-md bg-surface outline-none transition-[box-shadow,scale] duration-150 active:scale-[0.96] focus-visible:shadow-[0_0_0_2px_var(--color-accent)] ${selected ? "shadow-[0_0_0_2px_var(--color-accent)]" : "shadow-[0_0_0_1px_var(--ring-field)] hover:shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.4)]"}`}
                >
                  {src && <img src={src} alt="" decoding="async" loading="lazy" draggable={false} className="size-full object-contain" />}
                </button>
                <button
                  type="button"
                  title={t("images.delete")}
                  aria-label={t("images.delete")}
                  onClick={() => void remove(image.id)}
                  className="absolute top-0.5 right-0.5 flex size-6 items-center justify-center rounded-md bg-black/60 text-ink-dim opacity-0 outline-none transition-[opacity,background-color,color,scale] duration-150 group-hover:opacity-100 hover:bg-red-500/70 hover:text-white focus-visible:opacity-100 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.92] [@media(hover:none)]:opacity-100"
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
