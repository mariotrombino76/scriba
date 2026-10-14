import {
  EditorState,
  baseKeymap,
  basicSchema,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  serializeHTML,
} from '@scriba/core'
import { EditorView } from '@scriba/view'

// Test fixture only: exposes the view so specs can read the model.
const state = EditorState.create({
  schema: basicSchema,
  plugins: [
    history(),
    keymap(historyKeymap),
    keymap(formatKeymap(basicSchema)),
    keymap(baseKeymap),
  ],
})
const view = new EditorView(document.getElementById('app')!, { state, label: 'Editor di prova' })

const cspViolations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`),
)

Object.assign(window, {
  scriba: {
    view,
    html: () => serializeHTML(view.state.doc),
    json: () => view.state.doc.toJSON(),
    selection: () => ({ from: view.state.selection.from, to: view.state.selection.to }),
    cspViolations,
  },
})
