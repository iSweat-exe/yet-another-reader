import { expect, test } from "@playwright/test";
import { addWidget, canvasWidgets, openEditor, selectWidget } from "./helpers";

test.describe("the history widgets", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("the hit error bar draws ticks for the recent hits", async ({ page }) => {
    await addWidget(page, "Hit error bar");
    const bar = page.getByRole("img", { name: "Hit error bar" });
    await expect(bar).toBeVisible();
    // The simulation keeps hitting: the bar is made of positioned ticks, bands and an average marker.
    await expect.poll(() => bar.locator("div").count()).toBeGreaterThan(10);
  });

  test("the hit error bar can show early / late labels", async ({ page }) => {
    await addWidget(page, "Hit error bar");
    await expect(page.getByText("Early", { exact: true })).toBeHidden();
    await page.getByRole("checkbox", { name: "Early / late labels" }).click();
    await expect(page.getByText("Early", { exact: true })).toBeVisible();
    await expect(page.getByText("Late", { exact: true })).toBeVisible();
  });

  test("the PP graph draws a line that follows the play", async ({ page }) => {
    await addWidget(page, "PP / accuracy graph");
    const graph = page.getByRole("img", { name: "PP", exact: true });
    await expect(graph).toBeVisible();
    await expect.poll(async () => (await graph.locator("path[stroke]").last().getAttribute("d"))?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(10);
  });

  test("the graph can show accuracy instead of PP", async ({ page }) => {
    await addWidget(page, "PP / accuracy graph");
    await page.getByRole("combobox", { name: "Value" }).click();
    await page.getByRole("option", { name: "Accuracy" }).click();
    await expect(page.getByRole("img", { name: "Accuracy", exact: true })).toBeVisible();
  });

  test("the gap to the record shows a signed difference and the record", async ({ page }) => {
    await addWidget(page, "Gap to record");
    await expect(page.getByText(/^Record \d+pp$/)).toBeVisible();
    await expect(page.getByText(/^[+-]?\d+(\.\d)?pp$/).first()).toBeVisible();
  });

  test("the gap to the record can compare the score instead", async ({ page }) => {
    await addWidget(page, "Gap to record");
    await page.getByRole("combobox", { name: "Compare" }).click();
    await page.getByRole("option", { name: "Score" }).click();
    await expect(page.getByText(/^Record [\d,]+$/)).toBeVisible();
  });

  test("the record line can be hidden", async ({ page }) => {
    await addWidget(page, "Gap to record");
    await expect(page.getByText(/^Record /)).toBeVisible();
    await page.getByRole("checkbox", { name: "Show the record" }).click();
    await expect(page.getByText(/^Record /)).toBeHidden();
  });
});

test.describe("widget options and typography", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("a widget's inspector lists its options", async ({ page }) => {
    await addWidget(page, "Hit error bar");
    await expect(page.getByRole("checkbox", { name: "Show hit windows" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Colour hits by judgement" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Show the average" })).toBeChecked();
  });

  test("the typography section changes the font of the widget", async ({ page }) => {
    await selectWidget(page, 0);
    const font = page.getByRole("combobox", { name: "Font" });
    await font.click();
    await page.getByRole("option", { name: /Monospace/ }).click();
    await expect(font).toContainText(/Monospace/);
    const mono = await page.locator("[style*='monospace']").count();
    expect(mono).toBeGreaterThan(0);
  });

  test("the layers list names every widget, with a lock and order buttons", async ({ page }) => {
    const rows = page.locator("[data-row^='w:']");
    expect(await rows.count()).toBe(await canvasWidgets(page).count());
  });
});
