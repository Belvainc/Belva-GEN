import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",
  fullyParallel: true,
  forbidOnly: true, // Fail CI if .only() is left in
  retries: 0,
  workers: undefined, // Use default parallelism
  reporter: [["html", { open: "never" }], ["list"]],

  // Performance budget: 60s total for E2E suite
  timeout: 10_000, // Per-test timeout (10s budget per scenario)
  globalTimeout: 60_000, // Suite-wide timeout (60s budget)

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
  },
});
