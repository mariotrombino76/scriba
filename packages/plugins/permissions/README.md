**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-permissions

Per-block permissions: some blocks (paragraphs, headings, tables, ...) can be made non-editable for the current user. TinyMCE only has hand-written `contenteditable="false"`, with no rules and no server-side check.

```bash
pnpm add @scriba-editor/plugin-permissions
```

## Usage

```ts
import { blockPermissions, withBlockIds } from '@scriba-editor/plugin-permissions'

// 1. block ids in the schema (data-block-id in HTML)
const schema = new Schema({
  nodes: withBlockIds({ ...basicSchemaSpec.nodes, ...tableNodes }),
  marks,
})

// 2. the plugin: canEdit decides by id (here: ids starting with "lock")
const plugins = [...blockPermissions({ canEdit: (id) => !id.startsWith('lock'), t })]
```

You assign the ids yourself in the HTML you load (`<p data-block-id="lock-intro">`): a block without an id is always editable. If the permissions change, call `view.updateState(view.state)` to update the marked blocks.

## Exports

| Name                                                                                                                  | What it does                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `withBlockIds(nodes, names?)`                                                                                         | Adds the `blockId` attribute to the given types (default: `DEFAULT_BLOCK_TYPES`)                                   |
| `DEFAULT_BLOCK_TYPES`                                                                                                 | `paragraph`, `heading`, `blockquote`, `bullet_list`, `ordered_list`, `list_item`, `code_block`, `table`            |
| `blockPermissions(options)`                                                                                           | Plugin: rejects changes to protected blocks and announces them                                                     |
| `checkBlockEdits(before, after, rules)`                                                                               | **Server-side** check: returns the ids that were changed, deleted or added (empty = allowed)                       |
| `transactionAllowed(tr, rules)`                                                                                       | Tells whether a transaction leaves protected blocks intact                                                         |
| `BLOCK_ID`, `blockIdOf(node)`, `isBlockId(v)`                                                                         | Attribute name, reading and validation of the id (1-100 characters: letters, digits, `_ - . :`)                    |
| `LOCKED_CLASS`                                                                                                        | `scriba-locked` class set on the DOM of protected blocks                                                           |
| `deleteKeepingLocked`, `deleteSelectionKeepingLocked`, `typeKeepingLocked`, `pasteKeepingLocked`, `marksAroundLocked` | Building blocks used by the plugin: in a mixed selection they delete, type, paste and format only what is editable |
| `BlockRules`, `CanEdit`, `BlockPermissionOptions`                                                                     | Types                                                                                                              |

### Options (`BlockPermissionOptions`)

- `canEdit(id)`: whether the user can edit the block.
- `t`: translation function.
- `allowMarks`: marks allowed even on protected text (default `['comment']`, so you can still comment).
- `trusted(tr)`: changes applied anyway (default: remote changes from `@scriba-editor/plugin-collab`, which the collaboration server checks with the same rule).
- `onRefused(tr)`: called when a change is rejected.

## Behavior and accessibility

A protected block is marked with the `scriba-locked` class; the cursor can enter it (read, select, copy, comment), but every change is rejected. The rejection is announced in a `role="status"` region: "This block is protected: you cannot edit it". Backspace/Delete on a mixed selection deletes only the editable text. Pasted ids are not carried over, and if a block with an id is split or copied, the id stays with the copy that has more text.

## Security

Client-side permissions are **a convenience for honest users**: anyone can send a modified document to the backend, bypassing the editor. The server must apply the same rule, for example:

```ts
const changed = checkBlockEdits(docBefore, docAfter, { canEdit })
if (changed.length) throw new Error(`Protected blocks modified: ${changed.join(', ')}`)
```

See [security](../../../docs/security.md) (5.1 and 5.8) and [plugins](../../../docs/plugins.md).
