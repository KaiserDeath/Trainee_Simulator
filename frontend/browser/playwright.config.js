import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const host = "127.0.0.1";
const port = Number(process.env.TREZ_BROWSER_TEST_PORT || 4173);
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.smoke.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../node_modules/.cache/playwright-results",
  use: {
    baseURL,
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port} --strictPort`,
    env: {
      VITE_API_URL: baseURL,
      VITE_TREZ_HUB_ENABLED: "true",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
