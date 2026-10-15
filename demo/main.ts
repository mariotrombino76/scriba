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
import {
  codeBlockKeymap,
  codeBlockNodes,
  codeBlockToolbarItems,
  codeHighlight,
} from '@scriba/plugin-code-block'
import { common, createLowlight } from 'lowlight'
import '../packages/themes/scriba.css'

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

const SAMPLE = `
<h1>Benvenuto in Scriba</h1>
<p>Questo è un editor <strong>rich text</strong> basato su uno <em>schema</em>:
ciò che lo schema non conosce viene <u>scartato</u>, mai eseguito.</p>
<h2>Cose da provare</h2>
<p>Scrivi, premi Invio, seleziona del testo e usa <code>Ctrl+B</code>.<br>Poi <s>annulla</s> con Ctrl+Z.</p>
<ul><li><p>Elenchi puntati e numerati: <code>Ctrl+Shift+8</code> / <code>Ctrl+Shift+7</code></p>
<ul><li><p>Tab per rientrare, Shift+Tab per tornare indietro</p></li></ul></li>
<li><p>Invio su un elemento vuoto per uscire dall'elenco</p></li></ul>
<pre><code class="language-typescript">// Blocchi di codice: Ctrl+Alt+C, tre Invio o Ctrl+Invio per uscire
function saluta(nome: string): string {
  return \`Ciao, \${nome}!\`
}</code></pre>
<blockquote><p>Citazioni dal pulsante ❝ — Backspace all'inizio per uscirne.</p></blockquote>
<p>Incolla del testo da Word o Google Docs e guarda l'HTML a destra.</p>`

const XSS = `<p onclick="alert(1)">Testo <b>in grassetto</b><img src=x onerror="alert('xss')"><script>alert(1)</script> <a href="javascript:alert(1)">link</a></p>`

const doc = parseHTML(schema, parseInertHTML(SAMPLE).body)
const state = EditorState.create({
  doc,
  plugins: [
    history(),
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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const outHTML = $('out-html')
const outJSON = $('out-json')
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
toolbar.items = [
  ...defaultToolbarItems(schema),
  { type: 'separator' },
  ...listToolbarItems(schema, { indent: false }),
  ...blockquoteToolbarItems(schema),
  ...codeBlockToolbarItems(schema),
  ...linkToolbarItems(schema, t),
  { type: 'separator' },
  ...textStyleToolbarItems(schema, { indent: listIndentCommands(schema) }),
]
toolbar.view = view

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
  const text = s.doc.textBetween(0, s.doc.content.size, ' ')
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  status.textContent = `${words} parole · ${text.length} caratteri · annulla: ${undoDepth(s)} · ripeti: ${redoDepth(s)}`
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
