import { expect, test } from "@playwright/test";

test.describe("documentation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?tab=docs");
    await expect(page.getByRole("navigation", { name: "Documentation" })).toBeVisible();
  });

  test("opens on the introduction", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Getting started", level: 1 })).toBeVisible();
  });

  test("every page of the menu opens with a heading", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Documentation" });
    const pages = await nav.getByRole("button").allInnerTexts();
    expect(pages.length).toBeGreaterThanOrEqual(15);
    for (const name of pages) {
      await nav.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("article").getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
  });

  test("the search finds a page by its content", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Search the documentation" }).fill("unstable rate");
    const nav = page.getByRole("navigation", { name: "Documentation" });
    expect(await nav.getByRole("button").count()).toBeGreaterThan(0);
    await page.getByRole("searchbox", { name: "Search the documentation" }).fill("zzzzzzzz");
    await expect(page.getByText("No page matches.")).toBeVisible();
  });

  test("the previous and next links walk through the pages", async ({ page }) => {
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { name: "Create an overlay", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /^Previous/ }).click();
    await expect(page.getByRole("heading", { name: "Getting started", level: 1 })).toBeVisible();
  });

  test("the REST page documents the new personal best route", async ({ page }) => {
    await page.getByRole("button", { name: "REST routes", exact: true }).click();
    await expect(page.getByRole("article")).toContainText("/personal-best");
  });

  test("the WebSocket page documents the events stream and the new events", async ({ page }) => {
    await page.getByRole("button", { name: "WebSocket", exact: true }).click();
    const article = page.getByRole("article");
    await expect(article).toContainText("/api/v1/events/ws");
    for (const name of ["comboBreak", "miss", "hit"]) await expect(article).toContainText(name);
  });
});

test.describe("API playground", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?tab=docs");
    await page.getByRole("button", { name: "Playground", exact: true }).click();
    await expect(page.getByRole("heading", { name: "API playground" })).toBeVisible();
  });

  test("sends a REST request to the sample server and shows the answer", async ({ page }) => {
    await page.getByRole("button", { name: "Send", exact: true }).first().click();
    await expect(page.getByText(/200/).first()).toBeVisible();
    await expect(page.locator("pre").first()).toContainText("{");
  });

  test("a custom address can be asked", async ({ page }) => {
    await page.getByRole("textbox", { name: "Address" }).fill("/api/v1/health");
    await page.getByRole("textbox", { name: "Address" }).press("Enter");
    await expect(page.locator("pre").first()).toContainText("ok");
  });

  test("the personal best route answers with a record and its samples", async ({ page }) => {
    await page.getByRole("combobox", { name: "Route" }).click();
    await page.getByRole("option", { name: /personal-best/ }).click();
    await page.getByRole("button", { name: "Send", exact: true }).first().click();
    await expect(page.locator("pre").first()).toContainText("samples");
  });

  test("a WebSocket can be opened, watched and closed", async ({ page }) => {
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Connected/ })).toBeVisible();
    await expect(page.locator("summary").getByText("hello", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  });

  test("the events stream is one of the streams", async ({ page }) => {
    await page.getByRole("combobox", { name: "Stream" }).click();
    await page.getByRole("option", { name: "/api/v1/events/ws" }).click();
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Connected/ })).toBeVisible();
    await expect(page.locator("summary").getByText("hello", { exact: true })).toBeVisible();
  });

  test("the message filter keeps only the matching messages", async ({ page }) => {
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.locator("summary").getByText("hello", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Filter the messages" }).fill("nomatchatall");
    await expect(page.locator("summary")).toHaveCount(0);
  });
});
