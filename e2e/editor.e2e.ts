import { expect, test } from "@playwright/test";
import { addWidget, boxOf, canvasWidgets, openEditor, selectWidget, widgetIds } from "./helpers";

test.describe("editing widgets", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("adds a widget from the palette and counts it on the page tab", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    await addWidget(page, "Clock");
    await expect(canvasWidgets(page)).toHaveCount(before + 1);
    await expect(page.getByRole("tab", { name: `Playing ${before + 1}` })).toBeVisible();
  });

  test("undo and redo bring a widget back and forth", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    await addWidget(page, "Clock");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(canvasWidgets(page)).toHaveCount(before);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(canvasWidgets(page)).toHaveCount(before + 1);
  });

  test("keyboard shortcuts undo, redo and delete", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    await selectWidget(page, 0);
    await page.keyboard.press("Delete");
    await expect(canvasWidgets(page)).toHaveCount(before - 1);
    await page.keyboard.press("Control+z");
    await expect(canvasWidgets(page)).toHaveCount(before);
    await page.keyboard.press("Control+y");
    await expect(canvasWidgets(page)).toHaveCount(before - 1);
  });

  test("selecting a widget opens its inspector, Escape clears the selection", async ({ page }) => {
    await expect(page.getByText("Select a widget to edit it")).toBeVisible();
    await selectWidget(page, 0);
    await expect(page.getByText("Select a widget to edit it")).toBeHidden();
    await expect(page.getByRole("button", { name: "Delete widget" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Select a widget to edit it")).toBeVisible();
  });

  test("arrow keys nudge the selected widget, Shift moves ten times as far", async ({ page }) => {
    const widget = canvasWidgets(page).first();
    await selectWidget(page, 0);
    const start = await boxOf(widget);
    await page.keyboard.press("ArrowRight");
    const one = await boxOf(widget);
    expect(one.x).toBeGreaterThan(start.x);
    await page.keyboard.press("Shift+ArrowRight");
    const eleven = await boxOf(widget);
    expect(eleven.x - one.x).toBeGreaterThan(5 * (one.x - start.x));
  });

  test("dragging a widget moves it", async ({ page }) => {
    const widget = canvasWidgets(page).first();
    const start = await boxOf(widget);
    await page.mouse.move(start.x + 4, start.y + 4);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 80, { steps: 8 });
    await page.mouse.up();
    const end = await boxOf(widget);
    expect(end.x).toBeGreaterThan(start.x + 30);
    expect(end.y).toBeGreaterThan(start.y + 30);
  });

  test("Ctrl+D duplicates the selection", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    await selectWidget(page, 0);
    await page.keyboard.press("Control+d");
    await expect(canvasWidgets(page)).toHaveCount(before + 1);
  });

  test("copy then paste adds a copy of the widget", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    await selectWidget(page, 0);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(canvasWidgets(page)).toHaveCount(before + 1);
  });

  test("Ctrl+A selects everything and Ctrl+G groups it into one layer row", async ({ page }) => {
    await page.locator("[data-testid=editor-screen]").click({ position: { x: 4, y: 4 } });
    await page.keyboard.press("Control+a");
    await expect(page.getByText(/widgets selected/)).toBeVisible();
    await page.keyboard.press("Control+g");
    await expect(page.locator("[data-row^='g:']")).toHaveCount(1);
    await page.keyboard.press("Control+Shift+g");
    await expect(page.locator("[data-row^='g:']")).toHaveCount(0);
  });

  test("a locked widget cannot be picked on the canvas, only in the layers", async ({ page }) => {
    await selectWidget(page, 0);
    await page.keyboard.press("Escape");
    const first = canvasWidgets(page).first();
    const id = await first.getAttribute("data-widget");
    const row = page.locator(`[data-row='w:${id}']`);
    await row.hover();
    await row.getByRole("button", { name: "Lock" }).click();
    await page.locator("[data-testid=editor-screen]").click({ position: { x: 4, y: 4 } });
    await first.click({ position: { x: 3, y: 3 }, force: true });
    await expect(page.getByText("Select a widget to edit it")).toBeVisible();
    // The layers list still reaches it.
    await row.getByRole("button").first().click();
    await expect(page.getByRole("button", { name: "Delete widget" })).toBeVisible();
  });

  test("align left puts two widgets on the same left edge", async ({ page }) => {
    await selectWidget(page, 0);
    await page.keyboard.down("Shift");
    await selectWidget(page, 1);
    await page.keyboard.up("Shift");
    await page.getByRole("button", { name: "Align left" }).click();
    const lefts = await Promise.all([0, 1].map(async (i) => Math.round((await boxOf(canvasWidgets(page).nth(i))).x)));
    expect(lefts[0]).toBe(lefts[1]);
  });

  test("copying a style and pasting it gives the second widget the first one's colour", async ({ page }) => {
    await selectWidget(page, 0);
    await page.getByLabel("Colour", { exact: true }).first().fill("#ff0000");
    await page.getByRole("button", { name: "Copy the style" }).click();
    await selectWidget(page, 1);
    await expect(page.getByLabel("Colour", { exact: true }).first()).not.toHaveValue("#ff0000");
    await page.getByRole("button", { name: "Paste the style" }).click();
    await expect(page.getByLabel("Colour", { exact: true }).first()).toHaveValue("#ff0000");
  });

  test("Ctrl+Alt+C and Ctrl+Alt+V copy and paste the style from the keyboard", async ({ page }) => {
    await selectWidget(page, 0);
    await page.getByLabel("Colour", { exact: true }).first().fill("#00ff00");
    // Shortcuts are ignored while a field has the focus.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Control+Alt+c");
    await selectWidget(page, 1);
    await page.keyboard.press("Control+Alt+v");
    await expect(page.getByLabel("Colour", { exact: true }).first()).toHaveValue("#00ff00");
  });

  test("several selected widgets can take the size of the first one", async ({ page }) => {
    await selectWidget(page, 0);
    await page.keyboard.down("Shift");
    await selectWidget(page, 1);
    await page.keyboard.up("Shift");
    const first = await boxOf(canvasWidgets(page).nth(0));
    await page.getByRole("button", { name: "Width", exact: true }).click();
    const second = await boxOf(canvasWidgets(page).nth(1));
    expect(Math.abs(second.width - first.width)).toBeLessThan(2);
  });

  test("changing the opacity with the slider changes the widget", async ({ page }) => {
    await selectWidget(page, 0);
    const slider = page.getByRole("slider", { name: "Opacity" });
    await slider.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await expect(slider).not.toHaveValue("100");
  });
});

test.describe("the toolbar and the canvas settings", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("the grid shows a size field", async ({ page }) => {
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(page.getByLabel("Grid size (px)")).toBeVisible();
  });

  test("the preview background can be changed", async ({ page }) => {
    const surface = page.locator("[data-testid=editor-screen]");
    const before = await surface.evaluate((el) => getComputedStyle(el).backgroundImage);
    await page.getByRole("combobox", { name: "Preview background" }).click();
    const options = page.getByRole("option");
    await options.nth(2).click();
    await expect.poll(() => surface.evaluate((el) => getComputedStyle(el).backgroundImage)).not.toBe(before);
  });

  test("the page tabs switch between the pages of the game", async ({ page }) => {
    await page.getByRole("tab", { name: /^Song select/ }).click();
    await expect(page.getByRole("tab", { name: /^Song select/ })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /^Playing/ }).click();
    await expect(canvasWidgets(page).first()).toBeVisible();
  });

  test("the keyboard shortcuts card is shown", async ({ page }) => {
    await expect(page.getByText("undo / redo")).toBeVisible();
  });
});

test.describe("the layers", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("the stacking order can be changed from a layer row", async ({ page }) => {
    const ids = await widgetIds(page);
    const row = page.locator(`[data-row='w:${ids[0]}']`);
    await row.hover();
    await row.getByRole("button", { name: /front|Bring/i }).first().click();
    const after = await widgetIds(page);
    expect(after).not.toEqual(ids);
    expect(after.sort()).toEqual([...ids].sort());
  });
});
