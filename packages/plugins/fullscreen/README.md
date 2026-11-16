**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-fullscreen

**Fullscreen** mode for the Scriba editor: the container (toolbar, writing area, status bar)
covers the window and the page underneath stops scrolling. Like TinyMCE's "Fullscreen" button.

```bash
pnpm add @scriba-editor/plugin-fullscreen
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  Fullscreen,
  fullscreenKeymap,
  fullscreenToolbarItem,
} from '@scriba-editor/plugin-fullscreen'

// the container with toolbar, writing area and status bar
const fullscreen = new Fullscreen(document.getElementById('app')!)

// in the editor state
plugins: [keymap(fullscreenKeymap(fullscreen), { priority: 80, readOnly: true })]

// in the toolbar or the View menu
const button = fullscreenToolbarItem(fullscreen)
```

The keymap must be registered with `readOnly: true`: fullscreen also works in read-only mode.

## Exports

| Name                                | What it does                                               |
| ----------------------------------- | ---------------------------------------------------------- |
| `new Fullscreen(target)`            | Manages fullscreen for the `target` container.             |
| `fullscreen.active`                 | `true` if fullscreen is active.                            |
| `fullscreen.toggle(view, on?)`      | Turns it on, off, or toggles it; the editor keeps focus.   |
| `fullscreenKeymap(fullscreen)`      | Shortcuts (see below).                                     |
| `fullscreenToolbarItem(fullscreen)` | Button with `aria-pressed`, also usable in read-only mode. |
| `FULLSCREEN_META`                   | Metadata key of the transaction that updates the toolbar.  |

## Shortcuts

| Key              | Action                       |
| ---------------- | ---------------------------- |
| Ctrl/Cmd+Shift+F | Turns fullscreen on or off   |
| Esc              | Exits (only if it is active) |

## Notes

- It is only **CSS classes**: `scriba-fullscreen` on the container and `scriba-fullscreen-open` on
  `<html>`. The styles live in `@scriba-editor/themes`.
- It does not use the browser's Fullscreen API: no permission prompts, it works in iframes and with
  a strict CSP (no inline styles).
- On exit, the page returns to the scroll position it had.
- The state change dispatches an empty transaction with metadata, so the toolbar updates the
  pressed button.

For keyboard and focus see [accessibility](../../../docs/accessibility.md); to write a similar
plugin, [plugins](../../../docs/plugins.md).
