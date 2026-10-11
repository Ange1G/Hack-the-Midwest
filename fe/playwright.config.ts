import { defineConfig, devices } from '@playwright/test'

const port = 3100
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // The first page load of a fresh Vite server compiles the app on demand;
  // with three workers starting at once that can exceed the 5 s default.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite dev --port ${port} --mode mock`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
