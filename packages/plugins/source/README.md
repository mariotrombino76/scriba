**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-source

HTML source code view, like TinyMCE's "Source code" button: a dialog opens with the document's HTML, you edit it and save it back into the document (a single undo step).

```bash
pnpm add @scriba-editor/plugin-source
```

## Usage

```ts
import { sourceToolbarItem } from '@scriba-editor/plugin-source'

// in the toolbar or the Tools menu
sourceToolbarItem(t)
// with your own limits
sourceToolbarItem(t, { maxLength: 500_000, parse: {/* core HTMLParseOptions */} })
```

## Exports

| Name                                  | What it does                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sourceToolbarItem(t, options?)`      | "Source code" button (`id: 'source'`); also available in read-only mode                                         |
| `openSourceDialog(view, t, options?)` | Opens the dialog from code and returns the handle                                                               |
| `documentSource(doc)`                 | The document's HTML from the serializer, one top-level block per line                                           |
| `parseSource(view, html, options?)`   | Reads the edited HTML like any untrusted input; throws `HTMLLimitError` beyond the limits                       |
| `SourceOptions`                       | `maxLength` (default `DEFAULT_MAX_SOURCE_LENGTH` = 2 000 000 characters), `parse` (depth and node count limits) |

## Accessibility

The dialog has a focus trap and returns focus to the editor; the text area has a label and a description (`aria-describedby`), and if the HTML exceeds the limits a message appears in an `aria-live` region with `aria-invalid` on the text area. In read-only mode you can see the code, but "Save" is disabled and the text area is `readOnly`.

## Security

The HTML written here is **untrusted input**, like a paste:

- it is read in an **inert document** (`DOMParser`, with the Trusted Types policy), never with `innerHTML` in the live document;
- then it goes through the **schema parser**, which discards what it does not know (`<script>`, `<style>`, `on*` handlers, disallowed URLs, unknown attributes);
- there are length and nesting limits (depth and node count): beyond them, saving is rejected with a message.

The source shown comes from the serializer (with escaping), not a copy of the DOM. This does not replace the server-side check: always re-sanitize the HTML with `@scriba-editor/sanitize-server` before saving it. See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).
