**English** · [Italiano](README.it.md)

# @scriba-editor/react

The Scriba editor as a React component (18 and 19).

```bash
pnpm add @scriba-editor/react @scriba-editor/themes
```

## Usage

```tsx
import { useState } from 'react'
import { ScribaEditor } from '@scriba-editor/react'
import '@scriba-editor/themes/scriba.css'

export function Note() {
  const [html, setHtml] = useState('<p>Hello</p>')
  return <ScribaEditor value={html} onChange={(v) => setHtml(v as string)} />
}
```

The content (`value`, `setContent`) is **untrusted input**: it always goes through the schema
parser in an inert document. The saved HTML must still be run through
`@scriba-editor/sanitize-server` on the server before you save or display it.

## Props

| Prop        | Default            | Meaning                                                                                       |
| ----------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `value`     | `null`             | The content (HTML or JSON). A value changed from outside replaces the document.               |
| `onChange`  | —                  | Called on every user change, with the content in the chosen format.                           |
| `format`    | `'html'`           | `'html'` or `'json'`.                                                                         |
| `schema`    | `basicSchema`      | The schema (read at creation).                                                                |
| `plugins`   | —                  | Additional plugins (read at creation).                                                        |
| `editable`  | `true`             | `false`: read-only (can be changed at any time).                                              |
| `label`     | "Rich text editor" | Accessible name of the writing area.                                                          |
| `locale`    | `'it'`             | Language (`'it'`, `'en'`) or a messages object (`fr`, `de`, `es` from `@scriba-editor/i18n`). |
| `toolbar`   | `true`             | Shows the default toolbar.                                                                    |
| `nodeViews` | —                  | Custom views of atomic nodes (read at creation).                                              |
| `className` | —                  | Additional class of the container.                                                            |

## Ref and hook

The component's `ref` exposes `getContent()`, `setContent(content)`, `focus()`, `view` and `state`.

For a fully custom UI there is the hook:

```tsx
import { useRef } from 'react'
import { useScriba } from '@scriba-editor/react'

function Editor() {
  const place = useRef<HTMLDivElement>(null)
  const scriba = useScriba(place, { content: '<p>Hello</p>', onChange: console.log })
  return <div ref={place} />
}
```

The schema, plugins and format are read when the editor is created (at mount); `editable`,
`label` and `onChange` follow the props. It works with `StrictMode`.
