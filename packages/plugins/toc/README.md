# @scriba/plugin-toc

Indice dei contenuti come il plugin `toc` di TinyMCE: elenco dei titoli del documento, ognuno un link all'ancora del titolo, **aggiornato da solo** quando i titoli cambiano.

```bash
pnpm add @scriba/plugin-toc
```

## Uso

Servono le ancore sui titoli (`withAnchors` di `@scriba/plugin-link`).

```ts
import { withAnchors } from '@scriba/plugin-link'
import { tableOfContents, tocNodes, tocSlashItem, tocToolbarItem } from '@scriba/plugin-toc'

const schema = new Schema({
  nodes: withAnchors({ ...basicSchemaSpec.nodes, ...tocNodes }),
  marks,
})

const plugins = [
  tableOfContents(), // tiene aggiornati tutti gli indici
]
// menu Inserisci: tocToolbarItem(schema); menu "/": tocSlashItem(schema)
```

HTML prodotto: `<ol class="scriba-toc"><li><a href="#anchor-intro">Intro</a><ol>...</ol></li></ol>`, cioè solo liste e link già ammessi dallo schema.

## Esportazioni

| Nome                                                       | Cosa fa                                                                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `tocNodes`                                                 | Nodo `table_of_contents`: blocco atomico con l'attributo `entries`                                                          |
| `tableOfContents()`                                        | Plugin: dopo ogni modifica dà un'ancora ai titoli che ne sono privi (dal testo, unica nel documento) e riscrive ogni indice |
| `syncTableOfContents(tr, schema)`                          | Lo stesso aggiornamento su una transazione; restituisce se qualcosa è cambiato                                              |
| `insertTableOfContents(schema)`                            | Comando: inserisce un indice al cursore, già compilato (non nei blocchi di codice); lancia `RangeError` se manca `tocNodes` |
| `tocToolbarItem(schema)`                                   | Pulsante "Indice dei contenuti" (`id: 'toc'`)                                                                               |
| `tocSlashItem(schema)`                                     | Voce `/indice` (parole chiave: indice, sommario, toc, contents, titoli)                                                     |
| `tocEntries(doc)`                                          | Le voci dell'indice del documento (per un pannello laterale, un outline...)                                                 |
| `TocEntry`                                                 | `{ level, text, anchor }`                                                                                                   |
| `TOC_CLASS`, `MAX_TOC_ENTRIES` (500), `MAX_TOC_TEXT` (200) | Costanti                                                                                                                    |

## Note

I titoli con testo vuoto non compaiono; se mancano `tocNodes` o le ancore sui titoli, il plugin non fa nulla. Se i livelli saltano (da 1 a 3) la lista annida un livello in più.

## Sicurezza

L'indice è riletto dall'HTML in ingresso con regole rigide: al massimo 500 voci e 6 livelli, testo di al massimo 200 caratteri senza caratteri di controllo, `href` solo `#anchor-<nome>` con nome valido (`isAnchorName`). Una voce non valida viene scartata. L'indice è sempre ricostruito dai titoli reali, e il testo è inserito come testo, mai HTML. Il server deve comunque ripassare l'HTML con `@scriba/sanitize-server`. Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
