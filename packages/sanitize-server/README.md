**English** · [Italiano](README.it.md)

# @scriba-editor/sanitize-server

Server-side HTML sanitization (Node, no browser DOM) with **the same schema** as the Scriba editor.

```bash
pnpm add @scriba-editor/sanitize-server @scriba-editor/core
```

## Why it is mandatory

Cleaning done in the browser is a convenience, not a protection: anyone can send arbitrary HTML
to your API without going through the editor. **If you save or display HTML received from a
client, you must run it through this package**, with the same schema used in the editor, before
saving it and before displaying it.

## Usage

```ts
import { sanitizeHTML, InputTooLargeError } from '@scriba-editor/sanitize-server'
import { schema } from './schema.js' // the same schema used in the browser

app.post('/api/notes', (req, res) => {
  try {
    const clean = sanitizeHTML(schema, String(req.body.html ?? ''))
    save(clean)
    res.sendStatus(204)
  } catch (e) {
    if (e instanceof InputTooLargeError) return res.sendStatus(413)
    throw e
  }
})
```

The HTML is read with `parse5` the way the browser would read it (whole document, scripting
disabled) and goes through the schema parser: everything the schema does not know (`<script>`,
`on*` attributes, free styles, disallowed protocols, SVG…) is discarded. The output is then
rewritten by the serializer, with text and attributes escaped: it is never copied from the input.

If you save as **JSON**, rebuild the document on the server with `schema.nodeFromJSON(json)`: it
throws an error for everything the schema rejects.

## API

| Export                                      | Description                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `sanitizeHTML(schema, html, options?)`      | Parses the HTML with the schema and serializes it again: returns a clean string.                    |
| `parseHTMLOnServer(schema, html, options?)` | Same as above, but returns the document (`Node` from `@scriba-editor/core`) without serializing it. |
| `SanitizeOptions`                           | Options (see below).                                                                                |
| `InputTooLargeError`                        | Error (`RangeError`) thrown if the input exceeds `maxInputLength`.                                  |
| `adaptParse5(node)`                         | Exposes a `parse5` node as `DOMLike` for the core parser (advanced use).                            |

### Options

| Option           | Default     | Meaning                                                               |
| ---------------- | ----------- | --------------------------------------------------------------------- |
| `maxInputLength` | `5_000_000` | Maximum input length in characters; beyond it, `InputTooLargeError`.  |
| `maxDepth`       | `256`       | Maximum nesting depth (from the core's `HTMLParseOptions`).           |
| `maxNodes`       | `200_000`   | Maximum number of nodes created (from the core's `HTMLParseOptions`). |

If you exceed `maxDepth` or `maxNodes`, the parser throws `HTMLLimitError` (exported by
`@scriba-editor/core`); an input that is not a string throws `TypeError`. Handle these errors by
responding to the client with an error, without saving anything.

## Notes

- Use **the same schema** as the browser (same nodes, marks and plugins): with a poorer schema you
  would lose legitimate content, with a richer one you would accept what the editor does not
  produce.
- The HTML serialized from the `documentFromYjs` document (`@scriba-editor/collab-server`) must
  also be run through this package before being displayed elsewhere.
- This package does not replace upload validation (real type, size, antivirus, no SVG): see
  [Security](../../docs/security.md).

Full guide and checklist for integrators: [Security](../../docs/security.md).
