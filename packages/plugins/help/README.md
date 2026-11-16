**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-help

The "Help" menu of the Scriba editor: a dialog with **all the keyboard shortcuts**, split into
groups and with a search field. Like TinyMCE's "Help" dialog (Alt+0), but the list builds itself
from the buttons and menus that are actually present, so it never goes out of sync.

```bash
pnpm add @scriba-editor/plugin-help
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  editingHelp,
  helpItem,
  helpKeymap,
  markdownHelp,
  navigationHelp,
  shortcutsFromItems,
  type HelpOptions,
} from '@scriba-editor/plugin-help'

const helpOptions: HelpOptions = {
  t,
  // read when the dialog opens: the groups reflect the buttons and menus at that moment
  groups: () => [
    shortcutsFromItems([...toolbar.items, ...menubar.menus.flatMap((m) => m.items)]),
    editingHelp({ slash: true, mentions: true }),
    markdownHelp(),
    navigationHelp({ bubble: true, contextMenu: true }),
  ],
}

// in the editor state
plugins: [keymap(helpKeymap(helpOptions), { priority: 80, readOnly: true })]

// in the Help menu
const entry = helpItem(helpOptions)
```

## Options (`HelpOptions`)

| Option   | Description                                                                       |
| -------- | --------------------------------------------------------------------------------- |
| `t`      | Translator (required).                                                            |
| `groups` | The groups to show, in order: an array, or a function read when the dialog opens. |
| `mac`    | Key notation (Cmd/Ctrl); detected if missing.                                     |

## Ready-made groups

| Function                                    | Content                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `shortcutsFromItems(items)`                 | The shortcuts of buttons and menus, with their labels; each combination appears only once.        |
| `editingHelp({ slash?, mentions? })`        | Keys without a button: line break, paste without formatting, Tab, Shift+Tab; `/` and `@` if used. |
| `markdownHelp()`                            | The Markdown shortcuts of `@scriba-editor/plugin-markdown` (`# `, `- `, `**text**`, …).           |
| `navigationHelp({ bubble?, contextMenu? })` | Arrow keys, Esc, Alt+F10 (toolbar on the selection), Shift+F10 (context menu).                    |

A group is `HelpGroup { id, title, shortcuts }` and a row is `HelpShortcut { keys?, typed?, label }`
(`keys` are combinations such as `"Mod-b"`, `typed` is the text to type): you can add your own.

## Exports

`helpItem(options)` ("Keyboard shortcuts…" item, enabled in read-only mode too),
`helpKeymap(options)`, `openHelpDialog(view, options)`, `shortcutsFromItems`, `editingHelp`,
`markdownHelp`, `navigationHelp`, types `HelpOptions`, `HelpGroup`, `HelpShortcut`.

## Shortcut

| Key   | Action                     |
| ----- | -------------------------- |
| Alt+0 | Opens the shortcuts dialog |

Register the keymap with `readOnly: true`.

## Accessibility

Modal dialog with a focus trap; focus returns to the editor on close. The search field is
labeled and filters the rows; the scrollable area has `role="region"` and is reachable from the
keyboard, each group is a table with a header; "no results" is announced (`role="status"`). The
dialog is built only with `createElement` and `textContent`. See
[accessibility](../../../docs/accessibility.md) and [plugins](../../../docs/plugins.md).
