import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const pkg = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url))
const plugin = (name: string) =>
  fileURLToPath(new URL(`../plugins/${name}/src/index.ts`, import.meta.url))
const PLUGINS = [
  'blockquote',
  'charmap',
  'code-block',
  'find-replace',
  'fullscreen',
  'hr',
  'image',
  'link',
  'list',
  'markdown',
  'paste-clean',
  'source',
  'table',
  'text-style',
]

/**
 * Two self-contained files from the sources (two builds: `vite build`, `vite build --mode iife`): `scriba.js` (ES module) and `scriba.iife.js`
 * (classic script, global `Scriba`), plus `scriba.css`. Everything is bundled: a page
 * needs nothing else.
 */
export default defineConfig(({ mode }) => ({
  // The classic script has no `import.meta`: the regex search worker (find and replace)
  // cannot start there and regex search reports "unsupported" (it never runs on the page's
  // thread); plain search works. A worker must come from the page's own origin anyway.
  ...(mode === 'iife' ? { define: { 'import.meta.url': 'undefined' } } : {}),
  resolve: {
    alias: {
      '@scriba/core': pkg('core'),
      '@scriba/view': pkg('view'),
      '@scriba/ui': pkg('ui'),
      '@scriba/i18n': pkg('i18n'),
      ...Object.fromEntries(PLUGINS.map((p) => [`@scriba/plugin-${p}`, plugin(p)])),
    },
  },
  build: {
    outDir: 'dist',
    // the ES build runs first and empties the folder; the classic script is added next to it
    emptyOutDir: mode !== 'iife',
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL('./src/entry.ts', import.meta.url)),
      name: 'Scriba',
      formats: mode === 'iife' ? ['iife'] : ['es'],
      fileName: (format) => (format === 'es' ? 'scriba.js' : 'scriba.iife.js'),
      cssFileName: 'scriba',
    },
    // the attribution required by the license (Apache 2.0, NOTICE) travels with the files
    rolldownOptions: {
      output: {
        postBanner:
          '/*! Scriba | Copyright 2026 Mario Trombino | Apache-2.0 | https://github.com/mariotrombino76/scriba */',
      },
    },
  },
}))
