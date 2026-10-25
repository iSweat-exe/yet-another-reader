import { expect, test } from "@playwright/test";
import { addWidget, canvasWidgets, openEditor } from "./helpers";

const layoutBox = (page: import("@playwright/test").Page) => page.getByRole("combobox", { name: "Layout" });

async function createLayout(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "New…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Layout name").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("layouts", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("creates a layout from a template and switches to it", async ({ page }) => {
    await createLayout(page, "stream");
    await expect(layoutBox(page)).toContainText("stream");
  });

  test("an empty template gives an empty canvas", async ({ page }) => {
    await page.getByRole("button", { name: "New…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Layout name").fill("blank");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Empty" }).click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(canvasWidgets(page)).toHaveCount(0);
  });

  test("refuses an invalid name and a name already taken", async ({ page }) => {
    await page.getByRole("button", { name: "New…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Layout name").fill("bad/name");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Invalid name");
    await dialog.getByLabel("Layout name").fill("default");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog.getByRole("alert")).toContainText("already exists");
  });

  test("duplicates, renames and deletes a layout", async ({ page }) => {
    await page.getByRole("button", { name: "Duplicate…" }).click();
    await page.getByRole("dialog").getByLabel("Layout name").fill("copy");
    await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await expect(layoutBox(page)).toContainText("copy");

    await page.getByRole("button", { name: "Rename…" }).click();
    await page.getByRole("dialog").getByLabel("Layout name").fill("renamed");
    await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
    await expect(layoutBox(page)).toContainText("renamed");

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(layoutBox(page)).toContainText("default");
  });

  test("Escape closes a dialog without doing anything", async ({ page }) => {
    await page.getByRole("button", { name: "New…" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("auto-save keeps a change after a reload", async ({ page }) => {
    const before = await canvasWidgets(page).count();
    await addWidget(page, "Clock");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(canvasWidgets(page)).toHaveCount(before + 1);
  });
});

test.describe("sharing a layout", () => {
  test.beforeEach(async ({ page }) => openEditor(page));

  test("the export dialog offers a share code and a file", async ({ page }) => {
    await page.getByRole("button", { name: "Export…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox", { name: "Share code" })).toHaveValue(/^yar1:/);
    await expect(dialog.getByText(/embedded file/)).toBeVisible();
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download file" }).click();
    expect((await download).suggestedFilename()).toBe("default.yarlayout");
  });

  test("a share code imports as a new layout with the same widgets", async ({ page }) => {
    const count = await canvasWidgets(page).count();
    await page.getByRole("button", { name: "Export…" }).click();
    const code = await page.getByRole("dialog").getByRole("textbox", { name: "Share code" }).inputValue();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Import…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Layout file content or share code" }).fill(code);
    await dialog.getByLabel("Layout name").fill("from code");
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(layoutBox(page)).toContainText("from code");
    await expect(canvasWidgets(page)).toHaveCount(count);
  });

  test("a downloaded file imports back", async ({ page }) => {
    await page.getByRole("button", { name: "Export…" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("dialog").getByRole("button", { name: "Download file" }).click();
    const path = await (await download).path();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Import…" }).click();
    await page.getByRole("dialog").locator("input[type=file]").setInputFiles(path);
    await page.getByRole("dialog").getByLabel("Layout name").fill("from file");
    await page.getByRole("dialog").getByRole("button", { name: "Import" }).click();
    await expect(layoutBox(page)).toContainText("from file");
  });

  test("a plain layout JSON still imports", async ({ page }) => {
    const layout = { version: 2, name: "x", referenceHeight: 1080, widgets: [{ id: "c", type: "combo", anchor: "top-left", x: 10, y: 10, w: 200, h: 60, pages: ["playing"] }] };
    await page.getByRole("button", { name: "Import…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Layout file content or share code" }).fill(JSON.stringify(layout));
    await dialog.getByLabel("Layout name").fill("plain");
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(canvasWidgets(page)).toHaveCount(1);
  });

  test("garbage is refused with a message", async ({ page }) => {
    await page.getByRole("button", { name: "Import…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Layout file content or share code" }).fill("yar1:@@@");
    await dialog.getByLabel("Layout name").fill("nope");
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(dialog.getByRole("alert")).toContainText("not a valid layout");
  });

  test("a bundle with a picture imports the picture too", async ({ page }) => {
    // A 1x1 PNG, the id being what the app derives from its bytes.
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const bundle = await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const id = `${[...digest.subarray(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("")}.png`;
      return JSON.stringify({
        format: "yar-layout",
        version: 1,
        layout: { version: 2, name: "pic", referenceHeight: 1080, widgets: [{ id: "i", type: "image", anchor: "top-left", x: 0, y: 0, w: 200, h: 200, pages: ["playing"], options: { image: id } }] },
        assets: [{ id, data }],
      });
    }, png);
    await page.getByRole("button", { name: "Import…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Layout file content or share code" }).fill(bundle);
    await dialog.getByLabel("Layout name").fill("pic");
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(canvasWidgets(page)).toHaveCount(1);
    // The widget itself is drawn in the scene under the hit boxes.
    await expect(page.locator("img[src^='blob:']")).toHaveCount(1);
  });

  test("a bundle with an invalid file is refused", async ({ page }) => {
    const bundle = JSON.stringify({
      format: "yar-layout",
      version: 1,
      layout: { version: 2, name: "bad", referenceHeight: 1080, widgets: [] },
      assets: [{ id: "0123456789abcdef0123456789abcdef.png", data: btoa("not a picture") }],
    });
    await page.getByRole("button", { name: "Import…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Layout file content or share code" }).fill(bundle);
    await dialog.getByLabel("Layout name").fill("bad");
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(dialog.getByRole("alert")).toContainText("not valid");
  });
});

test.describe("saved versions", () => {
  test("lists an older version and restores it", async ({ page }) => {
    const old = { version: 2, name: "default", referenceHeight: 1080, widgets: [{ id: "only", type: "combo", anchor: "top-left", x: 10, y: 10, w: 200, h: 60, pages: ["playing"] }] };
    await page.addInitScript((layout) => {
      if (!localStorage.getItem("yar.layoutVersions")) localStorage.setItem("yar.layoutVersions", JSON.stringify({ default: [{ id: Date.now() - 10 * 60_000, layout }] }));
    }, old);
    await openEditor(page);
    await page.getByRole("button", { name: "Saved versions" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await expect(dialog.getByText("1 widgets")).toBeVisible();
    await dialog.getByRole("button", { name: "Restore this version" }).click();
    await expect(canvasWidgets(page)).toHaveCount(1);
    // Restoring is an edit like any other.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(canvasWidgets(page).first()).toBeVisible();
    expect(await canvasWidgets(page).count()).toBeGreaterThan(1);
  });

  test("says so when there is no older version", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Saved versions" }).click();
    await expect(page.getByRole("dialog").getByText("No older version yet")).toBeVisible();
  });
});
