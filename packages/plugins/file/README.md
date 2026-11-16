**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-file

The "File" menu of the Scriba editor: new document, open (`.docx`, `.html`, `.md`, `.txt`),
download (`.html`, `.md`, `.txt`, `.docx`), preview and print. Like the TinyMCE File menu, but
with opening and saving of real files, all in the browser: **no data leaves the page**.

```bash
pnpm add @scriba-editor/plugin-file
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { fileKeymap, fileMenu, filePlugin, type FileOptions } from '@scriba-editor/plugin-file'

const t = createTranslator('it')
const fileOptions: FileOptions = { t }

// in the editor state
plugins: [
  filePlugin(fileOptions),
  keymap(fileKeymap(fileOptions), { priority: 80, readOnly: true }),
]

// in the menu bar: the items have the ids new, open, preview, save-html, save-docx,
// save-markdown, save-text, print
const menu = fileMenu(fileOptions) // ToolbarMenu with `entries`
```

Register the keymap with `readOnly: true`: saving and printing also work in read-only mode
(opening a file does not).

## Options (`FileOptions`)

| Option             | Description                                                                        |
| ------------------ | ---------------------------------------------------------------------------------- |
| `t`                | Translator (required).                                                             |
| `defaultTitle`     | Title and file name when the document has none (default: "Document", translated).  |
| `saveFormat`       | Format for Ctrl/Cmd+S: `'html'` (default), `'markdown'`, `'text'`, `'docx'`.       |
| `lang`             | Language written into saved HTML pages (default `'it'`).                           |
| `onNewDocument`    | "New document" in your app (create the document on the server and show it).        |
| `maxFileBytes`     | Largest file accepted when opening (default 10 MB).                                |
| `maxUnzippedBytes` | Maximum unzipped content of a `.docx` (default 50 MB, protects against zip bombs). |
| `maxZipEntries`    | Maximum entries in a `.docx` (default 2000).                                       |

Without `onNewDocument`, "New document" empties the current one (blocks protected by
`blockPermissions` refuse it: the user sees the reason in a dialog).

## Exports

| Name                                                                                                              | What it does                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `filePlugin(options)`                                                                                             | Tracks unsaved changes; opens files dropped onto the editor.       |
| `fileKeymap(options)`                                                                                             | Ctrl/Cmd+O open, Ctrl/Cmd+S download, Ctrl/Cmd+P print.            |
| `fileMenu(options)`                                                                                               | The "File" menu with all the items.                                |
| `openFile`, `chooseFile`, `newDocument`, `saveDocument`                                                           | The actions, callable from code.                                   |
| `hasUnsavedChanges(state)`                                                                                        | `true` if there are changes since the last open, creation or save. |
| `readDocument(schema, file, limits)`, `formatOf`, `OpenFileError`, `OPEN_ACCEPT`                                  | Reading a file into a document.                                    |
| `documentBlob`, `documentTitle`, `documentToHTMLFile`, `documentToText`, `documentToDocx`, `download`, `fileName` | Writing the formats.                                               |
| `openPreview`, `printDocument`, `renderDocument`                                                                  | Preview and print.                                                 |

## Behavior

- Before replacing the document (open, new) the editor asks for confirmation if there are
  unsaved changes; the default button is the safe one ("Cancel").
- The replacement is **a single undoable step** (Ctrl+Z).
- The file title is the first heading of the document (or the first line), cleaned of the
  characters not allowed in file names.
- Saved HTML pages have a page break when printed for `hr.scriba-page-break` (see
  `@scriba-editor/plugin-hr`).
- Printing adds a copy of the document alone to the page; the browser also lets you save as PDF.
- `.docx` support (reading with `mammoth`, writing with `jszip`) is loaded only when needed.

## Security

An opened file is **untrusted input**:

- HTML and `.docx` (which becomes HTML) go through an inert document and the schema parser, with
  depth (64) and node (100,000) limits, like a paste; whatever the schema does not know is
  dropped. Markdown goes through `parseMarkdown` (raw HTML not allowed).
- The type is decided by the **extension** (the one declared by the browser is not reliable);
  files of other types are rejected.
- Size, number of entries and unzipped size of a `.docx` are checked **before** unzipping; links
  to external files in a `.docx` are never read.
- Saved files are generated by the serializer with escaping, never copied from the DOM.
- The client-side check does not replace the server-side one: saved HTML must still go through
  `@scriba-editor/sanitize-server`. See [security](../../../docs/security.md).

## Accessibility

Opening, saving and errors are announced to screen readers (`status` region, or `alert` for
errors). The dialogs (confirmation, preview, lock) are modal with a focus trap and focus returns
to the editor on close; the preview can be scrolled with the keyboard. See
[accessibility](../../../docs/accessibility.md) and [plugins](../../../docs/plugins.md).
