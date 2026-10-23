import type { KeyboardEvent } from "react";

/**
 * Arrow-key navigation of a `role="tablist"`: ←/→ move to the neighbouring tab (wrapping), Home/End to the
 * ends. The tab that receives the focus is activated, as the tabs here change a view at no cost.
 * Pair it with `tabIndex={selected ? 0 : -1}` on the tabs so the list is a single stop of the Tab key.
 */
export function onTabListKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const current = tabs.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  let next = current;
  if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
  else if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = tabs.length - 1;
  else return;
  e.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}
