/// <reference types="vite/client" />
import {
  EditorState,
  Slice,
  TextSelection,
  baseKeymap,
  basicSchema,
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
import { defineScribaToolbar } from '@scriba/ui'
import '../packages/themes/scriba.css'

const schema = basicSchema

const SAMPLE = `
<h1>Benvenuto in Scriba</h1>
<p>Questo è un editor <strong>rich text</strong> basato su uno <em>schema</em>:
ciò che lo schema non conosce viene <u>scartato</u>, mai eseguito.</p>
<h2>Cose da provare</h2>
<p>Scrivi, premi Invio, seleziona del testo e usa <code>Ctrl+B</code>.<br>Poi <s>annulla</s> con Ctrl+Z.</p>
<p>Incolla del testo da Word o Google Docs e guarda l'HTML a destra.</p>`

const XSS = `<p onclick="alert(1)">Testo <b>in grassetto</b><img src=x onerror="alert('xss')"><script>alert(1)</script> <a href="javascript:alert(1)">link</a></p>`

const doc = parseHTML(schema, parseInertHTML(SAMPLE).body)
const state = EditorState.create({
  doc,
  plugins: [history(), keymap(historyKeymap), keymap(formatKeymap(schema)), keymap(baseKeymap)],
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
toolbar.translator = createTranslator('it')
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
