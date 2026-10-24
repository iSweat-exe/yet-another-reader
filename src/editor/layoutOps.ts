import {
  type Layout,
  type WidgetInstance,
  newGroupId,
  withAutoAnchor,
  withoutLoneGroups,
} from "../overlay/layout";

export type Aspect = "16:9" | "21:9" | "16:10" | "4:3" | "32:9";

export const ASPECTS: Record<Aspect, number> = { "16:9": 16 / 9, "21:9": 21 / 9, "16:10": 16 / 10, "4:3": 4 / 3, "32:9": 32 / 9 };

const NAME_PATTERN = /^[\p{L}\p{N} _-]{1,40}$/u;

export const isValidLayoutName = (name: string) => NAME_PATTERN.test(name) && name === name.trim();

/** Width of the previewed screen, in layout pixels. */
export const viewWidthOf = (doc: Layout, aspect: Aspect) => Math.round(doc.referenceHeight * ASPECTS[aspect]);

/** Gives the copies in `fresh` groups of their own, so duplicating a group does not merge it with the original. */
export const regroup = (widgets: WidgetInstance[], fresh: ReadonlySet<string>): WidgetInstance[] => {
  const renamed = new Map<string, string>();
  const taken = [...widgets];
  return withoutLoneGroups(
    widgets.map((w) => {
      if (!fresh.has(w.id) || !w.group) return w;
      let group = renamed.get(w.group);
      if (!group) {
        group = newGroupId(taken);
        renamed.set(w.group, group);
        taken.push({ ...w, group });
      }
      return { ...w, group };
    }),
  );
};

/**
 * Re-anchors the widgets `ids` to where they sit now, so the layout keeps its meaning on other
 * screen shapes without the user having to think about anchors. Widgets whose anchor was set by
 * hand are left alone.
 */
export const withAutoAnchors = (doc: Layout, ids: ReadonlySet<string>, aspect: Aspect): Layout => {
  const viewWidth = viewWidthOf(doc, aspect);
  return { ...doc, widgets: doc.widgets.map((w) => (ids.has(w.id) ? withAutoAnchor(w, viewWidth, doc.referenceHeight) : w)) };
};
