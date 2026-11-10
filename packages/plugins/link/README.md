# @scriba/plugin-link

Link con dialogo accessibile per l'editor Scriba, più **autolink** (indirizzi digitati che diventano
link) e **ancore** (id di destinazione per i link interni). Come il plugin Link, Autolink e Anchor di
TinyMCE.

```bash
pnpm add @scriba/plugin-link
```

## Uso

```ts
import { keymap } from '@scriba/core'
import {
  anchorToolbarItem,
  autolink,
  linkContextMenu,
  linkKeymap,
  linkMarks,
  linkToolbarItems,
  withAnchors,
} from '@scriba/plugin-link'

// schema: marks: { ...linkMarks, ...basicSchemaSpec.marks },
//         nodes: withAnchors({ ...basicSchemaSpec.nodes })   // anchor su paragrafi e titoli

// stato dell'editor
plugins: [autolink(schema.marks['link']!), keymap(linkKeymap(t))]

// pulsante (Ctrl/Cmd+K), ancora e menu contestuale sul link
const items = [...linkToolbarItems(schema, t), anchorToolbarItem(t)]
const menu = linkContextMenu(schema, t) // modifica, rimuovi, apri
```

## Esportazioni

| Nome                                                                                                                                                    | Cosa fa                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `linkMarks`                                                                                                                                             | Il mark `link` con `href` e `target` (solo `null` o `_blank`).                                                                                |
| `setLink(schema, href, target?)`                                                                                                                        | Comando: collega la selezione, l'intero link sotto il cursore, o inserisce l'indirizzo come testo collegato. Non fa nulla per URL non sicuri. |
| `removeLink(schema)`                                                                                                                                    | Comando: toglie il link.                                                                                                                      |
| `linkRange(state, type)`                                                                                                                                | Estensione del link sotto il cursore o nella selezione.                                                                                       |
| `normalizeLinkInput(value)`                                                                                                                             | `www.esempio.it` → `https://…`, un indirizzo e-mail → `mailto:…`.                                                                             |
| `openLinkDialog(view, t)`                                                                                                                               | Il dialogo: indirizzo, "apri in una nuova scheda", salva, rimuovi.                                                                            |
| `linkKeymap(t)`                                                                                                                                         | Ctrl/Cmd+K apre il dialogo.                                                                                                                   |
| `linkToolbarItems(schema, t)`                                                                                                                           | Pulsante Link (premuto con il cursore su un link).                                                                                            |
| `linkContextMenu(schema, t)`                                                                                                                            | Voci del menu contestuale: modifica, rimuovi, apri (apri funziona anche in sola lettura).                                                     |
| `autolink(type)`, `addressBefore`                                                                                                                       | Plugin dell'autolink.                                                                                                                         |
| `withAnchors(nodes, names?)`, `setAnchor(name)`, `openAnchorDialog`, `anchorToolbarItem(t)`, `anchorName`, `anchorsIn`, `isAnchorName`, `ANCHOR_PREFIX` | Ancore.                                                                                                                                       |

## Autolink

Dopo uno spazio o Invio, `https://…`, `www.…` (→ `https`), `mailto:…` e indirizzi e-mail (→
`mailto`) diventano link. La punteggiatura finale della frase non fa parte dell'indirizzo. Dopo lo
spazio il link è un passo annullabile a sé: Ctrl+Z lascia il testo e toglie il link. Non agisce nei
blocchi di codice né sul codice in linea.

## Ancore

Un'ancora è un `id` su un paragrafo o un titolo, sempre con il prefisso fisso `anchor-`
("Introduzione al Corso" → `#anchor-introduzione-al-corso`). Un nome già in uso viene rifiutato.

## Sicurezza

- **Whitelist di URL, non blacklist**: sono ammessi solo `http:`, `https:`, `mailto:`, `tel:` e URL
  relativi; tutto il resto è rimosso (non solo `javascript:`), dopo la normalizzazione dell'URL. Il
  controllo avviene dove il mark viene creato: HTML, JSON, dialogo, autolink, collaborazione.
- I link con `target="_blank"` ricevono **sempre** `rel="noopener noreferrer"`; "Apri" dal menu
  contestuale apre con `noopener,noreferrer`.
- Gli id delle ancore hanno un prefisso fisso e un formato rigido: niente DOM clobbering.

L'HTML salvato va ripassato da `@scriba/sanitize-server`: vedi
[sicurezza](../../../docs/sicurezza.md).

## Accessibilità

Il dialogo ha focus trap, Esc, ritorno del focus all'editor e un errore annunciato
(`aria-live`, `aria-invalid`) per gli indirizzi non validi. Tutto è raggiungibile da tastiera. Vedi
[accessibilità](../../../docs/accessibilita.md) e [plugin](../../../docs/plugin.md).
