**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-visual-aids

TinyMCE visual aids: **Show blocks** (`visualblocks`) and **Show invisible characters** (`visualchars`). They are only for writing and **never end up in the HTML**.

```bash
pnpm add @scriba-editor/plugin-visual-aids
```

## Usage

```ts
import { visualAids, visualAidsItems } from '@scriba-editor/plugin-visual-aids'

const plugins = [
  visualAids(), // or visualAids({ blocks: true })
]
// in the View menu: ...visualAidsItems()
```

## Exports

| Name                                    | What it does                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visualAids(initial?)`                  | Plugin: keeps the state, puts the class on the editor and highlights the characters. `initial` is a `Partial<VisualAids>` (everything off by default)                   |
| `visualAidsItems()`                     | Two buttons for the View menu: `visual-blocks` ("Show blocks") and `visual-chars` ("Show invisible characters"), with active state and also available in read-only mode |
| `toggleVisualBlocks`                    | Command: shows or hides the block outlines                                                                                                                              |
| `toggleVisualChars`                     | Command: shows or hides non-breaking spaces and soft hyphens                                                                                                            |
| `getVisualAids(state)`, `visualAidsKey` | Current state (`{ blocks, chars }`)                                                                                                                                     |
| `SHOW_BLOCKS_CLASS`                     | `scriba-show-blocks` class on the editor: the theme draws the blocks                                                                                                    |
| `VisualAids`                            | Type of the state                                                                                                                                                       |

## How it works

- **Blocks**: the editor gets the `scriba-show-blocks` class; block outlines and names are drawn by the theme CSS (`@scriba-editor/themes`).
- **Characters**: non-breaking space (U+00A0), narrow non-breaking space (U+202F) and soft hyphen (U+00AD) are highlighted with decorations (`scriba-char-nbsp`, `scriba-char-shy`); they are computed once per document.

## Accessibility

The buttons report their active state (`isActive`) like every toolbar item and can be used from the keyboard. The decorations are visual only: they change neither the text nor what assistive technologies read.

## Notes

Nothing is written into the document or the exported HTML, so there is no impact on data security. See [plugins](../../../docs/plugins.md).
