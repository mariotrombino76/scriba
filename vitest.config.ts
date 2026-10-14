import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('scriba-') } } }),
  ],
  resolve: {
    // Tests run against package sources, never stale builds.
    alias: {
      '@scriba/core': src('core'),
      '@scriba/view': src('view'),
      '@scriba/i18n': src('i18n'),
      '@scriba/ui': src('ui'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
