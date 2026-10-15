import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const plugin = (name: string) =>
  fileURLToPath(new URL(`../packages/plugins/${name}/src/index.ts`, import.meta.url))
const src = (pkg: string) =>
  fileURLToPath(new URL(`../packages/${pkg}/src/index.ts`, import.meta.url))

/** Strict CSP for e2e (CLAUDE.md §5.7): the editor must work without inline scripts/styles or eval. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https:",
  "object-src 'none'",
  "base-uri 'none'",
  "require-trusted-types-for 'script'",
].join('; ')

export default defineConfig({
  root: fileURLToPath(new URL('./fixture', import.meta.url)),
  resolve: {
    alias: {
      '@scriba/core': src('core'),
      '@scriba/view': src('view'),
      '@scriba/i18n': src('i18n'),
      '@scriba/ui': src('ui'),
      '@scriba/plugin-list': plugin('list'),
      '@scriba/plugin-blockquote': plugin('blockquote'),
      '@scriba/plugin-text-style': plugin('text-style'),
      '@scriba/plugin-link': plugin('link'),
      '@scriba/plugin-code-block': plugin('code-block'),
      '@scriba/plugin-paste-clean': plugin('paste-clean'),
      '@scriba/plugin-image': plugin('image'),
      '@scriba/plugin-table': plugin('table'),
      '@scriba/plugin-find-replace': plugin('find-replace'),
      '@scriba/plugin-source': plugin('source'),
      '@scriba/plugin-fullscreen': plugin('fullscreen'),
      '@scriba/plugin-word-count': plugin('word-count'),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./.dist', import.meta.url)),
    emptyOutDir: true,
    modulePreload: false,
  },
  preview: { port: 4173, strictPort: true, headers: { 'Content-Security-Policy': CSP } },
})
