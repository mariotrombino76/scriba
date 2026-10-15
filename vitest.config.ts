import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const plugin = (name: string) =>
  fileURLToPath(new URL(`./packages/plugins/${name}/src/index.ts`, import.meta.url))
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
      '@scriba/plugin-list': plugin('list'),
      '@scriba/plugin-blockquote': plugin('blockquote'),
      '@scriba/plugin-text-style': plugin('text-style'),
      '@scriba/plugin-link': plugin('link'),
      '@scriba/plugin-code-block': plugin('code-block'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/plugins/*/test/**/*.test.ts'],
  },
})
