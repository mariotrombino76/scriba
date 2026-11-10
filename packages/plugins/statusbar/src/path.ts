import { NodeSelection, type EditorState, type HTMLSpec, type Mark, type Node } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { EditorView } from '@scriba-editor/view'

/** The HTML tag a node or mark is written as (`p`, `h2`, `strong`…). */
function tagOf(spec: HTMLSpec | undefined, fallback: string): string {
  const tag = typeof spec === 'string' ? spec : spec?.[0]
  return typeof tag === 'string' && /^[a-z][a-z0-9-]*$/.test(tag) ? tag : fallback
}

export interface PathEntry {
  /** Tag name, as TinyMCE shows it. */
  readonly tag: string
  /** Position before the block (null for the marks at the cursor). */
  readonly pos: number | null
}

/** The blocks around the cursor (outermost first), then the marks at the cursor (schema order). */
export function elementPath(state: EditorState): PathEntry[] {
  const { $from } = state.selection
  const entries: PathEntry[] = []
  const node = (n: Node) => tagOf(n.type.spec.toHTML?.(n), n.type.name)
  for (let d = 1; d <= $from.depth; d++)
    entries.push({ tag: node($from.node(d)), pos: $from.before(d) })
  const selected = state.selection instanceof NodeSelection ? state.selection.node : null
  if (selected && selected !== $from.parent)
    entries.push({ tag: node(selected), pos: state.selection.from })
  const marks: readonly Mark[] = state.storedMarks ?? $from.marks()
  for (const mark of marks)
    if (mark.type.spec.serialize !== false)
      entries.push({ tag: tagOf(mark.type.spec.toHTML?.(mark), mark.type.name), pos: null })
  return entries
}

/**
 * Element path, like TinyMCE's status bar: where the cursor is (`ul › li › p ›
 * strong`). A block's button selects that whole block. One tab stop (the
 * current block), arrows move between blocks. Put `el` under the editor.
 */
export function createElementPath(
  view: EditorView,
  t: Translate,
): { el: HTMLElement; destroy(): void } {
  const doc = view.document
  const el = doc.createElement('nav')
  el.className = 'scriba-element-path'
  el.setAttribute('aria-label', t('path.label'))
  const list = doc.createElement('ol')
  el.appendChild(list)
  let key = ''
  const render = () => {
    const entries = elementPath(view.state)
    const next = entries.map((e) => `${e.tag}@${e.pos ?? ''}`).join(' ')
    if (next === key) return
    key = next
    while (list.firstChild) list.removeChild(list.firstChild)
    const lastBlock = entries.map((e) => e.pos !== null).lastIndexOf(true)
    entries.forEach((entry, i) => {
      const item = doc.createElement('li')
      const last = i === lastBlock
      if (entry.pos === null) {
        const span = doc.createElement('span')
        span.textContent = entry.tag
        item.appendChild(span)
      } else {
        const button = doc.createElement('button')
        button.type = 'button'
        button.textContent = entry.tag
        button.title = t('path.select', { tag: entry.tag })
        // one tab stop for the whole path (the current block); arrows move between blocks
        button.tabIndex = last ? 0 : -1
        if (last) button.setAttribute('aria-current', 'location')
        const pos = entry.pos
        button.addEventListener('mousedown', (e) => e.preventDefault())
        button.addEventListener('click', () => {
          if (!view.state.doc.nodeAt(pos)) return
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
          view.focus()
        })
        item.appendChild(button)
      }
      list.appendChild(item)
    })
  }
  list.addEventListener('keydown', (e) => {
    const buttons = [...list.querySelectorAll('button')]
    const at = buttons.indexOf(e.target as HTMLButtonElement)
    if (at < 0) return
    const next =
      e.key === 'ArrowRight' ? at + 1
      : e.key === 'ArrowLeft' ? at - 1
      : e.key === 'Home' ? 0
      : e.key === 'End' ? buttons.length - 1
      : -1 // prettier-ignore
    const target = buttons[next]
    if (!target) return
    e.preventDefault()
    for (const b of buttons) b.tabIndex = b === target ? 0 : -1
    target.focus()
  })
  render()
  const unsubscribe = view.subscribe(render)
  return {
    el,
    destroy() {
      unsubscribe()
      el.remove()
    },
  }
}
