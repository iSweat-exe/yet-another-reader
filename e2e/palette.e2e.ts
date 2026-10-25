import { expect, test } from "@playwright/test";
import { canvasWidgets, openEditor } from "./helpers";

test.describe("the widget palette", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("searching narrows the tiles and Enter adds the best match", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    const search = page.getByRole("searchbox", { name: "Search widgets" });
    await search.fill("clock");
    // The results replace the categories; the layers list below also names widgets, so look inside the results.
    const results = page.locator("section[aria-live=polite]");
    await expect(results.getByRole("button", { name: "Clock", exact: true })).toBeVisible();
    await expect(results.getByRole("button", { name: "Combo", exact: true })).toBeHidden();
    await search.press("Enter");
    await expect(canvasWidgets(page)).toHaveCount(before + 1);
  });

  test("a search without result says so, and clearing brings the categories back", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Search widgets" });
    await search.fill("zzzzzz");
    await expect(page.getByText("No widget matches")).toBeVisible();
    await page.getByRole("button", { name: "Clear the search" }).click();
    await expect(page.getByRole("button", { name: /^Gameplay/ })).toBeVisible();
  });

  test("a category folds and unfolds", async ({ page }) => {
    const category = page.getByRole("button", { name: /^Player \d+$/ });
    await expect(category).toHaveAttribute("aria-expanded", "true");
    await category.click();
    await expect(category).toHaveAttribute("aria-expanded", "false");
  });

  test("a tile can be dragged onto the canvas", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    const tile = page.getByRole("complementary").getByRole("button", { name: "Clock", exact: true });
    await tile.scrollIntoViewIfNeeded();
    const from = await tile.boundingBox();
    const screen = await page.locator("[data-testid=editor-screen]").boundingBox();
    if (!from || !screen) throw new Error("layout not ready");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(screen.x + screen.width / 2, screen.y + screen.height * 0.8, { steps: 12 });
    await page.mouse.up();
    await expect(canvasWidgets(page)).toHaveCount(before + 1);
  });
});

test.describe("the command palette", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("Ctrl+K opens it and Escape closes it", async ({ page }) => {
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("the toolbar button opens it too", async ({ page }) => {
    await page.getByRole("button", { name: "Commands (Ctrl K)" }).click();
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });

  test("typing a widget name and pressing Enter adds that widget", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: /Command palette|Add a widget/ }).fill("hit error bar");
    await expect(page.getByRole("option").first()).toContainText("Hit error bar");
    await page.keyboard.press("Enter");
    await expect(canvasWidgets(page)).toHaveCount(before + 1);
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();
  });

  test("arrow keys move through the results", async ({ page }) => {
    await page.keyboard.press("Control+k");
    const options = page.getByRole("option");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
  });

  test("a theme command changes the theme of the whole app", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").last().fill("theme: paper");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  });

  test("a background command changes the preview background", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").last().fill("background: ");
    const label = await page.getByRole("option").nth(2).innerText();
    await page.getByRole("option").nth(2).click();
    await expect(page.getByRole("combobox", { name: "Preview background" })).not.toContainText("Rose and violet");
    expect(label).toBeTruthy();
  });

  test("a layout command opens that layout", async ({ page }) => {
    await page.getByRole("button", { name: "New…" }).click();
    await page.getByRole("dialog").getByLabel("Layout name").fill("second");
    await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").last().fill("open layout default");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: "Layout" })).toContainText("default");
  });

  test("a query that matches nothing says so", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").last().fill("qqqqqqq");
    await expect(page.getByText("Nothing matches")).toBeVisible();
  });

  test("an action runs from the palette", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").last().fill("grid");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Grid", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});
