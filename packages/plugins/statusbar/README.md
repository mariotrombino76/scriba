**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-statusbar

The TinyMCE status bar: **element path** (`ul › li › p › strong`) and **resize handle** for the
editor. They are not editor plugins but two DOM elements that you put below the editor; they sit
next to the word count of [@scriba-editor/plugin-word-count](../word-count/README.md).

```bash
pnpm add @scriba-editor/plugin-statusbar
```

## Usage

```ts
import { createElementPath, createResizeHandle } from '@scriba-editor/plugin-statusbar'
import { createWordCountStatus } from '@scriba-editor/plugin-word-count'

const statusbar = document.createElement('div')
statusbar.className = 'scriba-statusbar'
statusbar.append(createElementPath(view, t).el, createWordCountStatus(view, t).el)
statusbar.append(createResizeHandle(view, t, { minHeight: 160 }).el)
editorContainer.after(statusbar)
```

Each function returns `{ el, destroy() }`: call `destroy()` when you remove the bar (it also
removes the listener on the view).

## Exports

| Name                                    | What it does                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createElementPath(view, t)`            | `<nav>` with the path: first the blocks around the cursor (outermost first), then the marks active at the cursor |
| `elementPath(state)`                    | The same list as data (`PathEntry`: `tag`, `pos`, with `pos` null for marks)                                     |
| `createResizeHandle(view, t, options?)` | Button to change the editor height                                                                               |
| `ResizeOptions`                         | `minHeight` (default 120 px), `maxHeight` (default no limit), `step` (default 20 px per arrow press)             |
| `SIZED_CLASS`                           | `scriba-sized` class set on the editor when it has a set height (it then scrolls inside)                         |

## Keyboard

**Path**: a single tab stop (the current block, `aria-current="location"`); Left/Right arrow
keys, Home and End move between blocks; click or Enter on a block selects it entirely and puts
focus back in the text.

**Handle**: drag with mouse, pen or touch; Up/Down arrow keys change the height by `step`
pixels, Page Up/Page Down by five times as much; double-click or Esc restores the natural height.

## Accessibility

The path is a `<nav>` labeled "Element path" (`path.label`) with buttons titled "Select {tag}";
the handle is a `<button>` with an `aria-label` that explains the keys (`resize.label`), so it
can be used with the keyboard alone.

## Notes

- Tag names come from the schema's `toHTML`, validated with `^[a-z][a-z0-9-]*$` (otherwise the
  node name is used) and inserted as text.
- The height is set through the CSSOM (`el.style.height`), without a `style` attribute:
  compatible with a strict CSP.

See [plugins](../../../docs/plugins.md) and [accessibility](../../../docs/accessibility.md).
