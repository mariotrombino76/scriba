**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-autosave

**Automatic draft** for the Scriba editor, like the TinyMCE autosave: while you write, a copy of the
document is kept in the browser; if the tab is closed by mistake you can restore it from
"File > Restore last draft".

## Installation

```bash
pnpm add @scriba-editor/plugin-autosave
```

## Usage

```ts
import { autosave, clearDraft, restoreDraftItem } from '@scriba-editor/plugin-autosave'

// one key per document: drafts of different documents do not mix
const draftOptions = { key: 'scriba:note-42', delay: 2000 }

const state = EditorState.create({ schema, plugins: [history(), autosave(draftOptions) /* … */] })

// File menu item
menubar.menus = [{ id: 'file', label: 'menu.file', items: [restoreDraftItem(draftOptions, t)] }]

// after the real save on the server: the draft is no longer needed
clearDraft(draftOptions)
```

## Options (`AutosaveOptions`)

| Option      | Default        | Description                                                            |
| ----------- | -------------- | ---------------------------------------------------------------------- |
| `key`       | (required)     | Draft key, one per document.                                           |
| `delay`     | `2000`         | Wait in ms after the last change before saving.                        |
| `storage`   | `localStorage` | Any object with `getItem`, `setItem`, `removeItem`; `null` to disable. |
| `maxLength` | `2000000`      | Maximum draft size (JSON characters): beyond that it is not saved.     |

## Exports

- `autosave(options)`: plugin that saves after the first change (not the document just opened),
  `delay` ms after the last one. It also saves immediately when the page is hidden
  (`visibilitychange`), closed (`pagehide`) or the editor is destroyed.
- `readDraft(schema, options)`: the validated draft, `{ doc, savedAt }`, or `null`.
- `restoreDraft(view, options)`: puts the draft into the editor as **a single undoable step**;
  `false` if there is none or if a plugin rejects the change (e.g. a protected block).
- `draftTransaction(state, draft)`: the minimal transaction from the current document to the draft.
- `clearDraft(options)`: deletes the draft; call it after the real save and on logout.
- `restoreDraftItem(options, t?)`: "Restore last draft" item, enabled only if there is a draft that
  differs from the document. With `t`, a rejected restore is explained in a dialog.
- Types: `AutosaveOptions`, `DraftStorage`.

## Notes

- **Privacy:** the draft stays on this device, **unencrypted**, in `localStorage`. Enable it only
  where that is acceptable (shared computers, sensitive data) and call `clearDraft` on logout.
- **Security:** browser storage content is untrusted input; other scripts on the page may have
  written it. `readDraft` validates it with `schema.nodeFromJSON`: an invalid or too large draft is
  ignored. See [security](../../../docs/security.md).
- If storage is full or blocked (privacy settings, sandboxed iframes) the editor keeps working,
  without a draft.
- Restoring touches only the blocks that differ, so unchanged protected blocks are not rewritten.
- The item text uses the `autosave.*` i18n keys. See [plugins](../../../docs/plugins.md).
