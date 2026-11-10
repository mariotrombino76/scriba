// vue-tsc writes `Foo.vue.d.ts` next to declarations that import `./Foo.vue`. A
// consumer with `moduleResolution: node16/nodenext` cannot resolve `./Foo.vue` to it;
// `./Foo.vue.js` resolves to `Foo.vue.d.ts` with every resolution mode.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.d.ts') ? [join(dir, e.name)] : [],
  )
for (const file of walk(fileURLToPath(new URL('../dist', import.meta.url)))) {
  const text = readFileSync(file, 'utf8')
  const fixed = text.replace(/(from\s+['"])(\.{1,2}\/[^'"]+\.vue)(['"])/g, '$1$2.js$3')
  if (fixed !== text) writeFileSync(file, fixed)
}
