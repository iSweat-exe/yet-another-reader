import { useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Select } from "../components/Select";
import { type MessageKey, useT } from "../i18n";
import { useReaderStore } from "../lib/store";
import { ConfirmDialog, ExportDialog, ImportDialog, NameDialog } from "./dialogs";
import { Switch } from "../components/controls";
import { HistoryDialog } from "./HistoryDialog";
import { ActionButton, IconButton, NumberInput, SelectInput, ToggleButton } from "./fields";
import type { AlignMode } from "./geometry";
import { type Aspect, ASPECTS, GRID_SIZE, isDirty, useEditor } from "./useEditor";
import { type BackgroundId, BACKGROUNDS, backgroundStyle } from "./backgrounds";

type DialogKind = "new" | "duplicate" | "rename" | "delete" | "import" | "export" | "history" | null;

const ALIGN: { mode: AlignMode; icon: IconName; key: "editor.alignLeft" | "editor.alignCenter" | "editor.alignRight" | "editor.alignTop" | "editor.alignMiddle" | "editor.alignBottom" }[] = [
  { mode: "left", icon: "align-left", key: "editor.alignLeft" },
  { mode: "center", icon: "align-center", key: "editor.alignCenter" },
  { mode: "right", icon: "align-right", key: "editor.alignRight" },
  { mode: "top", icon: "align-top", key: "editor.alignTop" },
  { mode: "middle", icon: "align-middle", key: "editor.alignMiddle" },
  { mode: "bottom", icon: "align-bottom", key: "editor.alignBottom" },
];

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-wash/10" />;
}

/** A named group of related controls (announced as one unit by screen readers). */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {children}
    </div>
  );
}

function SaveStatus() {
  const t = useT();
  const dirty = useEditor(isDirty);
  const saving = useEditor((s) => s.saving);
  const autosave = useEditor((s) => s.autosave);
  const save = useEditor((s) => s.save);

  const state = saving ? { icon: "spinner" as const, text: t("editor.saving"), tone: "text-ink-dim" } : dirty ? { icon: "pencil" as const, text: t("editor.unsaved"), tone: "text-amber-300" } : { icon: "check-circle" as const, text: t("editor.saved"), tone: "text-emerald-400" };
  return (
    <div className="ml-auto flex items-center gap-3">
      <span role="status" className={`flex items-center gap-1.5 text-xs transition-colors duration-200 ${state.tone}`}>
        <Icon name={state.icon} />
        {state.text}
      </span>
      {!autosave && (
        <ActionButton icon="save" disabled={!dirty || saving} onClick={() => void save()}>
          {t("editor.save")}
        </ActionButton>
      )}
    </div>
  );
}

export function Toolbar() {
  const t = useT();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const activeLayout = useReaderStore((s) => s.settings?.activeLayout ?? "default");

  const name = useEditor((s) => s.name);
  const layouts = useEditor((s) => s.layouts);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const selectionSize = useEditor((s) => s.selection.length);
  const hasGroupSelected = useEditor((s) => s.doc.widgets.some((w) => w.group && s.selection.includes(w.id)));
  // A group counts as one object: spreading needs three of them.
  const canDistribute = useEditor((s) => new Set(s.doc.widgets.filter((w) => s.selection.includes(w.id)).map((w) => w.group ?? w.id)).size >= 3);
  const autosave = useEditor((s) => s.autosave);
  const snap = useEditor((s) => s.snap);
  const showGrid = useEditor((s) => s.showGrid);
  const gridSize = useEditor((s) => s.gridSize);
  const background = useEditor((s) => s.background);
  const aspect = useEditor((s) => s.aspect);
  const dataSource = useEditor((s) => s.dataSource);
  const ed = useEditor.getState();

  const isActive = name === activeLayout;

  return (
    <div className="border-b border-wash/5 bg-surface-raised">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <Icon name="layers" className="text-ink-dim" />
        <Select size="sm" label={t("editor.layout")} value={name} options={layouts.map((l) => ({ value: l, label: l }))} onChange={(next) => void ed.openLayout(next)} className="w-44" />
        {/* Keyed so the badge and the button fade in (instead of snapping) when the layout becomes or stops being the active one. */}
        <span key={isActive ? "active" : "inactive"} className="inline-flex transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none">
          {isActive ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent/18 px-2.5 text-xs font-semibold text-accent">
              <Icon name="check" size={14} />
              {t("editor.activeBadge")}
            </span>
          ) : (
            <ActionButton variant="primary" icon="check" onClick={() => void ed.useAsActive()}>
              {t("editor.useInGame")}
            </ActionButton>
          )}
        </span>
        <Divider />
        <Group label={t("editor.layout")}>
          <IconButton icon="plus" label={t("editor.new")} onClick={() => setDialog("new")} />
          <IconButton icon="copy" label={t("editor.duplicate")} onClick={() => setDialog("duplicate")} />
          <IconButton icon="pencil" label={t("editor.rename")} onClick={() => setDialog("rename")} />
          <IconButton icon="download" label={t("editor.import")} onClick={() => setDialog("import")} />
          <IconButton icon="upload" label={t("editor.export")} onClick={() => setDialog("export")} />
        </Group>
        {/* Destructive, so apart from the everyday actions: no slip of the pointer from "export" lands on it. */}
        <span aria-hidden className="mx-3 h-5 w-px bg-wash/10" />
        <IconButton icon="trash" tone="danger" label={t("editor.delete")} onClick={() => setDialog("delete")} />
        <SaveStatus />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-wash/5 px-3 py-1.5">
        <Group label={t("editor.history")}>
          <IconButton icon="undo" label={t("editor.undo")} disabled={!canUndo} onClick={ed.undo} />
          <IconButton icon="redo" label={t("editor.redo")} disabled={!canRedo} onClick={ed.redo} />
          <IconButton icon="clock" label={t("history.open")} onClick={() => setDialog("history")} />
        </Group>
        <Divider />
        {/*
          Tools that act on a selection fade away when there is none (and leave the tab order), instead of sitting
          there greyed out. Their room is kept, so the rest of the bar does not jump when a widget is picked.
        */}
        <div inert={!hasSelection} aria-hidden={!hasSelection} className={`flex items-center gap-x-2 transition-opacity duration-150 ease-out motion-reduce:transition-none ${hasSelection ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <Group label={t("editor.align")}>
            {ALIGN.map((a) => (
              <IconButton key={a.mode} icon={a.icon} label={t(a.key)} onClick={() => ed.alignSelected(a.mode)} />
            ))}
          </Group>
          <Divider />
          <Group label={t("editor.spacing")}>
            <IconButton icon="distribute-h" label={t("editor.distributeX")} disabled={!canDistribute} onClick={() => ed.distributeSelected("x")} />
            <IconButton icon="distribute-v" label={t("editor.distributeY")} disabled={!canDistribute} onClick={() => ed.distributeSelected("y")} />
          </Group>
          <Divider />
          <Group label={t("editor.groupSelection")}>
            <IconButton icon="group" label={t("editor.groupAction")} disabled={selectionSize < 2} onClick={ed.groupSelected} />
            <IconButton icon="ungroup" label={t("editor.ungroupAction")} disabled={!hasGroupSelected} onClick={ed.ungroupSelected} />
          </Group>
        </div>
        <Divider />
        <Group label={t("editor.view")}>
          <ToggleButton icon="magnet" label={t("editor.snap")} pressed={snap} onChange={(v) => ed.setToggle("snap", v)} />
          <IconButton icon="search" label={`${t("command.open")} (Ctrl K)`} onClick={() => ed.setCommandOpen(true)} />
          <ToggleButton icon="grid" label={t("editor.grid")} pressed={showGrid} onChange={(v) => ed.setToggle("showGrid", v)} />
          {/* The size only matters while the grid is shown: it appears with it. */}
          {showGrid && (
            <span className="flex items-center gap-1 text-xs text-ink-dim transition-opacity duration-150 starting:opacity-0 motion-reduce:transition-none">
              <NumberInput label={t("editor.gridSize")} value={gridSize} min={GRID_SIZE.min} max={GRID_SIZE.max} className="w-14" onChange={ed.setGridSize} />
              px
            </span>
          )}
        </Group>
        <Divider />
        {/* What the overlay is judged against: the swatch shows the choice before the list is opened. */}
        <span className="flex items-center gap-1.5 text-xs text-ink-dim">
          <span aria-hidden className="size-5 shrink-0 rounded-md shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.18)]" style={backgroundStyle(background)} />
          <SelectInput<BackgroundId> className="w-32" label={t("editor.background")} value={background} options={BACKGROUNDS.map((b) => ({ value: b, label: t(`editor.bg.${b}` as MessageKey) }))} onChange={ed.setBackground} />
        </span>
        <Divider />
        <span className="flex items-center gap-1.5 text-xs text-ink-dim">
          <Icon name="monitor" />
          <SelectInput<Aspect> className="w-24" label={t("editor.aspect")} value={aspect} options={(Object.keys(ASPECTS) as Aspect[]).map((a) => ({ value: a, label: a }))} onChange={ed.setAspect} />
        </span>
        <span className="flex items-center gap-1.5 text-xs text-ink-dim">
          <Icon name="online" />
          <SelectInput
            className="w-32"
            label={t("editor.data")}
            value={dataSource}
            options={[
              { value: "mock", label: t("editor.dataMock") },
              { value: "live", label: t("editor.dataLive") },
            ]}
            onChange={ed.setDataSource}
          />
        </span>
        <label htmlFor="editor-autosave" className="ml-auto flex items-center gap-2 text-xs text-ink-dim">
          {t("editor.autosave")}
          <Switch id="editor-autosave" checked={autosave} onChange={(v) => ed.setToggle("autosave", v)} />
        </label>
      </div>

      {dialog === "history" && <HistoryDialog onClose={() => setDialog(null)} />}
      {dialog === "new" && <NameDialog title={t("editor.new")} initial="" confirmLabel={t("common.create")} templates onSubmit={(n, preset) => ed.createLayout(n, preset)} onClose={() => setDialog(null)} />}
      {dialog === "duplicate" && <NameDialog title={t("editor.duplicate")} initial={`${name} 2`.slice(0, 40)} confirmLabel={t("common.create")} onSubmit={(n) => ed.duplicateLayout(n)} onClose={() => setDialog(null)} />}
      {dialog === "rename" && <NameDialog title={t("editor.rename")} initial={name} confirmLabel={t("common.apply")} onSubmit={(n) => ed.renameLayout(n)} onClose={() => setDialog(null)} />}
      {dialog === "import" && <ImportDialog onSubmit={(text, n) => ed.importLayout(text, n)} onClose={() => setDialog(null)} />}
      {dialog === "export" && <ExportDialog name={name} json={ed.exportLayout()} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <ConfirmDialog title={t("editor.delete")} message={t("editor.confirmDelete", { name })} confirmLabel={t("common.delete")} onConfirm={() => void ed.removeLayout(name)} onClose={() => setDialog(null)} />}
    </div>
  );
}
