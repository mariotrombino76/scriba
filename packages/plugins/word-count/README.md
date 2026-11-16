**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-word-count

Word and character count like the TinyMCE `wordcount` plugin: a counter in the status bar and a
dialog with the numbers for the document and the selection.

```bash
pnpm add @scriba-editor/plugin-word-count
```

## Usage

```ts
import { createWordCountStatus, openWordCountDialog } from '@scriba-editor/plugin-word-count'

// counter in the status bar (a button that opens the dialog)
statusbar.append(createWordCountStatus(view, t).el)

// "Word count" menu item
const wordCountItem: ToolbarButton = {
  type: 'button',
  id: 'wordcount',
  label: (tr) => tr('wordcount.title'),
  command: () => true,
  readOnly: true,
  run: (v) => void openWordCountDialog(v, t),
}
```

## Exports

| Name                                       | What it does                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `createWordCountStatus(view, t, options?)` | "N words" button; returns `{ el, destroy() }`                                                   |
| `openWordCountDialog(view, t, options?)`   | Dialog with words, characters and characters without spaces, for the document and the selection |
| `WordCountOptions`                         | `locale` (default: the page language), `delay` (ms of pause before counting again, default 300) |
| `countString(text, locale?)`               | `{ words, characters, charactersNoSpaces }` of a text                                           |
| `countWords(text, locale?)`                | Words only (faster)                                                                             |
| `countRange(doc, from?, to?, locale?)`     | Count of a document range                                                                       |
| `countState(state, locale?)`               | `{ document, selection }`; `selection` is `null` if there is no selection                       |
| `rangeText(doc, from?, to?)`               | Plain text of a range: blocks, line breaks and images separate words                            |
| `TextCount`                                | Result type                                                                                     |

## How it counts

Words come from `Intl.Segmenter` when available, so it also works for languages without spaces
such as Japanese (otherwise a fallback rule on letters and digits, with inner apostrophes and
hyphens: "l'albero", "e-mail"). Characters are the ones people perceive (an emoji or "é" counts
as one), including spaces but not line breaks. The counter updates when you stop typing
(`delay`), so it stays smooth in large documents.

## Accessibility

The counter is a `<button>` reachable from the keyboard; the dialog has a focus trap, returns
focus to the editor and shows the numbers in a real table with column and row headers
(`scope`). Singular and plural ("1 word", "2 words") are translated, and numbers follow the
language's format.

## Notes

The text is computed from the document (never from the DOM) and shown as text. See
[plugins](../../../docs/plugins.md) and [accessibility](../../../docs/accessibility.md). It sits
next to the path and the resize handle of
[@scriba-editor/plugin-statusbar](../statusbar/README.md).
