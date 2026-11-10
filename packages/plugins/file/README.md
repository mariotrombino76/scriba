# @scriba-editor/plugin-file

Il menu "File" dell'editor Scriba: nuovo documento, apri (`.docx`, `.html`, `.md`, `.txt`), scarica
(`.html`, `.md`, `.txt`, `.docx`), anteprima e stampa. Come il menu File di TinyMCE, ma con
apertura e salvataggio di file veri, tutto nel browser: **nessun dato lascia la pagina**.

```bash
pnpm add @scriba-editor/plugin-file
```

## Uso

```ts
import { keymap } from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { fileKeymap, fileMenu, filePlugin, type FileOptions } from '@scriba-editor/plugin-file'

const t = createTranslator('it')
const fileOptions: FileOptions = { t }

// nello stato dell'editor
plugins: [
  filePlugin(fileOptions),
  keymap(fileKeymap(fileOptions), { priority: 80, readOnly: true }),
]

// nella barra dei menu: le voci hanno id new, open, preview, save-html, save-docx,
// save-markdown, save-text, print
const menu = fileMenu(fileOptions) // ToolbarMenu con `entries`
```

Il keymap va registrato con `readOnly: true`: salvare e stampare funzionano anche in sola lettura
(aprire un file no).

## Opzioni (`FileOptions`)

| Opzione            | Descrizione                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| `t`                | Traduttore (obbligatorio).                                                            |
| `defaultTitle`     | Titolo e nome del file quando il documento non ne ha (default: "Documento" tradotto). |
| `saveFormat`       | Formato di Ctrl/Cmd+S: `'html'` (default), `'markdown'`, `'text'`, `'docx'`.          |
| `lang`             | Lingua scritta nelle pagine HTML salvate (default `'it'`).                            |
| `onNewDocument`    | "Nuovo documento" nella tua app (crea il documento sul server e mostralo).            |
| `maxFileBytes`     | File più grande accettato in apertura (default 10 MB).                                |
| `maxUnzippedBytes` | Contenuto decompresso massimo di un `.docx` (default 50 MB, protegge dalle zip bomb). |
| `maxZipEntries`    | Voci massime in un `.docx` (default 2000).                                            |

Senza `onNewDocument`, "Nuovo documento" svuota quello corrente (i blocchi protetti da
`blockPermissions` lo rifiutano: l'utente vede il motivo in un dialogo).

## Esportazioni

| Nome                                                                                                              | Cosa fa                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `filePlugin(options)`                                                                                             | Tiene traccia delle modifiche non salvate; apre i file trascinati sull'editor. |
| `fileKeymap(options)`                                                                                             | Ctrl/Cmd+O apri, Ctrl/Cmd+S scarica, Ctrl/Cmd+P stampa.                        |
| `fileMenu(options)`                                                                                               | Il menu "File" con tutte le voci.                                              |
| `openFile`, `chooseFile`, `newDocument`, `saveDocument`                                                           | Le azioni, richiamabili da codice.                                             |
| `hasUnsavedChanges(state)`                                                                                        | `true` se ci sono modifiche dall'ultima apertura, creazione o salvataggio.     |
| `readDocument(schema, file, limits)`, `formatOf`, `OpenFileError`, `OPEN_ACCEPT`                                  | Lettura di un file in un documento.                                            |
| `documentBlob`, `documentTitle`, `documentToHTMLFile`, `documentToText`, `documentToDocx`, `download`, `fileName` | Scrittura dei formati.                                                         |
| `openPreview`, `printDocument`, `renderDocument`                                                                  | Anteprima e stampa.                                                            |

## Comportamento

- Prima di sostituire il documento (apri, nuovo) l'editor chiede conferma se ci sono modifiche non
  salvate; il pulsante predefinito è quello sicuro ("Annulla").
- La sostituzione è **un solo passo annullabile** (Ctrl+Z).
- Il titolo del file è il primo titolo del documento (o la prima riga), ripulito dai caratteri
  vietati nei nomi di file.
- Le pagine HTML salvate hanno un'interruzione di pagina in stampa per `hr.scriba-page-break`
  (vedi `@scriba-editor/plugin-hr`).
- La stampa aggiunge una copia del solo documento alla pagina; il browser permette anche di salvare
  in PDF.
- Il supporto `.docx` (lettura con `mammoth`, scrittura con `jszip`) viene caricato solo quando serve.

## Sicurezza

Un file aperto è **input non fidato**:

- HTML e `.docx` (che diventa HTML) passano da un documento inerte e dal parser dello schema, con
  limiti di profondità (64) e di nodi (100 000), come un incolla; ciò che lo schema non conosce
  viene scartato. Il Markdown passa da `parseMarkdown` (HTML grezzo non ammesso).
- Il tipo è deciso dall'**estensione** (quello dichiarato dal browser non è affidabile); i file di
  altro tipo sono rifiutati.
- Dimensione, numero di voci e dimensione decompressa di un `.docx` sono controllati **prima** di
  decomprimere; i collegamenti a file esterni di un `.docx` non vengono mai letti.
- I file salvati sono generati dal serializzatore con escape, mai copiati dal DOM.
- Il controllo lato client non sostituisce quello del server: l'HTML salvato va comunque ripassato da
  `@scriba-editor/sanitize-server`. Vedi [sicurezza](../../../docs/sicurezza.md).

## Accessibilità

Apertura, salvataggio ed errori sono annunciati ai lettori di schermo (area `status`, o `alert` per
gli errori). I dialoghi (conferma, anteprima, blocco) sono modali con focus trap e il focus torna
all'editor alla chiusura; l'anteprima è scorrevole da tastiera. Vedi
[accessibilità](../../../docs/accessibilita.md) e [plugin](../../../docs/plugin.md).
