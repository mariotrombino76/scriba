# @scriba-editor/plugin-slash

Menu a comandi con `/` (`/tabella`, `/immagine`, `/titolo`): una funzione che TinyMCE non offre di serie. Si scrive `/` a inizio riga o dopo uno spazio, si filtra scrivendo e si sceglie la voce.

```bash
pnpm add @scriba-editor/plugin-slash
```

## Uso

```ts
import { keymap } from '@scriba-editor/core'
import { basicSlashItems, slashCommands, slashKeymap, type SlashItem } from '@scriba-editor/plugin-slash'

const slashItems: SlashItem[] = [
  ...basicSlashItems(schema), // paragrafo e titoli 1-3
  taskSlashItem(schema), // voci fornite da altri plugin
  calloutSlashItem(schema),
  {
    id: 'bullet_list',
    label: (tr) => tr('list.bullet'),
    keywords: ['elenco', 'puntato', 'list', 'ul'],
    icon: 'bulletList',
    command: toggleList(schema.nodes['bullet_list']!, schema.nodes['list_item']!),
  },
]

const plugins = [
  ...slashCommands(slashItems, t),
  keymap(slashKeymap(slashItems, t), { priority: 110 }), // alta priorità
]
```

## Esportazioni

| Nome                                             | Cosa fa                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `slashCommands(items, t)`                        | Plugin del menu `/`                                                                                                                                          |
| `slashKeymap(items, t)`                          | Tasti con il menu aperto                                                                                                                                     |
| `basicSlashItems(schema)`                        | Paragrafo e titoli 1-3, per i tipi presenti nello schema                                                                                                     |
| `SlashItem`                                      | `{ id, label(t), keywords?, icon?, command?, run?(view) }`: `command` agisce sul documento, `run` serve per azioni che usano la view (es. aprire un dialogo) |
| `filterItems(items, query, t)`                   | Le voci che corrispondono: ogni parola deve comparire nell'etichetta o nelle parole chiave; prima chi inizia per la ricerca                                  |
| `fold(text)`                                     | Minuscolo senza accenti ("Città" diventa "citta"): la ricerca ignora maiuscole e accenti                                                                     |
| `chooseItem(view, item)`                         | Toglie `/ricerca` ed esegue la voce                                                                                                                          |
| `getSlashState(state)`, `slashKey`, `SlashState` | Stato del menu                                                                                                                                               |

## Tastiera

`/` all'inizio di un blocco o dopo uno spazio apre il menu (mai nel codice in linea né in un blocco di codice). Frecce Su/Giù spostano la selezione, Invio o Tab scelgono, Esc chiude (il testo scritto resta). Uno spazio subito dopo `/`, o dopo una ricerca senza risultati, chiude il menu e si continua a scrivere. La ricerca è lunga al massimo 40 caratteri.

## Accessibilità

Il menu è un `listbox` sotto la `/` (sopra se sotto manca spazio) mentre il focus resta nel testo; l'editor punta al menu con `aria-controls` e alla voce evidenziata con `aria-activedescendant`, quindi i lettori di schermo annunciano la voce mentre si scrive o ci si muove. Con nessun risultato compare "Nessun comando" (`slash.none`).

## Note

- Etichette e icone sono testo/SVG creati dal codice, mai HTML. Le voci sono definite da te: il menu non carica nulla dall'esterno.
- La posizione è impostata via CSSOM, quindi funziona con una CSP rigida.

Vedi [plugin](../../../docs/plugin.md) e [accessibilità](../../../docs/accessibilita.md).
