# @scriba-editor/plugin-footnotes

Note a piè di pagina per l'editor Scriba: riferimenti numerati nel testo ed elenco delle note in
fondo al documento, **sempre sincronizzati**. Come il plugin per le note di TinyMCE, ma l'ordine e i
numeri sono mantenuti dall'editor.

```bash
pnpm add @scriba-editor/plugin-footnotes
```

## Uso

```ts
import { Schema, keymap, basicSchemaSpec } from '@scriba-editor/core'
import {
  footnoteGoToItem,
  footnoteNodes,
  footnotes,
  footnotesKeymap,
  footnoteSlashItem,
  footnoteToolbarItem,
} from '@scriba-editor/plugin-footnotes'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...footnoteNodes },
  marks: basicSchemaSpec.marks,
})

// nello stato dell'editor
plugins: [keymap(footnotesKeymap(schema), { priority: 70 }), footnotes()]

// menu Inserisci e menu slash ("/nota")
const items = [footnoteToolbarItem(schema), footnoteGoToItem()]
const slash = footnoteSlashItem(schema)
```

## Come funziona

In HTML un riferimento e la sua nota sono collegati da un numero:

```html
testo<sup><a href="#fn-1" id="fnref-1">1</a></sup> …
<ol class="scriba-footnotes">
  <li id="fn-1"><p>La nota.</p></li>
</ol>
```

`footnotes()` rimette in ordine dopo ogni modifica (digitazione, incolla, annulla, collaborazione): i
riferimenti sono numerati 1, 2, 3… nell'ordine di lettura; c'è un solo elenco in fondo al documento
con una nota per riferimento, nello stesso ordine; un riferimento senza nota ne riceve una vuota, le
note senza riferimento spariscono. Se due riferimenti hanno la stessa chiave (uno è stato copiato)
la nota resta a quello già presente.

## Esportazioni

| Nome                                   | Cosa fa                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `footnoteNodes`                        | Nodi dello schema: `footnote_ref` (inline, atomo), `footnotes` (elenco), `footnote` (nota, uno o più paragrafi). |
| `footnotes()`                          | Plugin che mantiene numeri, ordine ed elenco delle note.                                                         |
| `insertFootnote(schema)`               | Comando: inserisce il riferimento nel cursore e la nota nell'elenco; il cursore passa nella nota.                |
| `goToFootnote`                         | Comando: dal riferimento selezionato alla nota, e dalla nota al riferimento.                                     |
| `footnotesKeymap(schema)`              | Scorciatoie (vedi sotto).                                                                                        |
| `footnoteToolbarItem(schema)`          | Voce "Inserisci nota".                                                                                           |
| `footnoteGoToItem()`                   | Voce "Vai alla nota / al testo" (per menu e menu contestuale).                                                   |
| `footnoteSlashItem(schema)`            | Voce del menu slash.                                                                                             |
| `syncFootnotes(tr, schema, existing?)` | Aggiunge a una transazione i passi che rimettono in ordine le note.                                              |
| `FOOTNOTES_CLASS`, `MAX_FOOTNOTES`     | Classe dell'elenco (`scriba-footnotes`) e numero massimo di note (9999).                                         |

## Scorciatoie

| Tasto                              | Azione                             |
| ---------------------------------- | ---------------------------------- |
| Ctrl/Cmd+Alt+F                     | Inserisce una nota a piè di pagina |
| Invio (su riferimento selezionato) | Apre la sua nota                   |

Il comando non è disponibile nei blocchi di codice, dentro una nota (niente note nelle note) né dove
lo schema non ammette il riferimento.

## Sicurezza

- Gli id in HTML sono **solo** `fn-<numero>` e `fnref-<numero>` (prefissi fissi, numeri 1–9999 senza
  zeri iniziali): niente DOM clobbering di variabili globali della pagina.
- L'elenco viene riconosciuto in ingresso solo con la classe `scriba-footnotes`; ciò che non
  corrisponde viene scartato dal parser dello schema.
- La chiave che lega riferimento e nota resta nell'editor, non nell'HTML (solo `[a-z0-9]`, al massimo
  24 caratteri).

L'HTML salvato va comunque ripassato da `@scriba-editor/sanitize-server`: vedi
[sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md). Per la tastiera e i
dialoghi vedi [accessibilità](../../../docs/accessibilita.md).
