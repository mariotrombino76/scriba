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
  // scriba.iife.js and scriba.css as published (@scriba-editor/browser), served like a CDN would
  publicDir: fileURLToPath(new URL('../packages/browser/dist', import.meta.url)),
  resolve: {
    alias: {
      '@scriba-editor/core': src('core'),
      '@scriba-editor/view': src('view'),
      '@scriba-editor/i18n': src('i18n'),
      '@scriba-editor/ui': src('ui'),
      '@scriba-editor/react': src('react'),
      '@scriba-editor/vue': src('vue'),
      '@scriba-editor/plugin-list': plugin('list'),
      '@scriba-editor/plugin-blockquote': plugin('blockquote'),
      '@scriba-editor/plugin-text-style': plugin('text-style'),
      '@scriba-editor/plugin-link': plugin('link'),
      '@scriba-editor/plugin-code-block': plugin('code-block'),
      '@scriba-editor/plugin-paste-clean': plugin('paste-clean'),
      '@scriba-editor/plugin-image': plugin('image'),
      '@scriba-editor/plugin-table': plugin('table'),
      '@scriba-editor/plugin-comments': plugin('comments'),
      '@scriba-editor/plugin-ai': plugin('ai'),
      '@scriba-editor/plugin-collab': plugin('collab'),
      '@scriba-editor/plugin-bubble': plugin('bubble'),
      '@scriba-editor/plugin-slash': plugin('slash'),
      '@scriba-editor/plugin-mention': plugin('mention'),
      '@scriba-editor/plugin-permissions': plugin('permissions'),
      '@scriba-editor/plugin-task': plugin('task'),
      '@scriba-editor/plugin-callout': plugin('callout'),
      '@scriba-editor/plugin-file': plugin('file'),
      '@scriba-editor/plugin-markdown': plugin('markdown'),
      '@scriba-editor/plugin-charmap': plugin('charmap'),
      '@scriba-editor/plugin-autosave': plugin('autosave'),
      '@scriba-editor/plugin-details': plugin('details'),
      '@scriba-editor/plugin-math': plugin('math'),
      '@scriba-editor/plugin-toc': plugin('toc'),
      '@scriba-editor/plugin-merge-tags': plugin('merge-tags'),
      '@scriba-editor/plugin-footnotes': plugin('footnotes'),
      '@scriba-editor/plugin-format-painter': plugin('format-painter'),
      '@scriba-editor/plugin-a11y-checker': plugin('a11y-checker'),
      '@scriba-editor/plugin-template': plugin('template'),
      '@scriba-editor/plugin-revisions': plugin('revisions'),
      '@scriba-editor/plugin-save': plugin('save'),
      '@scriba-editor/plugin-statusbar': plugin('statusbar'),
      '@scriba-editor/plugin-embed': plugin('embed'),
      '@scriba-editor/plugin-visual-aids': plugin('visual-aids'),
      '@scriba-editor/plugin-datetime': plugin('datetime'),
      '@scriba-editor/plugin-hr': plugin('hr'),
      '@scriba-editor/plugin-help': plugin('help'),
      '@scriba-editor/plugin-find-replace': plugin('find-replace'),
      '@scriba-editor/plugin-source': plugin('source'),
      '@scriba-editor/plugin-fullscreen': plugin('fullscreen'),
      '@scriba-editor/plugin-word-count': plugin('word-count'),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./.dist', import.meta.url)),
    emptyOutDir: true,
    // real files, never data: URLs (media tests upload the fixture's silent WAV by address)
    assetsInlineLimit: 0,
    modulePreload: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./fixture/index.html', import.meta.url)),
        react: fileURLToPath(new URL('./fixture/react.html', import.meta.url)),
        cdn: fileURLToPath(new URL('./fixture/cdn.html', import.meta.url)),
        inline: fileURLToPath(new URL('./fixture/inline.html', import.meta.url)),
      },
    },
  },
  preview: { port: 4173, strictPort: true, headers: { 'Content-Security-Policy': CSP } },
})
