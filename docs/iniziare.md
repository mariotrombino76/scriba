# Iniziare

Scriba funziona in qualsiasi pagina web. Scegli il modo che corrisponde al tuo progetto.

| Il tuo progetto                                   | Usa                                      | Guida                                        |
| ------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| Pagina HTML, PHP, .NET, Java, Django… senza build | `@scriba/browser` (script da CDN)        | [qui sotto](#pagina-qualsiasi-script-da-cdn) |
| Vue 3 o Nuxt                                      | `@scriba/vue`                            | [qui sotto](#vue-3-e-nuxt)                   |
| React 18 o 19                                     | `@scriba/react`                          | [qui sotto](#react)                          |
| Bundler (Vite, webpack…) e controllo completo     | `@scriba/core` + `@scriba/view` + plugin | [qui sotto](#su-misura-con-i-pacchetti)      |

In ogni caso includi il tema (`@scriba/themes/scriba.css`, o `scriba.css` del pacchetto browser).

## Pagina qualsiasi (script da CDN)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scriba/browser@0.1.0/dist/scriba.css" />
<script src="https://cdn.jsdelivr.net/npm/@scriba/browser@0.1.0/dist/scriba.iife.js"></script>

<form method="post" action="/salva">
  <div id="editor"></div>
  <input type="hidden" name="testo" id="testo" />
  <button>Salva</button>
</form>
<script src="/js/editor.js"></script>
```

```js
// /js/editor.js
const campo = document.getElementById('testo')
const editor = Scriba.createEditor('#editor', {
  content: campo.value,
  onChange: (html) => (campo.value = html),
})
```

Opzioni, limiti e sicurezza: [README di @scriba/browser](../packages/browser/README.md).

### Modalità inline

Con `inline: true` (anche `inline` nei componenti Vue e React) l'editor diventa parte della
pagina, come la modalità inline di TinyMCE: il testo prende i caratteri, i colori e le misure
della pagina, senza riquadro; la barra degli strumenti compare solo quando si sta scrivendo,
sopra il testo (sotto, se sopra non c'è spazio; agganciata in cima alla finestra se il testo è
più alto dello schermo). Da tastiera: Tab entra nel testo e mostra la barra, **Alt+F10** passa
alla barra, Esc torna al testo.

```js
Scriba.createEditor('#articolo', { inline: true, content: articolo.innerHTML })
```

Per un'interfaccia tua: `inlineToolbar(contenitore, toolbar)` da `@scriba/ui`.

## Vue 3 e Nuxt

```bash
pnpm add @scriba/vue @scriba/themes
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ScribaEditor } from '@scriba/vue'
import '@scriba/themes/scriba.css'

const html = ref('<p>Ciao</p>')
</script>

<template>
  <ScribaEditor v-model="html" />
</template>
```

Proprietà: `format` (`'html'`/`'json'`), `schema`, `plugins`, `editable`, `label`, `locale`,
`toolbar`, `inline`, `nodeViews`. Il componente espone `getContent`, `setContent`, `focus`, `view`, `state`.
Per un'interfaccia tua: `useScriba(elemento, opzioni)`.

**Nuxt:** l'editor ha bisogno del DOM del browser. Mettilo dentro `<ClientOnly>` (oppure in un
componente `.client.vue`): durante il rendering sul server non viene disegnato.

Componenti Vue come nodi del documento (es. un'attività con casella e scadenza):
`vueNodeView(Componente, { t })` nell'opzione `nodeViews`; esempi in `@scriba/vue`
(`TaskView`, `CalloutView`).

## React

```bash
pnpm add @scriba/react @scriba/themes
```

```tsx
import { useState } from 'react'
import { ScribaEditor } from '@scriba/react'
import '@scriba/themes/scriba.css'

export function Nota() {
  const [html, setHtml] = useState('<p>Ciao</p>')
  return <ScribaEditor value={html} onChange={(v) => setHtml(v as string)} />
}
```

Dettagli: [README di @scriba/react](../packages/react/README.md).

## Su misura con i pacchetti

Per scegliere esattamente schema, plugin e interfaccia:

```ts
import {
  EditorState,
  Schema,
  basicSchemaSpec,
  history,
  keymap,
  historyKeymap,
  formatKeymap,
  baseKeymap,
} from '@scriba/core'
import { EditorView, parseContent, serializeContent } from '@scriba/view'
import { createTranslator } from '@scriba/i18n'
import { defineScribaToolbar, defaultToolbarItems } from '@scriba/ui'
import { listNodes, listKeymap, listToolbarItems } from '@scriba/plugin-list'
import '@scriba/themes/scriba.css'

const t = createTranslator('it')
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes },
  marks: basicSchemaSpec.marks,
})
const state = EditorState.create({
  doc: parseContent(schema, '<p>Ciao</p>', 'html'),
  plugins: [
    history(),
    keymap(listKeymap(schema), { priority: 50 }),
    keymap(historyKeymap),
    keymap(formatKeymap(schema)),
    keymap(baseKeymap),
  ],
})
const view = new EditorView(document.querySelector('#editor')!, { state, label: t('editor.label') })

defineScribaToolbar()
const toolbar = document.createElement('scriba-toolbar')
document.querySelector('#editor')!.before(toolbar)
toolbar.translator = t
toolbar.items = [...defaultToolbarItems(schema), ...listToolbarItems(schema)]
toolbar.view = view

// il contenuto, quando serve salvarlo
const html = serializeContent(view.state.doc, 'html')
```

Ogni plugin porta i suoi nodi o mark (da aggiungere allo schema), i suoi plugin e le sue
scorciatoie (allo stato) e le sue voci di toolbar: vedi [Plugin](plugin.md). La demo completa,
con tutti i plugin, è in `demo/main.ts` (`pnpm dev`).

## Contenuto: HTML o JSON

- **HTML** (default): comodo da salvare e mostrare. Entrando passa sempre dal parser dello schema.
- **JSON** (`format: 'json'`): la struttura esatta del documento, validata dallo schema quando
  rientra. Utile per salvare in un database documentale o confrontare versioni.

In entrambi i casi, **sul server** ripassa ciò che arriva dal client da `@scriba/sanitize-server`
(HTML) o da `schema.nodeFromJSON` (JSON) prima di salvarlo: vedi [Sicurezza](sicurezza.md).

## Lingua

L'interfaccia è in italiano e in inglese: `locale: 'en'` (componenti) oppure
`createTranslator('en')`. Per cambiare singoli testi: `createTranslator('it', { 'editor.label':
'Testo della nota' })`. Per un'altra lingua passa un oggetto con tutti i messaggi (le chiavi sono
quelle di `@scriba/i18n`).

## Tema

`scriba.css` usa variabili CSS (`--scriba-bg`, `--scriba-text`, `--scriba-accent`…) e segue il
tema chiaro/scuro del sistema. Per adattarlo al tuo sito ridefinisci le variabili:

```css
:root {
  --scriba-accent: #0b6b3a;
  --scriba-radius: 4px;
}
```

Il tema non richiede `style-src 'unsafe-inline'`: funziona con una CSP rigida.
