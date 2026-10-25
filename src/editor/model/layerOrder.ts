import type { WidgetInstance } from "../../overlay/model/layout";

export type Placement = "above" | "below";

/**
 * The widgets with the unit `ids` (one widget or a whole group) moved next to the unit `target`. The array is
 * ordered back to front, so "above" in the layers list (in front) means after the target in the array.
 * The unit keeps its own inner order and stays one block; widgets of other pages are left where they are
 * relative to the target. Returns the same array when the move changes nothing.
 */
export function moveUnit(widgets: WidgetInstance[], ids: readonly string[], target: readonly string[], placement: Placement): WidgetInstance[] {
  const moving = new Set(ids);
  if (ids.length === 0 || target.some((id) => moving.has(id))) return widgets;
  const block = widgets.filter((w) => moving.has(w.id));
  const rest = widgets.filter((w) => !moving.has(w.id));
  const at = target.map((id) => rest.findIndex((w) => w.id === id)).filter((i) => i >= 0);
  if (at.length === 0) return widgets;
  const index = placement === "above" ? Math.max(...at) + 1 : Math.min(...at);
  const next = [...rest.slice(0, index), ...block, ...rest.slice(index)];
  return next.every((w, i) => w === widgets[i]) ? widgets : next;
}
