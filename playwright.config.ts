import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // Firefox under WSL becomes unstable with many parallel browsers.
  workers: process.env['CI'] ? 2 : 3,
  reporter: 'list',
  // Wide enough for the whole toolbar; overflow tests set a narrower viewport themselves.
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1600, height: 900 } },
  webServer: [
    {
      command: 'vite build --config e2e/vite.config.ts && vite preview --config e2e/vite.config.ts',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
    },
    {
      // collaboration server (bundled, then run with Node)
      command: 'vite build --config e2e/collab.vite.config.ts && node e2e/.collab/server.mjs',
      port: 4174,
      reuseExistingServer: !process.env['CI'],
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1600, height: 900 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1600, height: 900 } },
    },
  ],
})
