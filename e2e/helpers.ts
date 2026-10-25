import { expect, type Locator, type Page } from "@playwright/test";

/** The widgets of the page being edited, on the canvas. */
export const canvasWidgets = (page: Page): Locator => page.locator("[data-widget]");

/** Opens the editor on the default layout and waits until its canvas is drawn. */
export async function openEditor(page: Page): Promise<void> {
  await page.goto("/?tab=editor");
  await expect(page.getByRole("combobox", { name: "Layout" })).toBeVisible();
  await expect(canvasWidgets(page).first()).toBeVisible();
}

/** Adds a widget from the palette by its name (a tile adds it at the middle of the screen). */
export async function addWidget(page: Page, name: string): Promise<void> {
  await page.getByRole("complementary").getByRole("button", { name, exact: true }).click();
}

/** Selects the widget `index` of the canvas by clicking its top-left corner (the centre may be covered). */
export async function selectWidget(page: Page, index: number): Promise<void> {
  await canvasWidgets(page).nth(index).click({ position: { x: 3, y: 3 } });
}

/** Where a canvas widget is on screen. */
export async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("widget not visible");
  return box;
}

/** The ids of the widgets of the canvas, in stacking order. */
export const widgetIds = (page: Page): Promise<string[]> => canvasWidgets(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.widget ?? ""));
