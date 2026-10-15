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
import {
  blockStyleMenu,
  defineScribaToolbar,
  historyItems,
  markItems,
  toolbarGroup,
} from '@scriba/ui'
import { listIndentCommands, listKeymap, listNodes, listToolbarItems } from '@scriba/plugin-list'
import { blockquoteNodes, blockquoteToolbarItems } from '@scriba/plugin-blockquote'
import {
  alignmentMenu,
  colorItems,
  fontItems,
  indentItems,
  textStyleKeymap,
  textStyleMarks,
  withBlockStyles,
} from '@scriba/plugin-text-style'
import { linkKeymap, linkMarks, linkToolbarItems } from '@scriba/plugin-link'
import {
  codeBlockKeymap,
  codeBlockNodes,
  codeBlockToolbarItems,
  codeHighlight,
} from '@scriba/plugin-code-block'
import { common, createLowlight } from 'lowlight'
import { pasteClean } from '@scriba/plugin-paste-clean'
import '../../packages/themes/scriba.css'

// Test fixture only: exposes the view so specs can read the model.
const t = createTranslator('it')
const schema = new Schema({
  nodes: withBlockStyles({
    ...basicSchemaSpec.nodes,
    ...blockquoteNodes,
    ...listNodes,
    ...codeBlockNodes,
  }),
  marks: { ...linkMarks, ...basicSchemaSpec.marks, ...textStyleMarks },
})
const state = EditorState.create({
  schema,
  plugins: [
    history(),
    pasteClean(),
    codeHighlight({ lowlight: createLowlight(common) }),
    keymap(codeBlockKeymap(), { priority: 60 }),
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
const styleMenu = blockStyleMenu(schema)
toolbar.items = [
  toolbarGroup('history', 'toolbar.group.history', historyItems(), 3),
  toolbarGroup('text-style', 'toolbar.group.textStyle', [
    ...(styleMenu ? [{ ...styleMenu, priority: 3 }] : []),
    ...fontItems(schema),
  ]),
  toolbarGroup('format', 'toolbar.group.format', markItems(schema), 2),
  toolbarGroup('colors', 'toolbar.group.colors', colorItems(schema)),
  toolbarGroup('insert', 'toolbar.group.insert', linkToolbarItems(schema, t), 2),
  toolbarGroup('lists', 'toolbar.group.lists', [
    ...listToolbarItems(schema, { indent: false }).map((item) => ({ ...item, priority: 2 })),
    ...indentItems({ indent: listIndentCommands(schema) }),
    alignmentMenu(),
  ]),
  toolbarGroup('blocks', 'toolbar.group.blocks', [
    ...blockquoteToolbarItems(schema),
    ...codeBlockToolbarItems(schema),
  ]),
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
