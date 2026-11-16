**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-mention

`@person` mentions as in TinyMCE (Mentions plugin): typing `@` at the start of a line or after a space opens a list of people found **by your backend**, and choosing one inserts an atomic `mention` node.

```bash
pnpm add @scriba-editor/plugin-mention
```

## Usage

```ts
import {
  mentionKeymap,
  mentionNodes,
  mentions,
  type MentionSearch,
} from '@scriba-editor/plugin-mention'
import { keymap } from '@scriba-editor/core'

// the search calls your server (with the user's session)
const searchPeople: MentionSearch = async (query, signal) => {
  const res = await fetch(`/api/people?q=${encodeURIComponent(query)}`, { signal })
  return res.ok ? await res.json() : []
}

const schema = new Schema({ nodes: { ...basicSchemaSpec.nodes, ...mentionNodes }, marks })

const plugins = [
  ...mentions({ search: searchPeople, t }),
  keymap(mentionKeymap(), { priority: 110 }), // high priority: Enter and Tab choose the item
]
```

An item returned by `search` has the shape `{ id, label, detail? }` (`MentionItem`).

## Exports

| Name                                                                                              | What it does                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `mentionNodes`                                                                                    | Atomic inline `mention` node (attributes `id`, `label`). HTML: `<span class="scriba-mention" data-mention-id="…">@Name</span>` |
| `mentions(options)`                                                                               | Suggestion plugin: list after `@`, asynchronous search                                                                         |
| `mentionKeymap()`                                                                                 | Keys while the list is open                                                                                                    |
| `chooseMention(view, item)`                                                                       | Chooses an item from code (it has its own undo step)                                                                           |
| `closeMention(tr)`, `getMentionState(state)`, `mentionKey`, `isLoading(state)`                    | List state                                                                                                                     |
| `cleanResults(raw, max)`                                                                          | Discards invalid items, duplicate `id`s and anything beyond `max`                                                              |
| `isMentionId`, `isMentionLabel`, `labelFromText`, `MAX_ID_LENGTH` (200), `MAX_LABEL_LENGTH` (100) | Data validation                                                                                                                |
| `createSuggestion`, `SuggestConfig`, `SuggestItem`, ...                                           | Generic builder for trigger-based lists (also used by `@scriba-editor/plugin-merge-tags`)                                      |

### `mentions()` options (`MentionMenuOptions`)

| Option       | Description                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`     | `(query, signal) => Promise<MentionItem[]>`; `query` is `""` right after `@`; the `signal` is aborted if the user keeps typing or closes the list |
| `t`          | Translation function (`createTranslator` from `@scriba-editor/i18n`)                                                                              |
| `debounce`   | Pause before searching, in ms (default 150)                                                                                                       |
| `maxResults` | Maximum number of items shown (default 8, maximum 50)                                                                                             |
| `timeout`    | A slower search fails, in ms (default 10 000)                                                                                                     |

## Keyboard

With the list open: Up/Down arrow keys move the selection, Enter or Tab choose, Esc closes (the typed text stays). A space right after `@`, or after a search with no results, closes the list and you keep typing. After choosing, Ctrl+Z gives back the typed `@query` text.

## Accessibility

The list is a `listbox` below the cursor while focus stays in the text (`aria-controls` and `aria-activedescendant` on the editor); the states "Searching…", "No one found" and "Search failed" are announced as status messages.

## Security

See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).

- Results come from an **external source** and are untrusted input: `cleanResults` keeps only items with a valid `id` (1–200 characters, no spaces) and `label` (1–100 characters, one line), without control characters or direction marks.
- Name and detail are shown **as text**, never as HTML.
- The `label` is display text only: anyone can paste a mention with any name. Always resolve the `id` on the server (current name, permissions, notifications).
- Nothing is sent before the user types `@`. The server must still re-sanitize the HTML with `@scriba-editor/sanitize-server`.
