import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const src = (path: string) =>
  fileURLToPath(new URL(`../packages/${path}/src/index.ts`, import.meta.url))

/** Bundles the e2e collaboration server into one Node file (dependencies included). */
export default defineConfig({
  resolve: {
    alias: {
      '@scriba-editor/core': src('core'),
      '@scriba-editor/plugin-collab': src('plugins/collab'),
      '@scriba-editor/collab-server': src('collab-server'),
    },
  },
  ssr: { noExternal: true },
  build: {
    ssr: fileURLToPath(new URL('./collab-server.ts', import.meta.url)),
    outDir: fileURLToPath(new URL('./.collab', import.meta.url)),
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'server.mjs' } },
  },
})
