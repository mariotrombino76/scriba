# @scriba/plugin-hr

Linea orizzontale e **interruzione di pagina** per l'editor Scriba (menu Inserisci, come in
TinyMCE).

```bash
pnpm add @scriba/plugin-hr
```

## Uso

```ts
import { Schema, basicSchemaSpec } from '@scriba/core'
import { hrNodes, hrPlugins, hrSlashItems, hrToolbarItems } from '@scriba/plugin-hr'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...hrNodes },
  marks: basicSchemaSpec.marks,
})

// nello stato dell'editor
plugins: [...hrPlugins(t)]

// pulsanti (Inserisci ▸ Linea orizzontale, Interruzione di pagina) e menu slash
const [hr, pageBreak] = hrToolbarItems(schema)
const slash = hrSlashItems(schema) // "/linea", "/interruzione"
```

## Nodi

| Nodo              | HTML                             | Note                                                                                       |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `horizontal_rule` | `<hr>`                           | Linea orizzontale.                                                                         |
| `page_break`      | `<hr class="scriba-page-break">` | Qualsiasi viewer mostra una linea; gli stili di stampa del tema iniziano una nuova pagina. |

Nessuno dei due ha attributi: altre classi o attributi di un `<hr>` vengono scartati.

## Esportazioni

| Nome                                      | Cosa fa                                                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hrNodes`                                 | Le due specifiche di nodo.                                                                                                                                                                                     |
| `insertHorizontalRule`, `insertPageBreak` | Comandi: inseriscono nel cursore (il paragrafo viene diviso, in un paragrafo vuoto lo sostituiscono); il cursore va nel testo dopo, aggiungendo un paragrafo se non c'è. Non funzionano nei blocchi di codice. |
| `hrToolbarItems(schema)`                  | Due pulsanti: linea e interruzione di pagina.                                                                                                                                                                  |
| `hrSlashItems(schema)`                    | Due voci del menu slash.                                                                                                                                                                                       |
| `hrPlugins(t)`                            | Dà un nome alle interruzioni di pagina per i lettori di schermo.                                                                                                                                               |
| `PAGE_BREAK_CLASS`                        | La classe fissa `scriba-page-break`.                                                                                                                                                                           |

Con `@scriba/plugin-markdown`, scrivere `---`, `___` o `***` da soli in un paragrafo vuoto inserisce
la linea orizzontale.

## Sicurezza e accessibilità

- La classe dell'interruzione è **fissa**: nessuna classe proveniente dall'esterno viene accettata
  (vedi [sicurezza](../../../docs/sicurezza.md)).
- Nell'editor ogni interruzione di pagina riceve un `aria-label` (un `<hr>` da solo è soltanto
  "separatore"); l'etichetta esiste **solo nel DOM dell'editor**, l'HTML salvato resta semplice.
- Il salvataggio come pagina HTML di `@scriba/plugin-file` e la stampa rispettano l'interruzione.

Vedi anche [plugin](../../../docs/plugin.md) e [accessibilità](../../../docs/accessibilita.md).
