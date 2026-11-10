# @scriba/plugin-paste-clean

Incolla pulito da Word, Google Docs e pagine web, come il plugin "Paste from Word / PowerPoint" di TinyMCE (`paste`/`powerpaste`, quest'ultimo a pagamento): liste vere al posto di quelle finte di Word, niente involucri Office/Docs, niente font e nero predefiniti.

```bash
pnpm add @scriba/plugin-paste-clean
```

## Uso

```ts
import { pasteClean } from '@scriba/plugin-paste-clean'

const plugins = [
  pasteClean(), // oppure pasteClean({ keepFonts: true, keepColors: false })
  // ...
]
```

Il plugin agisce sul DOM dell'HTML incollato **prima** del parser dello schema (`transformPastedDOM` della view).

## Cosa pulisce

| Origine     | Interventi                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Word        | ricostruisce liste annidate vere dai paragrafi `mso-list`; rimuove tag con namespace (`o:p`, `v:shape`, ...) e i numeri/pallini finti; `MsoTitle` diventa `h1`, `MsoSubtitle` diventa `h2` |
| Google Docs | toglie l'involucro `docs-internal-guid` e gli `<br>` al livello principale                                                                                                                 |
| Tutte       | sotto-liste lasciate dentro `<ul>`/`<ol>` spostate nell'elemento precedente; paragrafi con soli spazi/`&nbsp;` svuotati                                                                    |
| Stili       | via `font-family` e `font-size`; via il colore nero o quasi nero (`windowtext`, `black`, `#000`, ...) e gli sfondi trasparenti                                                             |

La provenienza è rilevata da `detectSource(body)` (`'word' | 'google-docs' | 'other'`).

## Esportazioni

| Nome                             | Cosa fa                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `pasteClean(options?)`           | Plugin da aggiungere all'editor                                                    |
| `cleanPastedDOM(body, options?)` | Pulisce un `body` sul posto e restituisce la provenienza (utile fuori dall'editor) |
| `detectSource(body)`             | Riconosce Word, Google Docs o altro                                                |
| `PasteCleanOptions`              | `keepFonts` (predefinito `false`), `keepColors` (predefinito `true`)               |
| `PasteSource`                    | `'word' \| 'google-docs' \| 'other'`                                               |

## Sicurezza

Questo plugin migliora la **fedeltà**, non la sicurezza. Gira su un documento **inerte** (nulla viene eseguito) e ciò che lascia passa comunque dal parser dello schema, che scarta tutto ciò che non conosce (script, handler `on*`, URL non ammessi, stili liberi). L'HTML incollato è input non fidato: chi salva HTML deve ripassarlo sempre da `@scriba/sanitize-server` sul server. Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
