import { expect, test } from "@playwright/test";

test("the app opens on the status page and shows its four tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Yet Another Reader/);
  for (const name of ["Status", "Settings", "Editor", "Documentation"]) {
    await expect(page.getByRole("tab", { name })).toBeVisible();
  }
  console.log((await page.locator("body").innerText()).slice(0, 600));
});
