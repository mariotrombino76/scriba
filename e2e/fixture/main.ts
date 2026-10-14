/// <reference types="vite/client" />
import {
  EditorState,
  Schema,
  baseKeymap,
  basicSchemaSpec,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  serializeHTML,
} from '@scriba/core'
import { EditorView } from '@scriba/view'
import { createTranslator } from '@scriba/i18n'
import { defaultToolbarItems, defineScribaToolbar } from '@scriba/ui'
import { listIndentCommands, listKeymap, listNodes, listToolbarItems } from '@scriba/plugin-list'
import { blockquoteNodes, blockquoteToolbarItems } from '@scriba/plugin-blockquote'
import {
  textStyleKeymap,
  textStyleMarks,
  textStyleToolbarItems,
  withBlockStyles,
} from '@scriba/plugin-text-style'
import { linkKeymap, linkMarks, linkToolbarItems } from '@scriba/plugin-link'
import '../../packages/themes/scriba.css'

// Test fixture only: exposes the view so specs can read the model.
const t = createTranslator('it')
const schema = new Schema({
  nodes: withBlockStyles({ ...basicSchemaSpec.nodes, ...blockquoteNodes, ...listNodes }),
  marks: { ...linkMarks, ...basicSchemaSpec.marks, ...textStyleMarks },
})
const state = EditorState.create({
  schema,
  plugins: [
    history(),
    keymap(listKeymap(schema), { priority: 50 }),
    keymap(textStyleKeymap({ indent: listIndentCommands(schema) })),
    keymap(linkKeymap(t)),
    keymap(historyKeymap),
    keymap(formatKeymap(schema)),
    keymap(baseKeymap),
  ],
})
defineScribaToolbar()
const app = document.getElementById('app')!
const toolbar = document.createElement('scriba-toolbar')
app.appendChild(toolbar)
const view = new EditorView(app, { state, label: 'Editor di prova' })
toolbar.mac = false
toolbar.translator = t
toolbar.items = [
  ...defaultToolbarItems(schema),
  { type: 'separator' },
  ...listToolbarItems(schema, { indent: false }),
  ...blockquoteToolbarItems(schema),
  ...linkToolbarItems(schema, t),
  { type: 'separator' },
  ...textStyleToolbarItems(schema, { indent: listIndentCommands(schema) }),
]
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
