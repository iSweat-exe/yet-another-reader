import { useT } from "../../i18n";
import { useReaderStore } from "../../lib/state/store";
import { downloadPercent } from "../../lib/system/updates";
import { Icon } from "../icons/Icon";

/**
 * In the header, while an update is waiting (or being installed): a quiet button that leads to the
 * Updates group of the Settings, where the notes and the install button are. It never installs by itself.
 */
export function UpdateChip({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const update = useReaderStore((s) => s.update);
  if (update.phase !== "available" && update.phase !== "downloading" && update.phase !== "installing") return null;

  const percent = downloadPercent(update);
  const label = update.phase === "available" ? t("update.chip", { version: update.version }) : update.phase === "installing" ? t("update.installing") : percent === null ? t("update.downloadingUnknown") : t("update.downloading", { percent });
  return (
    <button
      type="button"
      onClick={onOpen}
      title={t("update.chipHint")}
      className="ml-auto flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-accent outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-accent/12 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]"
    >
      <Icon name="download" size={14} />
      <span className="tabular-nums">{label}</span>
    </button>
  );
}
