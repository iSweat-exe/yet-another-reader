import { expect, test } from "@playwright/test";
import { API_PORT } from "./env";

test.describe("settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?tab=settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 2 })).toBeVisible();
  });

  test("shows every group of settings", async ({ page }) => {
    for (const name of ["Theme", "General", "Updates", "Game reading", "In-game overlay", "RivaTuner (RTSS)", "Now playing", "Network"]) {
      await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    }
  });

  test("changing a setting offers to apply it, Cancel puts it back", async ({ page }) => {
    const bar = page.getByRole("status").filter({ hasText: "Unapplied changes" });
    const port = page.getByRole("textbox", { name: "Port", exact: true });
    await port.fill("24099");
    await expect(page.getByRole("button", { name: "Apply" })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(port).toHaveValue(String(API_PORT));
    await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();
    await expect(bar).toBeAttached();
  });

  test("applying a setting confirms it", async ({ page }) => {
    await page.getByRole("textbox", { name: "Port", exact: true }).fill("24099");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Settings applied")).toBeVisible();
  });

  test("the read interval slider and its field stay in step", async ({ page }) => {
    const field = page.getByRole("textbox", { name: /^Read interval/ });
    const slider = page.getByRole("slider", { name: "Read interval" });
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(field).not.toHaveValue("33");
    await expect(page.getByText(/updates per second/)).toBeVisible();
  });

  test("the now playing switch reveals the text and folder fields", async ({ page }) => {
    await expect(page.locator("#np-template")).toBeHidden();
    await page.getByRole("switch", { name: /Write the current map to files/ }).click();
    await expect(page.locator("#np-template")).toHaveValue("{artist} - {title} [{version}]");
    await expect(page.locator("#np-dir")).toBeVisible();
    await expect(page.getByText(/\{artist\} \{title\}/)).toBeVisible();
  });

  test("the RTSS switch reveals the position fields", async ({ page }) => {
    await page.getByRole("switch", { name: /Show through RivaTuner/ }).click();
    await expect(page.locator("#rtss-x")).toBeVisible();
  });

  test("turning the API off disables its port", async ({ page }) => {
    await page.getByRole("switch", { name: /Local API/ }).click();
    await expect(page.getByRole("textbox", { name: "Port", exact: true })).toBeDisabled();
  });
});

test.describe("themes", () => {
  test("every theme can be picked and sets the theme of the page", async ({ page }) => {
    await page.goto("/?tab=settings");
    const themes = page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio");
    expect(await themes.count()).toBe(15);
    const names = ["graphite", "midnight", "paper", "terminal", "sakura", "ember", "mono", "synthwave", "gameboy", "blueprint", "newsprint", "amber", "nord", "cyber", "matcha"];
    for (let i = 0; i < 15; i += 1) {
      await themes.nth(i).click();
      await expect(themes.nth(i)).toBeChecked();
      const attr = await page.locator("html").getAttribute("data-theme");
      // The original theme has no override (or its own name); every other one is named in the attribute.
      if (i > 0) expect(attr).toBe(names[i]);
    }
  });

  test("the theme is remembered after a reload", async ({ page }) => {
    await page.goto("/?tab=settings");
    await page.getByRole("radio", { name: /^Paper/ }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  });

  test("a light theme changes the page background", async ({ page }) => {
    await page.goto("/?tab=settings");
    const before = await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByRole("radio", { name: /^Paper/ }).click();
    await expect.poll(() => page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);
  });
});

test.describe("languages", () => {
  // The name of the Settings tab in each language: it is different in each of them.
  const LANGUAGES: [string, string][] = [
    ["Français", "Réglages"],
    ["Español", "Ajustes"],
    ["Deutsch", "Einstellungen"],
    ["Português", "Ajustes"],
    ["Русский", "Настройки"],
    ["简体中文", "设置"],
    ["한국어", "설정"],
    ["日本語", "設定"],
  ];

  for (const [name, settingsTab] of LANGUAGES) {
    test(`switching to ${name} translates the interface`, async ({ page }) => {
      await page.goto("/?tab=settings");
      await page.getByRole("combobox", { name: "Language" }).click();
      await page.getByRole("option", { name, exact: true }).click();
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page.getByRole("tab", { name: settingsTab })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Settings" })).toBeHidden();
    });
  }

  test("English can be chosen again", async ({ page }) => {
    await page.goto("/?tab=settings");
    const pick = async (box: string, option: string, apply: string) => {
      await page.getByRole("combobox", { name: box }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
      await page.getByRole("button", { name: apply }).click();
    };
    await pick("Language", "Français", "Apply");
    await expect(page.getByRole("tab", { name: "Réglages" })).toBeVisible();
    await pick("Langue", "English", "Appliquer");
    await expect(page.getByRole("tab", { name: "Settings" })).toBeVisible();
  });

  test("a translated editor keeps working", async ({ page }) => {
    await page.goto("/?tab=settings");
    await page.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "日本語", exact: true }).click();
    await page.getByRole("button", { name: "Apply" }).click();
    await page.getByRole("tab", { name: "エディター" }).click();
    await expect(page.locator("[data-widget]").first()).toBeVisible();
  });
});
