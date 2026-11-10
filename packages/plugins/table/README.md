# @scriba/plugin-table

Tabelle con la parità delle tabelle di TinyMCE (e di quelle avanzate, a pagamento): inserimento con selettore di dimensione, righe e colonne, celle unite e divise, intestazioni, selezione di celle, larghezza delle colonne, proprietà di tabella e cella, ordinamento per colonna, incolla di celle come in un foglio di calcolo.

```bash
pnpm add @scriba/plugin-table
```

## Uso

```ts
import { keymap } from '@scriba/core'
import {
  tableContextMenu,
  tableKeymap,
  tableNodes,
  tablePlugins,
  tableToolbarItems,
} from '@scriba/plugin-table'

const schema = new Schema({ nodes: { ...basicSchemaSpec.nodes, ...tableNodes }, marks })

const plugins = [
  ...tablePlugins(), // normalizzazione, selezione di celle, ridimensionamento colonne, incolla celle
  keymap(tableKeymap(), { priority: 55 }), // sopra le liste: Tab si muove tra le celle
]

// toolbar: ...tableToolbarItems(schema, t)   // "Inserisci tabella" (selettore 8x10) + menu "Tabella" contestuale
// menu contestuale: tableContextMenu(schema, t)
```

## Esportazioni

| Nome                                                                                                                | Cosa fa                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tableNodes`                                                                                                        | Nodi `table`, `table_row`, `table_cell`, `table_header` (attributi tipizzati: `colspan`, `rowspan`, `colwidth`, `background`, `valign`, bordi, `caption`, `align`) |
| `tablePlugins()`                                                                                                    | Normalizzazione (tabelle rettangolari) e view: celle selezionate, colonne, incolla                                                                                 |
| `tableKeymap()`                                                                                                     | Tab, Shift+Tab, Shift+frecce, frecce per uscire dalla tabella, Backspace/Canc                                                                                      |
| `tableToolbarItems(schema, t)`                                                                                      | Menu di inserimento e menu "Tabella" (visibile solo dentro una tabella)                                                                                            |
| `tableContextMenu(schema, t)`                                                                                       | Sezione del menu contestuale: Cella, Riga, Colonna, proprietà, elimina                                                                                             |
| `insertTable(rows, cols, headerRow?)`                                                                               | Inserisce una tabella (al massimo `MAX_ROWS` = 50 righe e `MAX_COLS` = 20 colonne)                                                                                 |
| `addRow(before)`, `addColumn(before)`, `deleteRow`, `deleteColumn`, `deleteTable`                                   | Struttura                                                                                                                                                          |
| `mergeCells`, `splitCell`                                                                                           | Unione e divisione celle                                                                                                                                           |
| `toggleHeader('row' \| 'column')`, `isHeaderOn(state, kind)`                                                        | Intestazioni di riga o colonna                                                                                                                                     |
| `changeColumnWidth(delta, defaultWidth?)`, `setColumnWidths`                                                        | Larghezza delle colonne                                                                                                                                            |
| `setCellProps(props)`, `setTableProps(props)`                                                                       | Proprietà di cella e di tabella (colore di sfondo, bordi, allineamento verticale, didascalia, ...)                                                                 |
| `sortTable(order, options?)`                                                                                        | Ordina le righe per la colonna della cella selezionata (`'asc'` o `'desc'`)                                                                                        |
| `pasteCells(state, content)`                                                                                        | Incolla una tabella dentro un'altra dalla cella selezionata, ampliando la tabella                                                                                  |
| `goToCell(dir)`, `selectedRect(state)`                                                                              | Navigazione e rettangolo selezionato                                                                                                                               |
| `openTableDialog(view, t)`, `openTablePropsDialog`, `openCellDialog`                                                | Dialoghi (dimensioni, proprietà tabella, proprietà cella)                                                                                                          |
| `CellSelection`, `TableGrid`, `buildTable`, `tableAt`, `cellPosAt`, `isCell`                                        | Selezione di celle e griglia, per chi scrive comandi propri                                                                                                        |
| `compareCellText`, `parseLocaleNumber`, `SortOrder`, `SortOptions`                                                  | Confronto usato dall'ordinamento                                                                                                                                   |
| `tableNormalize()`                                                                                                  | Il solo plugin di normalizzazione (già incluso in `tablePlugins()`)                                                                                                |
| `MAX_SPAN` (100), `MIN_COL_WIDTH` (24), `MAX_COL_WIDTH` (2000), `MAX_BORDER_WIDTH` (10), `MAX_CAPTION_LENGTH` (500) | Limiti                                                                                                                                                             |

### Ordinamento

`sortTable` confronta i numeri per valore (con il formato della lingua: `1.234,5` in italiano, `1,234.5` in inglese) e il resto in ordine alfabetico senza distinguere maiuscole e accenti ("2" prima di "10"). Le righe di intestazione in cima restano, le celle vuote vanno in fondo, i valori uguali mantengono l'ordine; non si può con celle unite su più righe. La lingua è `options.locale`, altrimenti il `lang` più vicino all'editor.

## Tastiera

- **Tab / Maiusc+Tab**: cella successiva/precedente (si seleziona il contenuto). Oltre la prima o l'ultima cella non fanno nulla, così il focus può uscire dall'editor: **nessuna trappola da tastiera**.
- **Maiusc+frecce**: creano o ampliano una selezione di celle (ai bordi del testo della cella).
- **Frecce** oltre la prima o l'ultima cella, quando prima o dopo la tabella non c'è nulla: viene creato un paragrafo, così il cursore può sempre uscire.
- **Backspace / Canc** con tutte le celle selezionate eliminano la tabella; con meno celle le svuotano.

## Accessibilità

Il menu "Tabella" e il menu contestuale sono raggiungibili da tastiera; la tabella conserva la semantica `th`/`td` e può avere una didascalia (`caption`). I dialoghi hanno focus trap e messaggi di errore in una regione `aria-live` con `aria-invalid` sul campo non valido; i controlli colore hanno un campo esadecimale con etichetta. Vedi [accessibilità](../../../docs/accessibilita.md).

## Sicurezza

Tutti gli attributi sono tipizzati e validati: span da 1 a 100, larghezze 24-2000 px, bordo al massimo 10 px, colori normalizzati (mai `style` libero), didascalia al massimo 500 caratteri, testo nascosto (script, style, ...) escluso. Righe e colonne dell'incolla hanno un tetto (anti-DoS). L'HTML incollato (anche da Word o Google Docs) passa dal parser dello schema; il server deve comunque ripassare l'HTML con `@scriba/sanitize-server`. Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
