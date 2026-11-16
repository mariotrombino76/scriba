**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-format-painter

The **format painter** for the Scriba editor: it copies the formatting of one piece of text and
applies it to another, like the "Format painter" in TinyMCE and Word.

```bash
pnpm add @scriba-editor/plugin-format-painter
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  formatPainter,
  formatPainterItem,
  formatPainterKeymap,
} from '@scriba-editor/plugin-format-painter'

// in the editor state
plugins: [formatPainter(t), keymap(formatPainterKeymap(), { priority: 85 })]

// in the Format menu or in the toolbar
const item = formatPainterItem()
```

## How to use it

1. Put the cursor in (or select) the text whose look you want to copy.
2. Press the "Format painter" button (or Ctrl/Cmd+Alt+C to copy only).
3. Click a word or select some text: it gets the same formatting, **in a single undoable
   step**. With the cursor inside a word, it formats that word (or the text typed afterwards).
4. Esc, or pressing the button again, stops waiting without changing anything.

What gets copied: the formatting _marks_ (bold, italic, colors, font…) and the look of the block
(alignment, indentation, line height, direction, class). A paragraph can become a heading and
vice versa. Links and comments are **not** copied, nor removed from the target text.

## Options (`formatPainter(t, options?)`)

| Option       | Description                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `marks`      | `(type) => boolean`: which marks are copied (default `isFormattingMark` from `@scriba-editor/ui`).                                     |
| `blockAttrs` | Block attributes copied, if both blocks have them (default `align`, `indent`, `lineHeight`, `dir`, `className`). Never `id`/`blockId`. |
| `blockTypes` | Block types that can turn into each other (default `paragraph`, `heading`).                                                            |

## Exports

| Name                                                 | What it does                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `formatPainter(t, options?)`                         | The plugin (state, screen reader region, mouse clicks).                                                     |
| `formatPainterKeymap()`                              | Shortcuts (see below).                                                                                      |
| `formatPainterItem()`                                | Button, `aria-pressed` while it waits for the text to format.                                               |
| `copyFormat`, `pasteFormat`                          | Commands: copy / apply the format.                                                                          |
| `toggleFormatPainter`, `cancelFormatPainter`         | Commands: turn waiting on or off.                                                                           |
| `isFormatPainterArmed(state)`, `copiedFormat(state)` | Current state.                                                                                              |
| `formatPainterKey`, `PAINTING_CLASS`                 | Plugin key and the `scriba-format-painting` class on the editor while it waits (the theme sets the cursor). |

## Shortcuts

| Key            | Action                      |
| -------------- | --------------------------- |
| Ctrl/Cmd+Alt+C | Copy the formatting         |
| Ctrl/Cmd+Alt+V | Apply the copied formatting |
| Esc            | Stop waiting                |

## Accessibility

The button has `aria-pressed`; a hidden `status` region announces "on" and "off", and everything
can be reached from the keyboard (copy/apply) without the mouse. The button and the shortcuts do
not change the text, only the marks and attributes allowed by the schema: no free-form styles.
See [accessibility](../../../docs/accessibility.md) and [plugins](../../../docs/plugins.md).
