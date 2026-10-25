import { expect, test } from "@playwright/test";

test.describe("the in-game overlay page", () => {
  test("draws the active layout over a background with the simulated play", async ({ page }) => {
    await page.goto("/?bg=1#overlay");
    await expect(page.getByText("98.71%")).toBeVisible();
    await expect(page.getByText(/\d,\d{3},\d{3}/).first()).toBeVisible();
    await expect(page.getByText(/\d+pp/).first()).toBeVisible();
  });

  test("shows the mods as icons", async ({ page }) => {
    await page.goto("/?bg=1#overlay");
    await expect(page.getByRole("img", { name: "HD" })).toBeVisible();
    await expect(page.getByRole("img", { name: "DT" })).toBeVisible();
  });

  test("never makes a sound", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/?bg=1#overlay");
    await page.mouse.click(300, 300);
    await page.waitForTimeout(500);
    expect(requests.filter((u) => u.includes("/Samples/"))).toEqual([]);
  });

  test("the app page is not loaded by the overlay", async ({ page }) => {
    await page.goto("/?bg=1#overlay");
    await expect(page.getByRole("tablist")).toHaveCount(0);
  });
});
