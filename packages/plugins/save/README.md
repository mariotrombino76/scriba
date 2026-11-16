**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-save

"Save" button and shortcut as in TinyMCE's `save` plugin: it calls a function of **yours**, which sends the document to your backend. The button is enabled only when there is something to save.

```bash
pnpm add @scriba-editor/plugin-save
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import { saveItem, saveKeymap, savePlugin, type SaveOptions } from '@scriba-editor/plugin-save'

const saveOptions: SaveOptions = {
  save: async (doc) => {
    const res = await fetch('/api/document', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/html' },
      body: serializeHTML(doc),
    })
    if (!res.ok) throw new Error('Save failed') // stays "unsaved"
  },
  onError: (error) => showWarning(error),
}

const plugins = [
  savePlugin(),
  keymap(saveKeymap(saveOptions), { priority: 90 }), // higher than the File menu's "download"
]
// in the toolbar or the File menu: saveItem(saveOptions)
```

## Exports

| Name                   | What it does                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `savePlugin()`         | Remembers the last saved (or loaded) document                                                   |
| `saveCommand(options)` | Command: possible only if something changed and a save is not already in progress               |
| `saveKeymap(options)`  | Ctrl/Cmd+S                                                                                      |
| `saveItem(options)`    | "Save" button (`id: 'save'`), enabled only with unsaved changes                                 |
| `isDirty(state)`       | `true` if the document differs from the last saved one                                          |
| `isSaving(state)`      | `true` while your function is running                                                           |
| `markSaved(view)`      | Marks the current document as saved (after loading a new document or saving with your own code) |
| `saveKey`              | `PluginKey` of the state                                                                        |
| `SaveOptions`          | `save(doc)` (may return a promise), `onError?(error)`                                           |

## Keyboard

Ctrl/Cmd+S saves and **never opens** the browser's "Save page", not even when there is nothing to save. While `save` is running you cannot save again; if it throws an error or the promise is rejected, the document stays "unsaved" and `onError` is called.

## Security

The editor sends nothing on its own: sending happens only in your callback, to **your backend**. The received HTML must **always** be re-sanitized with `@scriba-editor/sanitize-server` before it is saved or displayed, because anyone can call the API without going through the editor. See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).

For local drafts and versions see also `@scriba-editor/plugin-autosave` and [@scriba-editor/plugin-revisions](../revisions/README.md).
