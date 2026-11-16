**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-find-replace

Find and replace for the Scriba editor, with match highlighting in the text, case-sensitive search,
whole word and **regular expressions**. Like the TinyMCE "Search and Replace" plugin, but with
regexes run safely (see below).

```bash
pnpm add @scriba-editor/plugin-find-replace
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  findReplaceKeymap,
  findReplacePlugins,
  findReplaceToolbarItem,
} from '@scriba-editor/plugin-find-replace'

// in the editor state
plugins: [...findReplacePlugins(), keymap(findReplaceKeymap(t), { priority: 80, readOnly: true })]

// in the toolbar or in the Edit menu
const find = findReplaceToolbarItem(t)
```

Register the keymap with `readOnly: true`: search also works in read-only mode (replace stays
disabled).

## Exports

| Name                                                                                          | What it does                                                |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `findReplacePlugins()`                                                                        | State and decorations for the highlighted matches.          |
| `findReplaceKeymap(t, options?)`                                                              | Ctrl/Cmd+F opens the panel (instead of the browser search). |
| `findReplaceToolbarItem(t, options?)`                                                         | "Find and replace" button (search icon).                    |
| `openFindPanel`, `FindPanel`                                                                  | The panel, which you can open from code.                    |
| `SearchRunner`, `WORKER_POLICY`                                                               | Runs the searches (regexes in a Web Worker).                |
| `compileQuery`, `searchTexts`, `expandReplacement`, `MAX_QUERY_LENGTH`, `DEFAULT_MAX_MATCHES` | The search engine, pure functions on strings.               |
| `findKey`, `getFindState`, `blockTexts`, `toMatches`                                          | Access to the match state.                                  |

`options` (`FindReplaceOptions`):

| Option         | Description                                                      |
| -------------- | ---------------------------------------------------------------- |
| `timeout`      | Maximum time for a regex search, in ms (default 1000).           |
| `maxMatches`   | Maximum number of matches reported (default 10 000).             |
| `createWorker` | Custom worker factory, if your bundler needs a different syntax. |

## Panel

A **non-modal** dialog: the document stays visible and editable. "Find" and "Replace with" fields,
options (match case, whole word, regular expression), previous/next buttons, replace and replace
all.

| Key                               | Action                                                       |
| --------------------------------- | ------------------------------------------------------------ |
| Ctrl/Cmd+F                        | Opens (or moves focus to) the panel                          |
| Enter / Shift+Enter               | Next / previous match (in the "Find" field)                  |
| Enter in the "Replace with" field | Replaces the current match                                   |
| Esc                               | Closes the panel and selects the current match in the editor |

With regexes, the replacement supports `$&` (the whole match), `$1`…`$99` (groups) and `$$` (a
dollar sign). With plain text the replacement is literal.

## Security

A regex written by the user can be "catastrophic" and freeze the page (ReDoS). For this reason:

- plain text is always searched as an escaped string (linear time);
- regular expressions run in a **Web Worker** that is terminated when the time limit (`timeout`)
  expires: the user sees a message and the page does not freeze;
- the search length is limited to 500 characters and the matches to `maxMatches`;
- empty matches are ignored (`a*` does not loop forever).

If your CSP has a `trusted-types` directive, allow the `scriba-worker` policy; if workers cannot be
used, regex searches do not start (a message is shown) while plain text keeps working. See
[security](../../../docs/security.md).

## Accessibility

The number of matches ("3 of 12") is in a `status` region linked to the field with
`aria-describedby`; the panel has a title and labeled fields, is keyboard-usable, and Esc returns
focus to the editor. See [accessibility](../../../docs/accessibility.md) and
[plugins](../../../docs/plugins.md).
