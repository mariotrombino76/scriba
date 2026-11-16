**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-bubble

**Bubble menu** for the Scriba editor: a small formatting bar that appears above the selected
text (bold, link, comment…). TinyMCE calls it "quickbars" / selection toolbar.

## Installation

```bash
pnpm add @scriba-editor/plugin-bubble
```

## Usage

```ts
import { bubbleKeymap, bubbleMenu } from '@scriba-editor/plugin-bubble'
import { markItems } from '@scriba-editor/ui'
import { linkToolbarItems } from '@scriba-editor/plugin-link'

const state = EditorState.create({
  schema,
  plugins: [
    bubbleMenu({
      items: [...markItems(schema), ...linkToolbarItems(schema, t)],
      t,
      mac: false,
    }),
    keymap(bubbleKeymap(), { priority: 80, readOnly: true }),
    // …
  ],
})
```

## Options (`BubbleMenuOptions`)

| Option  | Description                                                            |
| ------- | ---------------------------------------------------------------------- |
| `items` | The bar controls (`ToolbarItem[]`), the same as in the main toolbar.   |
| `t`     | Translator from `@scriba-editor/i18n` (bar label: key `bubble.label`). |
| `mac`   | Whether to show shortcuts as ⌘ (default: platform detection).          |

## Exports

- `bubbleMenu(options)`: the plugin; the bar is a normal `scriba-toolbar` with the class
  `scriba-bubble`.
- `bubbleKeymap()`: the **Alt+F10** shortcut, which moves focus into the bar when it is visible.
- Type `BubbleMenuOptions`.

## Behavior and accessibility

- It appears with a non-empty text selection and focus in the editor (or in the bar).
- It does not appear while the mouse is still selecting, in code blocks, or when the editor is
  read-only. Users who can only comment (`canAnnotate`) see it, with only the allowed controls
  enabled.
- It is positioned above the selection, or below if there is not enough room; after a touch it
  goes **below**, leaving the space above free for the system menu (copy, paste).
- Keyboard: Alt+F10 enters the bar; a single tab stop, arrow keys to move, Esc goes back to the
  text. Esc in the editor closes the bar as long as the selection stays the same.
- It has `role="toolbar"` and `aria-pressed` state like the main toolbar; see
  [accessibility](../../../docs/accessibility.md).

## Notes

- Positioning uses the CSSOM (`style.top`, `style.left`), compatible with a strict CSP
  ([security](../../../docs/security.md)).
- The plugin does not know the commands of individual plugins: you pass it the items. See
  [plugins](../../../docs/plugins.md).
