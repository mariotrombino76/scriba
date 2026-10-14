import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    // Tests run against package sources, never stale builds.
    alias: { '@scriba/core': src('core'), '@scriba/view': src('view') },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
