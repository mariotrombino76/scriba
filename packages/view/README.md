**English** · [Italiano](README.it.md)

# @scriba-editor/view

The "shop window" of Scriba: it shows an `EditorState` in the browser with a controlled
`contentEditable`, intercepts `beforeinput`, handles IME composition and syncs the selection
between the DOM and the model.

```bash
pnpm add @scriba-editor/view @scriba-editor/core
```

`@scriba-editor/view` does not know specific plugins: it talks to the core through state and
transactions.

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
} from '@scriba-editor/core'
import { EditorView, parseContent, serializeContent } from '@scriba-editor/view'
import '@scriba-editor/themes/scriba.css'

const state = EditorState.create({
  doc: parseContent(basicSchema, '<p>Hello</p>', 'html'),
  plugins: [
    history(),
    keymap(historyKeymap),
    keymap(formatKeymap(basicSchema)),
    keymap(baseKeymap),
  ],
})

const view = new EditorView(document.querySelector('#editor')!, {
  state,
  label: 'Rich text editor',
  // optional: you apply and show the new transaction yourself
  // dispatchTransaction(tr) { this.updateState(this.state.apply(tr)) },
})

// to save
const html = serializeContent(view.state.doc, 'html')
```

## `EditorView`

`new EditorView(place, options)` creates the `contentEditable` element (class `scriba-editor`,
`role="textbox"`, `aria-multiline="true"`) inside `place`. The browser never changes the DOM on
its own: every input becomes a transaction and the DOM is updated from the model, only in the
changed blocks.

| Option                | Meaning                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `state`               | The initial `EditorState` (required).                                          |
| `dispatchTransaction` | Receives every transaction. Default: `view.updateState(view.state.apply(tr))`. |
| `editable`            | `(state) => boolean`: whether the content can be edited. Default: always.      |
| `canAnnotate`         | `(state) => boolean`: in read-only mode, whether commenting is still allowed.  |
| `label`               | Accessible name of the area (`aria-label`).                                    |
| `nodeViews`           | Custom views for atomic nodes, by type name (see `NodeViewFactory`).           |

Main members: `state`, `dom`, `dispatch(tr)`, `updateState(state)`, `subscribe(listener)`
(returns the function to unsubscribe), `focus()`, `hasFocus()`, `editable`,
`posAtCoords(x, y)`, `posAtDOM(node, offset)`, `domAtPos(pos)`, `destroy()`.

## Content: HTML or JSON

| Function                              | Description                                                     |
| ------------------------------------- | --------------------------------------------------------------- |
| `parseContent(schema, value, format)` | Builds a document from HTML (`'html'`) or JSON (`'json'`).      |
| `serializeContent(doc, format)`       | Serializes the document (HTML string or JSON object).           |
| `sameContent(a, b)`                   | Structural equality of two contents (avoids loops in wrappers). |
| `Content`, `ContentFormat`            | Types: `string \| NodeJSON` and `'html' \| 'json'`.             |

Other exports: `renderSpec`, `parseInertHTML`, `TRUSTED_TYPES_POLICY`, `DecorationIndex`,
`stateDecorations`, `someProp`, the types `NodeView`, `NodeViewFactory`, `PluginView`,
`ViewPluginProps`, `ClipboardContent`, `TransformPastedDOM`.

## Security

- Incoming content (`parseContent`, paste, source view, drag and drop) is **untrusted input**:
  the HTML is read with `parseInertHTML` in an **inert document** (`DOMParser`, never
  `innerHTML` in the live page) and rebuilt by the schema parser; whatever the schema does not
  know is dropped. JSON is validated by `schema.nodeFromJSON`.
- Dynamic styles go through the CSSOM (`el.style…`), never through `style` attributes or
  injected `<style>` tags: the editor works with a strict CSP.
- With `require-trusted-types-for 'script'`, allow the `scriba` policy
  (`TRUSTED_TYPES_POLICY`) in the `trusted-types` directive: it is used only to read HTML in an
  inert document.
- Outgoing HTML is generated from the document, but the **saved** HTML must always go through
  `@scriba-editor/sanitize-server` on the server.

Details: [Security](../../docs/security.md), [Accessibility](../../docs/accessibility.md),
[Concepts](../../docs/concepts.md).
