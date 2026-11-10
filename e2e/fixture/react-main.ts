// The React wrapper under the same strict CSP as the main fixture.
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ScribaEditor } from '@scriba-editor/react'
import '../../packages/themes/scriba.css'

const cspViolations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`),
)
Object.assign(window, { scribaReact: { cspViolations } })

function App() {
  const [html, setHtml] = useState('<p>Ciao <strong>React</strong></p>')
  const [readOnly, setReadOnly] = useState(false)
  return createElement(
    'div',
    null,
    createElement(ScribaEditor, {
      value: html,
      onChange: (v) => setHtml(v as string),
      editable: !readOnly,
      label: 'Editor React',
    }),
    createElement(
      'button',
      {
        type: 'button',
        // content from outside: untrusted, goes through the schema
        onClick: () => setHtml('<h2>Da fuori</h2><img src=x onerror="alert(1)"><p>fine</p>'),
      },
      'Carica',
    ),
    createElement(
      'button',
      { type: 'button', onClick: () => setReadOnly((r) => !r) },
      'Sola lettura',
    ),
    // the value React holds, shown as text
    createElement('pre', { 'data-testid': 'value' }, html),
  )
}

createRoot(document.getElementById('app')!).render(createElement(App))
