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
import {
  imageKeymap,
  imageNodes,
  imagePlugins,
  imageToolbarItems,
  type ImageUploadOptions,
} from '@scriba/plugin-image'
import { tableKeymap, tableNodes, tablePlugins, tableToolbarItems } from '@scriba/plugin-table'
import { Fullscreen, fullscreenKeymap, fullscreenToolbarItem } from '@scriba/plugin-fullscreen'
import { createWordCountStatus } from '@scriba/plugin-word-count'
import { sourceToolbarItem } from '@scriba/plugin-source'
import { charmapToolbarItem } from '@scriba/plugin-charmap'
import { markdownShortcuts, serializeMarkdown } from '@scriba/plugin-markdown'
import {
  findReplaceKeymap,
  findReplacePlugins,
  findReplaceToolbarItem,
} from '@scriba/plugin-find-replace'
import '../../packages/themes/scriba.css'

// Test fixture only: exposes the view so specs can read the model.
const t = createTranslator('it')

// Demo upload: a real app sends the file to its server and returns the URL.
// Here the file becomes a data: URL (allowed for PNG/JPEG/GIF/WebP within the size limit).
const images: ImageUploadOptions = {
  maxSize: 900_000,
  upload: (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    }),
}
const schema = new Schema({
  nodes: withBlockStyles({
    ...basicSchemaSpec.nodes,
    ...blockquoteNodes,
    ...listNodes,
    ...codeBlockNodes,
    ...imageNodes,
    ...tableNodes,
  }),
  marks: { ...linkMarks, ...basicSchemaSpec.marks, ...textStyleMarks },
})
// Fullscreen covers the editor container (toolbar, editing area, status bar).
const fullscreen = new Fullscreen(document.getElementById('app')!)
const state = EditorState.create({
  schema,
  plugins: [
    history(),
    pasteClean(),
    ...imagePlugins(t, images),
    ...findReplacePlugins(),
    ...markdownShortcuts(schema),
    keymap(findReplaceKeymap(t), { priority: 80 }),
    keymap(fullscreenKeymap(fullscreen), { priority: 80 }),
    keymap(imageKeymap(t, images), { priority: 70 }),
    codeHighlight({ lowlight: createLowlight(common) }),
    keymap(codeBlockKeymap(), { priority: 60 }),
    ...tablePlugins(),
    keymap(tableKeymap(), { priority: 55 }),
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
  toolbarGroup(
    'insert',
    'toolbar.group.insert',
    [
      ...linkToolbarItems(schema, t),
      ...imageToolbarItems(schema, t, images),
      ...tableToolbarItems(schema, t),
      charmapToolbarItem(t),
    ],
    2,
  ),
  toolbarGroup('lists', 'toolbar.group.lists', [
    ...listToolbarItems(schema, { indent: false }).map((item) => ({ ...item, priority: 2 })),
    ...indentItems({ indent: listIndentCommands(schema) }),
    alignmentMenu(),
  ]),
  toolbarGroup('blocks', 'toolbar.group.blocks', [
    ...blockquoteToolbarItems(schema),
    ...codeBlockToolbarItems(schema),
  ]),
  toolbarGroup('view', 'toolbar.group.view', [
    findReplaceToolbarItem(t),
    sourceToolbarItem(t),
    fullscreenToolbarItem(fullscreen),
  ]),
]
toolbar.view = view
app.appendChild(createWordCountStatus(view, t, { delay: 50 }).el)

const cspViolations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`),
)

Object.assign(window, {
  scriba: {
    view,
    html: () => serializeHTML(view.state.doc),
    markdown: () => serializeMarkdown(view.state.doc),
    json: () => view.state.doc.toJSON(),
    selection: () => ({ from: view.state.selection.from, to: view.state.selection.to }),
    cspViolations,
  },
})
