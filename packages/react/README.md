# @scriba/react

L'editor Scriba come componente React (18 e 19).

```bash
pnpm add @scriba/react @scriba/themes
```

## Uso

```tsx
import { useState } from 'react'
import { ScribaEditor } from '@scriba/react'
import '@scriba/themes/scriba.css'

export function Nota() {
  const [html, setHtml] = useState('<p>Ciao</p>')
  return <ScribaEditor value={html} onChange={(v) => setHtml(v as string)} />
}
```

Il contenuto (`value`, `setContent`) è **input non fidato**: passa sempre dal parser dello schema
in un documento inerte. L'HTML salvato va comunque ripassato da `@scriba/sanitize-server` sul
server prima di salvarlo o mostrarlo.

## Proprietà

| Proprietà   | Default                      | Significato                                                                           |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `value`     | `null`                       | Il contenuto (HTML o JSON). Un valore cambiato dall'esterno sostituisce il documento. |
| `onChange`  | —                            | Chiamata a ogni modifica dell'utente, con il contenuto nel formato scelto.            |
| `format`    | `'html'`                     | `'html'` o `'json'`.                                                                  |
| `schema`    | `basicSchema`                | Lo schema (letto alla creazione).                                                     |
| `plugins`   | —                            | Plugin aggiuntivi (letti alla creazione).                                             |
| `editable`  | `true`                       | `false`: sola lettura (si può cambiare in ogni momento).                              |
| `label`     | "Editor di testo formattato" | Nome accessibile dell'area di scrittura.                                              |
| `locale`    | `'it'`                       | Lingua dell'interfaccia (`'it'`, `'en'`…) o un oggetto di messaggi.                   |
| `toolbar`   | `true`                       | Mostra la toolbar predefinita.                                                        |
| `nodeViews` | —                            | Viste personalizzate dei nodi atomici (lette alla creazione).                         |
| `className` | —                            | Classe aggiuntiva del contenitore.                                                    |

## Ref e hook

Il `ref` del componente espone `getContent()`, `setContent(content)`, `focus()`, `view` e `state`.

Per un'interfaccia tutta tua c'è l'hook:

```tsx
import { useRef } from 'react'
import { useScriba } from '@scriba/react'

function Editor() {
  const place = useRef<HTMLDivElement>(null)
  const scriba = useScriba(place, { content: '<p>Ciao</p>', onChange: console.log })
  return <div ref={place} />
}
```

Lo schema, i plugin e il formato vengono letti quando l'editor viene creato (al montaggio);
`editable`, `label` e `onChange` seguono le proprietà. Funziona con `StrictMode`.
