import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const plugin = (name: string) =>
  fileURLToPath(new URL(`../packages/plugins/${name}/src/index.ts`, import.meta.url))
const src = (pkg: string) =>
  fileURLToPath(new URL(`../packages/${pkg}/src/index.ts`, import.meta.url))

// Manual test page. The strict-CSP check lives in the e2e suite (Vite's dev server injects styles).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@scriba/core': src('core'),
      '@scriba/view': src('view'),
      '@scriba/i18n': src('i18n'),
      '@scriba/ui': src('ui'),
      '@scriba/plugin-list': plugin('list'),
      '@scriba/plugin-blockquote': plugin('blockquote'),
    },
  },
  server: { port: 5173, open: false },
})
