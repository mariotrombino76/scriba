// Bundle size (CLAUDE.md §1: core < 60 KB gzip, tree-shakeable). Each entry is bundled
// minified on its own with Vite (dependencies on other @scriba packages included, so the
// number is what an app really ships for it), then gzipped.
import console from 'node:console'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const root = new URL('..', import.meta.url).pathname
const pkg = (name) => join(root, 'packages', name, 'src/index.ts')
const plugin = (name) => join(root, 'packages/plugins', name, 'src/index.ts')

const ENTRIES = [
  { name: '@scriba/core', file: pkg('core'), budget: 60 * 1024 },
  { name: '@scriba/core + view (minimal editor)', file: [pkg('core'), pkg('view')] },
  { name: '@scriba/ui', file: pkg('ui') },
  { name: '@scriba/plugin-table', file: plugin('table') },
  { name: '@scriba/plugin-markdown', file: plugin('markdown') },
]

const alias = {
  '@scriba/core': pkg('core'),
  '@scriba/view': pkg('view'),
  '@scriba/ui': pkg('ui'),
  '@scriba/i18n': pkg('i18n'),
}
const kb = (n) => `${(n / 1024).toFixed(1)} KB`
let failed = false
console.log('Minified and gzipped, each with the parts of other @scriba packages it uses:')
for (const entry of ENTRIES) {
  const out = mkdtempSync(join(tmpdir(), 'scriba-size-'))
  const inputs = Array.isArray(entry.file) ? entry.file : [entry.file]
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias },
    build: {
      outDir: out,
      minify: true,
      lib: { entry: inputs, formats: ['es'] },
      // third-party libraries (markdown-it, lowlight…) are the app's choice: not counted
      rollupOptions: {
        external: (id) => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('@scriba/'),
      },
    },
  })
  let raw = 0
  let gz = 0
  for (const f of readdirSync(out)) {
    const code = readFileSync(join(out, f))
    raw += code.length
    gz += gzipSync(code, { level: 9 }).length
  }
  rmSync(out, { recursive: true, force: true })
  const over = entry.budget && gz > entry.budget
  if (over) failed = true
  console.log(
    `${entry.name.padEnd(40)} ${kb(raw).padStart(9)} min  ${kb(gz).padStart(8)} gzip` +
      (entry.budget ? `  (budget ${kb(entry.budget)}${over ? ': OVER' : ''})` : ''),
  )
}
if (failed) process.exit(1)
