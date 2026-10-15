/// <reference types="vite/client" />
import {
  EditorState,
  Slice,
  TextSelection,
  baseKeymap,
  Schema,
  basicSchemaSpec,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  parseHTML,
  redoDepth,
  serializeHTML,
  undoDepth,
} from '@scriba/core'
import { EditorView, parseInertHTML } from '@scriba/view'
import { createTranslator } from '@scriba/i18n'
import {
  blockStyleMenu,
  defineScribaToolbar,
  historyItems,
  markItems,
  toolbarGroup,
} from '@scriba/ui'
import {
  listIndentCommands,
  listKeymap,
  listNodes,
  listToolbarItems,
  toggleList,
} from '@scriba/plugin-list'
import {
  blockquoteNodes,
  blockquoteToolbarItems,
  toggleBlockquote,
} from '@scriba/plugin-blockquote'
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
  toggleCodeBlock,
  codeBlockNodes,
  codeBlockToolbarItems,
  codeHighlight,
} from '@scriba/plugin-code-block'
import { common, createLowlight } from 'lowlight'
import { pasteClean } from '@scriba/plugin-paste-clean'
import {
  imageKeymap,
  openImageDialog,
  imageNodes,
  imagePlugins,
  imageToolbarItems,
  type ImageUploadOptions,
} from '@scriba/plugin-image'
import {
  insertTable,
  tableKeymap,
  tableNodes,
  tablePlugins,
  tableToolbarItems,
} from '@scriba/plugin-table'
import { Fullscreen, fullscreenKeymap, fullscreenToolbarItem } from '@scriba/plugin-fullscreen'
import { createWordCountStatus } from '@scriba/plugin-word-count'
import { sourceToolbarItem } from '@scriba/plugin-source'
import { charmapToolbarItem, openCharmapDialog } from '@scriba/plugin-charmap'
import { basicSlashItems, slashCommands, slashKeymap, type SlashItem } from '@scriba/plugin-slash'
import { bubbleKeymap, bubbleMenu } from '@scriba/plugin-bubble'
import { markdownShortcuts, serializeMarkdown } from '@scriba/plugin-markdown'
import {
  findReplaceKeymap,
  findReplacePlugins,
  findReplaceToolbarItem,
} from '@scriba/plugin-find-replace'
import '../packages/themes/scriba.css'

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

const SAMPLE = `
<h1>Benvenuto in Scriba</h1>
<p>Questo è un editor <strong>rich text</strong> basato su uno <em>schema</em>:
ciò che lo schema non conosce viene <u>scartato</u>, mai eseguito.</p>
<h2>Cose da provare</h2>
<p>Scrivi, premi Invio, seleziona del testo e usa <code>Ctrl+B</code>.<br>Poi <s>annulla</s> con Ctrl+Z.</p>
<ul><li><p>Elenchi puntati e numerati: <code>Ctrl+Shift+8</code> / <code>Ctrl+Shift+7</code></p>
<ul><li><p>Tab per rientrare, Shift+Tab per tornare indietro</p></li></ul></li>
<li><p>Invio su un elemento vuoto per uscire dall'elenco</p></li></ul>
<pre><code class="language-typescript">// Blocchi di codice: Ctrl+Alt+Maiusc+C, tre Invio o Ctrl+Invio per uscire
function saluta(nome: string): string {
  return \`Ciao, \${nome}!\`
}</code></pre>
<blockquote><p>Citazioni dal pulsante ❝ — Backspace all'inizio per uscirne.</p></blockquote>
<table><tr><th><p>Funzione</p></th><th><p>Come</p></th></tr><tr><td><p>Tabelle</p></td><td><p>Tab per passare alla cella successiva, trascina per selezionare più celle, menu «Tabella» per righe, colonne, unione</p></td></tr><tr><td><p>Larghezza colonne</p></td><td><p>Trascina il bordo destro di una cella</p></td></tr></table>
<p>Incolla del testo da Word o Google Docs e guarda l'HTML a destra.</p>`

const XSS = `<p onclick="alert(1)">Testo <b>in grassetto</b><img src=x onerror="alert('xss')"><script>alert(1)</script> <a href="javascript:alert(1)">link</a></p>`

const doc = parseHTML(schema, parseInertHTML(SAMPLE).body)
// Slash menu: blocks and actions from the plugins in use.
const slashItems: SlashItem[] = [
  ...basicSlashItems(schema),
  {
    id: 'bullet_list',
    label: (tr) => tr('list.bullet'),
    keywords: ['elenco', 'puntato', 'list', 'ul'],
    icon: 'bulletList',
    command: toggleList(schema.nodes['bullet_list']!, schema.nodes['list_item']!),
  },
  {
    id: 'ordered_list',
    label: (tr) => tr('list.ordered'),
    keywords: ['elenco', 'numerato', 'list', 'ol'],
    icon: 'orderedList',
    command: toggleList(schema.nodes['ordered_list']!, schema.nodes['list_item']!),
  },
  {
    id: 'quote',
    label: (tr) => tr('block.blockquote'),
    keywords: ['citazione', 'quote'],
    icon: 'quote',
    command: toggleBlockquote(schema),
  },
  {
    id: 'code',
    label: (tr) => tr('block.codeBlock'),
    keywords: ['codice', 'code'],
    icon: 'codeBlock',
    command: toggleCodeBlock,
  },
  {
    id: 'table',
    label: (tr) => tr('table.label'),
    keywords: ['tabella', 'table'],
    icon: 'table',
    command: insertTable(3, 3),
  },
  {
    id: 'image',
    label: (tr) => tr('image.label'),
    keywords: ['immagine', 'foto', 'image'],
    icon: 'image',
    run: (v) => openImageDialog(v, t, images),
  },
  {
    id: 'charmap',
    label: (tr) => tr('charmap.button'),
    keywords: ['emoji', 'simbolo', 'carattere', 'symbol'],
    icon: 'smile',
    run: (v) => openCharmapDialog(v, t),
  },
]

// Fullscreen covers the editor container (toolbar, editing area, status bar).
const fullscreen = new Fullscreen(document.querySelector<HTMLElement>('.editor-area')!)
const state = EditorState.create({
  doc,
  plugins: [
    history(),
    pasteClean(),
    ...imagePlugins(t, images),
    ...findReplacePlugins(),
    ...slashCommands(slashItems, t),
    bubbleMenu({
      items: [...markItems(schema), ...linkToolbarItems(schema, t)],
      t,
    }),
    keymap(bubbleKeymap(), { priority: 80 }),
    keymap(slashKeymap(slashItems, t), { priority: 110 }),
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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const outHTML = $('out-html')
const outJSON = $('out-json')
const outMd = $('out-md')
const status = $('status')
let readOnly = false

const view: EditorView = new EditorView($('editor'), {
  state,
  label: 'Testo del documento',
  editable: () => !readOnly,
  dispatchTransaction(tr) {
    view.updateState(view.state.apply(tr))
    refresh()
  },
})

// --- Toolbar: the real <scriba-toolbar> from @scriba/ui ---
defineScribaToolbar()
const toolbar = document.createElement('scriba-toolbar')
$('toolbar-slot').appendChild(toolbar)
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
status.before(createWordCountStatus(view, t).el)

const checkbox = $<HTMLInputElement>('readonly')
checkbox.addEventListener('change', () => {
  readOnly = checkbox.checked
  view.updateState(view.state)
  refresh()
})

function refresh(): void {
  const s = view.state
  outHTML.textContent = serializeHTML(s.doc)
  outJSON.textContent = JSON.stringify(s.doc.toJSON(), null, 2)
  outMd.textContent = serializeMarkdown(s.doc)
  status.textContent = `annulla: ${undoDepth(s)} · ripeti: ${redoDepth(s)}`
}

// --- Security demo: simulate pasting hostile HTML ---
$('xss-sample').textContent = XSS
$('paste-xss').addEventListener('click', () => {
  const pasted = parseHTML(schema, parseInertHTML(XSS).body)
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, view.state.doc.content.size - 1),
  )
  tr.replaceSelection(Slice.maxOpen(pasted.content))
  view.dispatch(tr)
  view.focus()
})

refresh()
view.focus()
