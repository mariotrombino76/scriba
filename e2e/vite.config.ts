import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
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
  "connect-src 'self' ws://localhost:4174",
  "object-src 'none'",
  "base-uri 'none'",
  "require-trusted-types-for 'script'",
].join('; ')

export default defineConfig({
  plugins: [vue()],
  root: fileURLToPath(new URL('./fixture', import.meta.url)),
  // scriba.iife.js and scriba.css as published (@scriba/browser), served like a CDN would
  publicDir: fileURLToPath(new URL('../packages/browser/dist', import.meta.url)),
  resolve: {
    alias: {
      '@scriba/core': src('core'),
      '@scriba/view': src('view'),
      '@scriba/i18n': src('i18n'),
      '@scriba/ui': src('ui'),
      '@scriba/react': src('react'),
      '@scriba/vue': src('vue'),
      '@scriba/plugin-list': plugin('list'),
      '@scriba/plugin-blockquote': plugin('blockquote'),
      '@scriba/plugin-text-style': plugin('text-style'),
      '@scriba/plugin-link': plugin('link'),
      '@scriba/plugin-code-block': plugin('code-block'),
      '@scriba/plugin-paste-clean': plugin('paste-clean'),
      '@scriba/plugin-image': plugin('image'),
      '@scriba/plugin-table': plugin('table'),
      '@scriba/plugin-comments': plugin('comments'),
      '@scriba/plugin-ai': plugin('ai'),
      '@scriba/plugin-collab': plugin('collab'),
      '@scriba/plugin-bubble': plugin('bubble'),
      '@scriba/plugin-slash': plugin('slash'),
      '@scriba/plugin-mention': plugin('mention'),
      '@scriba/plugin-permissions': plugin('permissions'),
      '@scriba/plugin-task': plugin('task'),
      '@scriba/plugin-callout': plugin('callout'),
      '@scriba/plugin-file': plugin('file'),
      '@scriba/plugin-markdown': plugin('markdown'),
      '@scriba/plugin-charmap': plugin('charmap'),
      '@scriba/plugin-datetime': plugin('datetime'),
      '@scriba/plugin-hr': plugin('hr'),
      '@scriba/plugin-help': plugin('help'),
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
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./fixture/index.html', import.meta.url)),
        react: fileURLToPath(new URL('./fixture/react.html', import.meta.url)),
        cdn: fileURLToPath(new URL('./fixture/cdn.html', import.meta.url)),
      },
    },
  },
  preview: { port: 4173, strictPort: true, headers: { 'Content-Security-Policy': CSP } },
})
