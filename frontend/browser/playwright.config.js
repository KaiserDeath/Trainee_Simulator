import { defineConfig, devices } from "@playwright/test";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  outputDir: fileURLToPath(new URL('../.cache/playwright-results/', import.meta.url)),
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
      VITE_TREZ_AUTH_REQUIRED: "false",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
