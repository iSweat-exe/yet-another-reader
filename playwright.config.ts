import { defineConfig, devices } from "@playwright/test";
import { API_PORT, WEB_PORT } from "./e2e/env";

/**
 * End-to-end tests: the real interface in a real browser, fed by the app's fake data (plain browser mode)
 * and, where the API is the point, by the sample server (`cargo run -p overlay-server --example sample`).
 *
 *   npm run e2e            everything
 *   npm run e2e -- editor  files whose name contains "editor"
 *   npm run e2e:ui         the Playwright UI
 *
 * It drives Microsoft Edge (always on Windows) so no browser has to be downloaded; set `E2E_CHANNEL=chrome`
 * (or `chromium` after `npx playwright install chromium`) to use another one. It uses its own ports (Vite 1431,
 * sample API 24052), so a running app does not get in the way.
 */

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: process.env.E2E_CHANNEL ?? "msedge",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    // Motion off: the tests check states, not frames.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "edge", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL ?? "msedge" } }],
  webServer: [
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      env: { VITE_YAR_API_PORT: String(API_PORT) },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `cargo run -p overlay-server --example sample -- ${API_PORT}`,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
