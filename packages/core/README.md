**English** · [Italiano](README.it.md)

# @scriba-editor/core

The heart of Scriba: schema-based document model, transactions, selection, commands and plugin
API. It **never touches the DOM** and does not depend on any framework: it works in Node too.

```bash
pnpm add @scriba-editor/core
```

You usually use it together with `@scriba-editor/view` (rendering in the browser) and the
plugins; the `@scriba-editor/vue`, `@scriba-editor/react` and `@scriba-editor/browser` wrappers
already include it. How it works inside, in plain words: [Concepts](../../docs/concepts.md).

## Usage

```ts
import {
  EditorState,
  basicSchema,
  history,
  keymap,
  historyKeymap,
  formatKeymap,
  baseKeymap,
  toggleMark,
  serializeHTML,
} from '@scriba-editor/core'

const state = EditorState.create({
  schema: basicSchema,
  plugins: [
    history(),
    keymap(historyKeymap),
    keymap(formatKeymap(basicSchema)),
    keymap(baseKeymap),
  ],
})

// a transaction is a "move": the old document stays intact
const tr = state.tr.insertText('Hello', 1)
const next = state.apply(tr)

// a command without `dispatch` only tells whether it can run
const bold = toggleMark(basicSchema.marks.bold!)
bold(next) // true/false
serializeHTML(next.doc) // '<p>Hello</p>'
```

## The main parts

| Part         | Main exports                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| Schema       | `Schema`, `NodeType`, `MarkType`, `NodeSpec`, `MarkSpec`, `basicSchema`, `basicSchemaSpec`                    |
| Document     | `Node`, `Fragment`, `Mark`, `Slice`, `ResolvedPos` (immutable trees, integer positions)                       |
| Transactions | `Transform`, `Transaction`, `Step`, `ReplaceStep`, `AddMarkStep`, `RemoveMarkStep`, `SetAttrsStep`, `Mapping` |
| State        | `EditorState`, `Selection`, `TextSelection`, `NodeSelection`, `AllSelection`                                  |
| Plugins      | `Plugin`, `PluginKey`, `PluginSpec`, `StateField`                                                             |
| Commands     | `Command`, `chainCommands`, `toggleMark`, `setBlockType`, `wrapIn`, `lift`, `splitBlock`, `undo`, `redo`…     |
| Shortcuts    | `keymap`, `baseKeymap`, `historyKeymap`, `formatKeymap`                                                       |
| Undo/redo    | `history`, `undo`, `redo`, `ADD_TO_HISTORY`, `CLOSE_HISTORY`                                                  |
| HTML         | `parseHTML`, `serializeHTML`, `HTMLParser`, `HTMLSerializer`, `sanitizeUrl`, `HTMLLimitError`                 |

- A **command** is a function `(state, dispatch?, view?) => boolean`: without `dispatch` it only
  answers "can it be done?" (used to enable and disable buttons).
- **Steps** are atomic and invertible: they are the basis of undo/redo and of collaboration.
- Each plugin brings its own nodes or marks (to add to the schema), its own plugins and its own
  shortcuts: see [Plugins](../../docs/plugins.md).

## Security

Incoming HTML is never copied into the document: `parseHTML(schema, root, options?)` reads it
through the schema and **drops everything the schema does not know** (disallowed tags,
attributes, styles, URLs). `root` must come from an **inert** document (`DOMParser`, never
`innerHTML` in the live page): `@scriba-editor/view` does this for you with `parseContent`. The
output of `serializeHTML` is generated from the document, with text and attribute escaping,
never copied from the DOM.

- Limits against denial of service: `HTMLParseOptions` has `maxDepth` (default 256) and
  `maxNodes` (default 200,000); if they are exceeded the parser throws `HTMLLimitError`.
- `sanitizeUrl` and the `css.ts` helpers (`normalizeColor`, `normalizeLength`…) validate URLs
  (protocol whitelist) and styles (typed attributes, no free-form `style`).
- JSON is validated with `schema.nodeFromJSON(json)`, which throws an error for everything the
  schema rejects.
- The core runs only DOM-free code: you can use it on the server too, but **saved HTML must
  always go through `@scriba-editor/sanitize-server`** with the same schema.

Details: [Security](../../docs/security.md).
