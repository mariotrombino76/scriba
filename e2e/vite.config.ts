import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

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
  resolve: { alias: { '@scriba/core': src('core'), '@scriba/view': src('view') } },
  build: {
    outDir: fileURLToPath(new URL('./.dist', import.meta.url)),
    emptyOutDir: true,
    modulePreload: false,
  },
  preview: { port: 4173, strictPort: true, headers: { 'Content-Security-Policy': CSP } },
})
