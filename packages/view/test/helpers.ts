import {
  EditorState,
  TextSelection,
  baseKeymap,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  type Node,
} from '@scriba-editor/core'
import { EditorView } from '../src/index.js'
import { schema } from '../../core/test/helpers/schema.js'

export { schema }
export * from '../../core/test/helpers/schema.js'

export function mount(doc: Node, anchor = 1, head = anchor): EditorView {
  document.body.textContent = ''
  const place = document.createElement('div')
  document.body.appendChild(place)
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, anchor, head),
    plugins: [
      history(),
      keymap(historyKeymap, { mac: false }),
      keymap(formatKeymap(schema), { mac: false }),
      keymap(baseKeymap, { mac: false }),
    ],
  })
  const view = new EditorView(place, { state, label: 'Testo' })
  view.focus()
  return view
}

export function beforeInput(
  view: EditorView,
  inputType: string,
  data: string | null = null,
): InputEvent {
  const event = new InputEvent('beforeinput', { inputType, data, cancelable: true, bubbles: true })
  view.dom.dispatchEvent(event)
  return event
}

/** Waits for MutationObserver callbacks and timers. */
export const tick = () => new Promise((r) => setTimeout(r, 0))
