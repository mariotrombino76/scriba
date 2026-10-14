/// <reference types="vite/client" />
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
import { createTranslator } from '@scriba/i18n'
import { defineScribaToolbar } from '@scriba/ui'
import '../../packages/themes/scriba.css'

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
defineScribaToolbar()
const app = document.getElementById('app')!
const toolbar = document.createElement('scriba-toolbar')
app.appendChild(toolbar)
const view = new EditorView(app, { state, label: 'Editor di prova' })
toolbar.mac = false
toolbar.translator = createTranslator('it')
toolbar.view = view

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
