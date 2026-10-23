/**
 * The screenshots of the documentation: the pictures dropped in `docs/images/`.
 *
 * A page asks for `> [!SCREENSHOT] some-id`; the file `some-id.png` (or `.webp`, `.jpg`) stands for it in
 * every language, `some-id.en.png` / `some-id.fr.png` only for that language (the application shows
 * its own language, so a picture of it differs from one language to the other).
 */
const FILES: Record<string, string> = import.meta.glob("../../docs/images/*.{png,webp,jpg,jpeg}", { query: "?url", import: "default", eager: true }) as Record<string, string>;

/** `some-id.en.png` -> `some-id.en`, keyed by the file name without its extension. */
const BY_NAME = new Map(Object.entries(FILES).map(([path, url]) => [/([^/]+)\.[a-z]+$/.exec(path)?.[1] ?? path, url]));

/** The address of the picture for a screenshot id in a language, if its file exists. */
export const shotUrl = (id: string, lang: "fr" | "en"): string | undefined => BY_NAME.get(`${id}.${lang}`) ?? BY_NAME.get(id);
