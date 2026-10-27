# Plugin

Ogni funzione oltre al testo di base è un plugin, in un pacchetto `@scriba/plugin-*`. Un plugin
porta di solito quattro cose; prendi solo quelle che ti servono:

1. **Nodi o mark** da aggiungere allo **schema** (es. `tableNodes`, `linkMarks`);
2. **plugin** da aggiungere allo **stato** (es. `tablePlugins()`);
3. **scorciatoie** (`...Keymap`), da mettere con `keymap(...)`;
4. **voci di interfaccia** per toolbar, barra dei menu, "/" e menu del tasto destro
   (`...ToolbarItems`, `...SlashItem`, `...ContextMenu`).

L'esempio completo, con tutti i plugin insieme, è `demo/main.ts` (`pnpm dev`).

## Scrittura e struttura

| Pacchetto           | A cosa serve                                                                                                                                                     | Esportazioni principali                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-list`       | Elenchi puntati e numerati annidati, Tab/Maiusc+Tab, stili (cerchio, quadrato, a/A/i/I)                                                                          | `listNodes`, `listKeymap`, `listToolbarItems`, `listStyleMenus`, `toggleList`, `listIndentCommands`                                                                                                                     |
| `plugin-blockquote` | Citazioni                                                                                                                                                        | `blockquoteNodes`, `toggleBlockquote`, `blockquoteToolbarItems`                                                                                                                                                         |
| `plugin-code-block` | Blocchi di codice con evidenziazione sicura (lowlight → decorazioni)                                                                                             | `codeBlockNodes`, `codeHighlight`, `codeBlockKeymap`, `codeBlockToolbarItems`                                                                                                                                           |
| `plugin-text-style` | Allineamento, rientro, interlinea, direzione del testo (RTL), maiuscole/minuscole, stili con le classi del tuo sito, colori, font e dimensione (stili tipizzati) | `textStyleMarks`, `withBlockStyles`, `withBlockClasses`, `classMarks`, `classFormatsMenu`, `textStyleKeymap`, `alignmentMenu`, `lineHeightMenu`, `caseMenu`, `directionItems`, `indentItems`, `colorItems`, `fontItems` |
| `plugin-hr`         | Linea orizzontale e interruzione di pagina                                                                                                                       | `hrNodes`, `hrPlugins`, `hrToolbarItems`, `hrSlashItems`                                                                                                                                                                |
| `plugin-callout`    | Riquadri (info, suggerimento, avviso, pericolo)                                                                                                                  | `calloutNodes`, `toggleCallout`, `calloutToolbarItem`, `calloutSlashItem`                                                                                                                                               |
| `plugin-task`       | Attività con casella e scadenza (vista Vue)                                                                                                                      | `taskNodes`, `insertTask`, `taskKeymap`, `taskToolbarItem`                                                                                                                                                              |
| `plugin-details`    | Sezioni comprimibili (fisarmonica, `<details>`): titolo, apri/chiudi                                                                                             | `detailsNodes`, `detailsNodeView`, `detailsKeymap`, `detailsAutoOpen`, `detailsToolbarItem`, `detailsSlashItem`                                                                                                         |
| `plugin-footnotes`  | Note a piè di pagina numerate in automatico, elenco in fondo sempre allineato (Ctrl+Alt+F)                                                                       | `footnoteNodes`, `footnotes`, `footnotesKeymap`, `insertFootnote`, `goToFootnote`, `footnoteToolbarItem`                                                                                                                |
| `plugin-toc`        | Indice dei contenuti aggiornato con i titoli (con `withAnchors` sui titoli)                                                                                      | `tocNodes`, `tableOfContents`, `insertTableOfContents`, `tocToolbarItem`, `tocSlashItem`                                                                                                                                |
| `plugin-math`       | Formule: LaTeX nel documento, MathML nell'HTML (KaTeX, `trust` disattivato), anteprima dal vivo                                                                  | `createMathNodes(katex)`, `mathNodeView`, `mathPlugins`, `mathKeymap`, `insertMath`, `mathToolbarItem`, `mathSlashItem`                                                                                                 |
| `plugin-merge-tags` | Campi di unione `{{cliente.nome}}`: menu, suggerimenti dopo `{{`, `fillMergeTags`                                                                                | `mergeTagNodes`, `mergeTags`, `mergeTagMenu`, `insertMergeTag`, `fillMergeTags`, `mergeTagsIn`                                                                                                                          |
| `plugin-markdown`   | Scorciatoie Markdown mentre scrivi, import ed export                                                                                                             | `markdownShortcuts`, `parseMarkdown`, `serializeMarkdown`                                                                                                                                                               |
| `plugin-datetime`   | Inserisci data e ora                                                                                                                                             | `dateTimeMenu`, `formatDateTime`                                                                                                                                                                                        |
| `plugin-charmap`    | Caratteri speciali ed emoji                                                                                                                                      | `charmapToolbarItem`, `openCharmapDialog`                                                                                                                                                                               |

La fisarmonica nell'editor si mostra con la sua vista: passa
`nodeViews: { details: detailsNodeView(t) }` all'editor (lo script da CDN lo fa da solo) e
aggiungi `keymap(detailsKeymap(), { priority: 70 })` e `detailsAutoOpen()` ai plugin. Senza la
vista il browser userebbe il `<details>` nativo, che si apre e si chiude da solo fuori dal
documento.

Salvataggio: `keymap(saveKeymap({ save }), { priority: 90 })` prima di quella del menu File, così
Ctrl+S chiama la tua funzione invece di scaricare il file; `save(doc)` riceve il documento (usa
`serializeHTML(doc)`) e il server deve comunque ripassarlo da `@scriba/sanitize-server`.

Stili del tuo sito (Formato ▸ Stili): elenca le classi una volta e usa gli stessi elenchi nello
schema del browser e del server.

```ts
const BLOCK = ['nota-margine', 'avviso'],
  INLINE = ['evidenza']
const schema = new Schema({
  nodes: withBlockClasses(withBlockStyles(nodi), BLOCK),
  marks: { ...marks, ...classMarks(INLINE) },
})
classFormatsMenu(schema, [{ label: 'Avviso', class: 'avviso', kind: 'block' }])
```

Le altre classi (`MsoNormal` di Word, quelle delle pagine web) vengono scartate; i nomi sono solo
`[a-z][a-z0-9-]*` e mai `scriba-…`, riservati all'editor. Il CSS delle classi è il tuo.

Formule: passa KaTeX allo schema, così decidi tu quando caricarlo (anche solo quando serve):

```ts
import katex from 'katex' // oppure: const katex = (await import('katex')).default
const schema = new Schema({ nodes: { ...nodi, ...createMathNodes(katex) }, marks })
// nodeViews: { math_inline: mathNodeView(t), math_display: mathNodeView(t) }
```

L'HTML contiene MathML, che i browser mostrano da soli, senza script né CSS di KaTeX.

| Pacchetto            | A cosa serve                                                                                                                                                                                                                         | Esportazioni principali                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-link`        | Link con dialog accessibile; apri, rimuovi; link automatici mentre scrivi; ancore                                                                                                                                                    | `linkMarks`, `linkKeymap`, `linkToolbarItems`, `linkContextMenu`, `autolink`, `withAnchors`, `anchorToolbarItem`                                         |
| `plugin-image`       | Immagini: upload tramite tua funzione, trascina e incolla, ridimensiona, testo alternativo                                                                                                                                           | `imageNodes`, `imagePlugins`, `imageKeymap`, `imageToolbarItems`, `imageContextMenu`                                                                     |
| `plugin-embed`       | Media come TinyMCE: YouTube (privacy avanzata), Vimeo, Dailymotion, Spotify, Google Maps (iframe con `sandbox`, whitelist dei domini) e file video/audio (https o relativi, upload con la tua funzione); nell'editor schede e player | `embedNodes`, `mediaNodes`, `embedNodeView`, `mediaFileNodeView`, `embedPlugins`, `embedKeymap`, `embedToolbarItem`, `embedSlashItem`, `openMediaDialog` |
| `plugin-table`       | Tabelle: righe/colonne, unisci/dividi, intestazioni, larghezze, selezione di celle                                                                                                                                                   | `tableNodes`, `tablePlugins`, `tableKeymap`, `tableToolbarItems`, `tableContextMenu`                                                                     |
| `plugin-mention`     | Menzioni `@persona` con ricerca asincrona                                                                                                                                                                                            | `mentionNodes`, `mentions`, `mentionKeymap`                                                                                                              |
| `plugin-paste-clean` | Pulisce l'incolla da Word, Google Docs, pagine web                                                                                                                                                                                   | `pasteClean`                                                                                                                                             |

## Strumenti e interfaccia

| Pacchetto               | A cosa serve                                                                                     | Esportazioni principali                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `plugin-slash`          | Menu "/" di blocchi e azioni                                                                     | `slashCommands`, `slashKeymap`, `basicSlashItems`                                        |
| `plugin-bubble`         | Barra di formattazione sopra il testo selezionato                                                | `bubbleMenu`, `bubbleKeymap`                                                             |
| `plugin-find-replace`   | Trova e sostituisci, anche con regex (in un Web Worker interrompibile)                           | `findReplacePlugins`, `findReplaceKeymap`, `findReplaceToolbarItem`                      |
| `plugin-source`         | Vista del sorgente HTML (ciò che modifichi ripassa dallo schema)                                 | `sourceToolbarItem`, `openSourceDialog`                                                  |
| `plugin-fullscreen`     | Schermo intero                                                                                   | `Fullscreen`, `fullscreenKeymap`, `fullscreenToolbarItem`                                |
| `plugin-word-count`     | Conteggio parole e caratteri                                                                     | `createWordCountStatus`, `openWordCountDialog`                                           |
| `plugin-statusbar`      | Barra di stato: percorso dell'elemento (`p › strong`) e maniglia per ridimensionare l'editor     | `createElementPath`, `elementPath`, `createResizeHandle`                                 |
| `plugin-save`           | Pulsante Salva e Ctrl+S con la tua funzione, attivo solo con modifiche non salvate               | `savePlugin`, `saveKeymap`, `saveItem`, `saveCommand`, `isDirty`, `markSaved`            |
| `plugin-file`           | Menu File: nuovo, apri (.docx, .html, .md, .txt), scarica, anteprima, stampa                     | `filePlugin`, `fileKeymap`, `fileMenu`                                                   |
| `plugin-help`           | Menu Aiuto con le scorciatoie (Alt+0)                                                            | `helpItem`, `helpKeymap`, `shortcutsFromItems`                                           |
| `plugin-autosave`       | Bozza salvata nel browser mentre si scrive, "Ripristina l'ultima bozza"                          | `autosave`, `restoreDraftItem`, `restoreDraft`, `clearDraft`                             |
| `plugin-visual-aids`    | Mostra blocchi e caratteri invisibili (solo nell'editor, l'HTML non cambia)                      | `visualAids`, `visualAidsItems`, `toggleVisualBlocks`, `toggleVisualChars`               |
| `plugin-format-painter` | Copia formato: dà la formattazione di un testo a un altro (Ctrl+Alt+C / Ctrl+Alt+V)              | `formatPainter`, `formatPainterKeymap`, `formatPainterItem`, `copyFormat`, `pasteFormat` |
| `plugin-a11y-checker`   | Verifica accessibilità (WCAG 2.2 A/AA/AAA): un problema alla volta, con spiegazione e correzione | `a11yChecker`, `a11yCheckerItem`, `openA11yDialog`, `checkAccessibility`, `a11yIssues`   |

Dall'interfaccia (`@scriba/ui`): `<scriba-toolbar>`, `<scriba-menubar>`, `contextMenu(view, {
sections })` per il tasto destro, `clipboardItems` (taglia, copia, incolla), `historyItems`,
`markItems`, `blockStyleMenu`.

## Lavoro di gruppo e AI

| Pacchetto            | A cosa serve                                                                       | Esportazioni principali                                                                   |
| -------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `plugin-collab`      | Collaborazione in tempo reale (Yjs) con i cursori degli altri                      | `collab`, `collabCommentStore` — vedi [Collaborazione](collaborazione.md)                 |
| `plugin-comments`    | Commenti con discussioni e modifiche proposte (revisioni)                          | `commentMarks`, `commentsPlugin`, `commentsPanel`, `suggestionMarks`, `suggestionsPlugin` |
| `plugin-permissions` | Blocchi protetti (non modificabili da alcuni utenti), controllati anche sul server | `withBlockIds`, `blockPermissions`                                                        |
| `plugin-ai`          | Assistente AI con il tuo backend: testo, blocchi generati, più versioni            | vedi la [guida AI](../packages/plugins/ai/README.md)                                      |

## Ordine e priorità delle scorciatoie

Più plugin possono reagire allo stesso tasto (Invio in un elenco, in una tabella, nel menu "/").
Dai priorità più alte ai contesti più specifici. L'ordine usato nella demo, dal più alto:

| Priorità | Scorciatoie                                                                            |
| -------- | -------------------------------------------------------------------------------------- |
| 110      | menu "/" e menzioni (quando sono aperti)                                               |
| 90       | assistente AI                                                                          |
| 80       | file, trova, schermo intero, commenti, aiuto (anche in sola lettura: `readOnly: true`) |
| 70       | immagini, attività                                                                     |
| 60       | blocchi di codice                                                                      |
| 55       | tabelle                                                                                |
| 50       | elenchi                                                                                |
| default  | stili, link, cronologia, formattazione, `baseKeymap` (per ultimo)                      |

## Scrivere un plugin

Un plugin di Scriba è codice normale che usa le stesse API dei plugin inclusi: nodi o mark per lo
schema, comandi `(state, dispatch?) => boolean`, un `Plugin` per stato e decorazioni, voci di
toolbar che chiamano i comandi. I plugin inclusi sono il riferimento: `plugin-hr` e
`plugin-datetime` sono i più piccoli da leggere. Ricorda le regole di sicurezza: niente
`innerHTML`, attributi validati nello schema, contenuto esterno sempre dal parser.
