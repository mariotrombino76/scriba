**English** · [Italiano](it/concetti.md)

# Concepts

You do not need to know how Scriba works inside to use it with the ready-made components. This
page is for people who write plugins or commands, or who want to understand why the editor
behaves the way it does.

## In plain words: a LEGO house

1. **The schema** is the instruction manual: it says which bricks exist (paragraph, heading,
   list, table, image…) and where they can go (a cell goes in a row, a row in a table).
2. **The document** is the model you build: a tree of nodes that always follows the manual. It is
   never changed in place: every change produces a new document.
3. **A transaction** is a move: "take this brick out, put that one in". Since the old document
   stays intact, going back (undo) or combining the moves of two people (collaboration) is simple.
4. **The view** is the shop window: it shows the document in the page and turns key presses,
   pastes and drags into transactions.
5. **Plugins** are expansion kits: they add bricks, moves, buttons and shortcuts without touching
   the rest.

One important consequence: the HTML that comes out of Scriba is **always valid and predictable**,
because it is generated from the document, not from the page's DOM. Anything the schema does not
know (`<script>`, `onclick` attributes, free-form styles…) simply cannot get in.

## Schema

```ts
import { Schema, basicSchemaSpec } from '@scriba-editor/core'
import { tableNodes } from '@scriba-editor/plugin-table'
import { linkMarks } from '@scriba-editor/plugin-link'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...tableNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
```

- **Nodes**: blocks (`paragraph`, `heading`, `table`…) and inline nodes (`text`, `image`,
  `hard_break`). Each one declares its allowed content (`content: 'inline*'`, `'block+'`…), its
  attributes with a validator, and how it is read from HTML (`parseHTML`) and written (`toHTML`).
- **Marks**: formatting on text (`bold`, `italic`, `link`, colors…), kept separate from nodes.
- **Typed attributes**: no free-form `style`. A color is a validated attribute (`#rrggbb`,
  `rgb()`, names from a list), and a URL goes through the protocol whitelist.

## Document and positions

The document is an immutable tree. Every point has an integer **position**: you count characters
and node boundaries. In `<p>ab</p>`, position 0 is before the paragraph, 1 before "a", 3 after
"b", 4 after the paragraph.

When a transaction changes the document, positions shift: **position mapping** tells you where a
position ends up after the change (like a bookmark that follows the text). This keeps the cursor,
comments and other users' cursors in the right place.

## Transactions and steps

```ts
const tr = view.state.tr.insertText('Hello', 1).addMark(1, 6, schema.mark('bold'))
view.dispatch(tr)
```

A transaction is a list of atomic, invertible **steps** (`ReplaceStep`, `AddMarkStep`,
`RemoveMarkStep`, `SetAttrsStep`…). Undo/redo (with time-based grouping of typing) and
collaboration are built on this. After every transaction the document is **normalized** to the
schema (e.g. a table whose rows have different lengths is filled in).

## Commands

A command is a function `(state, dispatch?, view?) => boolean`:

- with `dispatch`, it performs the change;
- **without** `dispatch`, it only answers "can this be done?": this is how buttons enable and
  disable themselves.

```ts
import { toggleMark } from '@scriba-editor/core'

const bold = toggleMark(schema.marks.bold!)
bold(view.state) // true if applicable here
bold(view.state, view.dispatch) // applies it
```

## Plugins and shortcuts

A plugin can keep its own state, filter or append transactions, provide decorations (purely
visual highlights) and, on the view side, react to paste, drag and double-click.
Shortcuts are maps `{ 'Mod-b': command }` placed in a plugin with `keymap(...)`, with a
priority: the highest one responds first (`Mod` is Ctrl, or ⌘ on macOS).

## View

The view uses a **controlled** `contentEditable`: it intercepts `beforeinput` and turns every
change into a transaction instead of letting the browser do it. It handles IME composition
(Chinese, Japanese, Android keyboards), syncs the selection in both directions and updates only
the blocks that changed.

## UI

`@scriba-editor/ui` provides accessible Web Components: `<scriba-toolbar>`, `<scriba-menubar>`,
menus, dialogs and the right-click menu. They talk to the editor only through public commands, so
they work with any framework (or none).
