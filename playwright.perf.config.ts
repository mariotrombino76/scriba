import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * Performance checks (CLAUDE.md §7): `pnpm test:perf`. Timings depend on the machine, so
 * they run apart from the e2e suite, one at a time; run them on a quiet machine, like
 * `pnpm bench`.
 */
export default defineConfig({
  ...base,
  testMatch: '**/*.perf.ts',
  fullyParallel: false,
  workers: 1,
})
