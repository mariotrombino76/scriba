# @scriba-editor/vue

L'editor Scriba come componente Vue 3 (`<ScribaEditor v-model>`) e composable `useScriba()`.

```bash
pnpm add @scriba-editor/vue @scriba-editor/themes
```

Richiede `vue` 3.5 o successivo.

## Uso

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ScribaEditor } from '@scriba-editor/vue'
import '@scriba-editor/themes/scriba.css'

const html = ref('<p>Ciao</p>')
</script>

<template>
  <ScribaEditor v-model="html" />
</template>
```

Il contenuto (`v-model`, `setContent`) è **input non fidato**: passa sempre dal parser dello
schema in un documento inerte. L'HTML salvato va comunque ripassato da `@scriba-editor/sanitize-server`
sul server prima di salvarlo o mostrarlo (vedi [Sicurezza](../../docs/sicurezza.md)).

## Proprietà

| Proprietà    | Default                      | Significato                                                                                          |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `modelValue` | `null`                       | Il contenuto (HTML o JSON), per `v-model`. Un valore cambiato dall'esterno sostituisce il documento. |
| `format`     | `'html'`                     | `'html'` o `'json'`.                                                                                 |
| `schema`     | `basicSchema`                | Lo schema (letto alla creazione).                                                                    |
| `plugins`    | —                            | Plugin aggiuntivi (letti alla creazione).                                                            |
| `editable`   | `true`                       | `false`: sola lettura (si può cambiare in ogni momento).                                             |
| `label`      | "Editor di testo formattato" | Nome accessibile dell'area di scrittura (tradotto secondo `locale`).                                 |
| `locale`     | `'it'`                       | Lingua (`'it'`, `'en'`) o un oggetto di messaggi (`fr`, `de`, `es` da `@scriba-editor/i18n`).               |
| `toolbar`    | `true`                       | Mostra la toolbar predefinita.                                                                       |
| `inline`     | `false`                      | Modalità inline: stili della pagina, toolbar mobile solo mentre si scrive (letta al montaggio).      |
| `nodeViews`  | —                            | Viste personalizzate dei nodi atomici (lette alla creazione).                                        |

Evento: `update:modelValue`, emesso a ogni modifica dell'utente con il contenuto nel formato
scelto (stringa HTML o oggetto JSON). Il componente espone `getContent()`, `setContent(content)`,
`focus()`, `view` e `state` (usa un `ref` al componente). Per la barra fissa in cima alla finestra
aggiungi la classe `scriba-sticky` (vedi [@scriba-editor/themes](../themes/README.md)).

Lo schema, i plugin e il formato vengono letti quando l'editor viene creato (al montaggio);
`editable`, `label` e `locale` seguono le proprietà.

```vue
<ScribaEditor v-model="doc" format="json" locale="en" :editable="!bloccato" inline />
```

## Composable `useScriba()`

Per un'interfaccia tutta tua:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useScriba } from '@scriba-editor/vue'

const place = ref<HTMLElement | null>(null)
const scriba = useScriba(place, {
  content: '<p>Ciao</p>',
  onChange: (content) => console.log(content),
})
</script>

<template>
  <div ref="place" />
</template>
```

`useScriba(target, options)` crea l'editor al montaggio e lo distrugge allo smontaggio. Opzioni
(`UseScribaOptions`): `schema`, `content`, `format`, `plugins`, `defaultPlugins` (`false` per
sostituire cronologia e scorciatoie predefinite), `editable`, `label` (anche ref o getter),
`onChange`, `nodeViews`. Restituisce `view` e `state` (shallow ref), `getContent()`,
`setContent(content)` (non annullabile) e `focus()`. `defaultScribaPlugins(schema)` elenca i
plugin predefiniti.

## Nuxt

L'editor ha bisogno del DOM del browser: mettilo dentro `<ClientOnly>` (o in un componente
`.client.vue`).

## Componenti Vue come nodi del documento

`vueNodeView(Componente, { t, appContext, as })` disegna un nodo con un componente Vue; lo passi
in `nodeViews`. Il componente riceve `node`, `attrs`, `selected`, `editable`, `updateAttrs`,
`leave` e `t` (tipo `NodeViewProps`); per i nodi con contenuto usa `<NodeViewContent />`. Il
documento resta la fonte di verità e l'HTML in uscita viene sempre da `toHTML` del nodo, mai dal
DOM del componente. Esempi pronti: `TaskView` e `CalloutView`.

```ts
import { vueNodeView, TaskView } from '@scriba-editor/vue'
const nodeViews = { task: vueNodeView(TaskView, { t }) }
```

Altre esportazioni: `parseContent`, `serializeContent`, i tipi `Content` e `ContentFormat`.

Altro: [Iniziare](../../docs/iniziare.md), [Accessibilità](../../docs/accessibilita.md),
[Plugin](../../docs/plugin.md).
