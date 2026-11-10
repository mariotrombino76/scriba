import {
  Fragment,
  NodeSelection,
  Plugin,
  Selection,
  insertContent,
  type Command,
  type EditorState,
  type HTMLSpec,
  type KeyBindings,
  type Node,
  type Schema,
} from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import { openDialog, type ToolbarButton } from '@scriba-editor/ui'
import type { EditorView, NodeViewFactory, ViewPluginProps } from '@scriba-editor/view'
import { renderMathML } from './mathml.js'
import { MAX_LATEX } from './nodes.js'

export { createMathNodes, MAX_LATEX, type MathRenderer } from './nodes.js'
export { mathmlSpec, renderMathML } from './mathml.js'

const MATH_NODES = ['math_inline', 'math_display']

/** The selected formula, with its position. */
export function selectedMath(state: EditorState): { node: Node; pos: number } | null {
  const sel = state.selection
  return sel instanceof NodeSelection && MATH_NODES.includes(sel.node.type.name)
    ? { node: sel.node, pos: sel.from }
    : null
}

/**
 * Inserts a formula at the cursor (in the text, or on its own line), or
 * changes the selected one (switching between the two kinds if asked).
 */
export function insertMath(latex: string, display: boolean): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes[display ? 'math_display' : 'math_inline']
    if (!type || !latex.trim() || latex.length > MAX_LATEX) return false
    let node: Node
    try {
      node = type.create({ latex: latex.trim() })
    } catch {
      return false
    }
    const editing = selectedMath(state)
    const { $from } = state.selection
    if (!editing && $from.parent.type.spec.code) return false
    if (!dispatch) return true
    const tr = state.tr
    if (editing && editing.node.type === type) {
      tr.setNodeAttrs(editing.pos, { latex: node.attrs['latex'] })
      tr.setSelection(NodeSelection.create(tr.doc, editing.pos))
      dispatch(tr.scrollIntoView())
      return true
    }
    // a new formula, or one changing kind: (taken out and) put in as its kind requires
    if (editing) tr.delete(editing.pos, editing.pos + editing.node.nodeSize)
    const from = editing ? tr.mapping.map(editing.pos) : state.selection.from
    const to = editing ? from : state.selection.to
    if (editing) tr.setSelection(Selection.near(tr.doc.resolve(from)))
    if (display) {
      const end = insertContent(tr, from, to, Fragment.from(node))
      if (end === null) return false
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(end + 1, tr.doc.content.size)), 1))
    } else {
      tr.replaceSelectionWith(node)
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** The MathML of a formula (as the HTML will have it), drawn as real MathML elements. */
function drawInto(el: HTMLElement, node: Node): void {
  const toHTML = node.type.spec.toHTML
  el.replaceChildren()
  if (toHTML) el.appendChild(renderMathML(el.ownerDocument, toHTML(node) as HTMLSpec))
}

/**
 * How formulas look in the editor: the MathML the HTML will contain (the
 * browser draws it), in a frame that selects the formula; double-click or
 * Enter edits its LaTeX.
 *
 * `nodeViews: { math_inline: mathNodeView(t), math_display: mathNodeView(t) }`
 */
export function mathNodeView(t: Translate): NodeViewFactory {
  return (initial, view) => {
    const display = initial.type.name === 'math_display'
    const dom = view.document.createElement(display ? 'div' : 'span')
    dom.className = display ? 'scriba-math scriba-math-display' : 'scriba-math'
    dom.setAttribute('role', 'math')
    let shown = ''
    const show = (node: Node) => {
      const latex = node.attrs['latex'] as string
      if (latex === shown) return
      shown = latex
      dom.setAttribute('aria-label', t('math.label', { latex }))
      dom.title = latex
      drawInto(dom, node)
    }
    show(initial)
    return {
      dom,
      update(next) {
        if (next.type !== initial.type) return false
        show(next)
        return true
      },
    }
  }
}

/** Dialog to write a formula in LaTeX, with a live preview; also edits the selected one. */
export function openMathDialog(view: EditorView, t: Translate): void {
  const editing = selectedMath(view.state)
  const schema = view.state.schema
  openDialog(view.document, {
    title: t(editing ? 'math.editTitle' : 'math.insertTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const doc = view.document
      const label = doc.createElement('label')
      const source = doc.createElement('textarea')
      source.rows = 4
      source.maxLength = MAX_LATEX
      source.spellcheck = false
      source.className = 'scriba-math-source'
      source.value = (editing?.node.attrs['latex'] as string | undefined) ?? ''
      label.append(t('math.latex'), source)
      const hint = doc.createElement('p')
      hint.className = 'scriba-dialog-hint'
      hint.textContent = t('math.hint')
      const blockLabel = doc.createElement('label')
      blockLabel.className = 'scriba-check'
      const block = doc.createElement('input')
      block.type = 'checkbox'
      block.checked = editing ? editing.node.type.name === 'math_display' : false
      blockLabel.append(block, t('math.display'))
      const previewLabel = doc.createElement('p')
      previewLabel.className = 'scriba-dialog-hint'
      previewLabel.textContent = t('math.preview')
      const preview = doc.createElement('div')
      preview.className = 'scriba-math-preview'
      preview.setAttribute('aria-live', 'polite')
      const error = doc.createElement('p')
      error.className = 'scriba-dialog-error'
      error.setAttribute('role', 'alert')

      let timer: ReturnType<typeof setTimeout> | undefined
      const refresh = () => {
        const latex = source.value.trim()
        const type = schema.nodes[block.checked ? 'math_display' : 'math_inline']
        preview.replaceChildren()
        if (!latex || !type) return
        try {
          drawInto(preview, type.create({ latex }))
        } catch {
          preview.textContent = latex
        }
      }
      source.addEventListener('input', () => {
        clearTimeout(timer)
        timer = setTimeout(refresh, 150)
      })
      block.addEventListener('change', refresh)
      refresh()

      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const cancel = doc.createElement('button')
      cancel.type = 'button'
      cancel.textContent = t('math.cancel')
      cancel.addEventListener('click', () => handle.close())
      const save = doc.createElement('button')
      save.type = 'submit'
      save.textContent = t(editing ? 'math.save' : 'math.insert')
      actions.append(cancel, save)
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        clearTimeout(timer)
        if (!insertMath(source.value, block.checked)(view.state, (tr) => view.dispatch(tr))) {
          error.textContent = t('math.invalid')
          source.setAttribute('aria-invalid', 'true')
          source.focus()
          return
        }
        handle.close()
      })
      form.append(label, hint, blockLabel, previewLabel, preview, error, actions)
      source.focus()
    },
  })
}

/** Enter on a selected formula edits it. */
export function mathKeymap(t: Translate): KeyBindings {
  return {
    Enter: (state, dispatch, view) => {
      if (!selectedMath(state) || !view) return false
      if (dispatch) openMathDialog(view as EditorView, t)
      return true
    },
  }
}

/** Double-clicking a formula edits it. */
export function mathPlugins(t: Translate): Plugin[] {
  const props: ViewPluginProps = {
    handleDoubleClickNode(view, _pos, node) {
      if (!MATH_NODES.includes(node.type.name) || !view.editable) return false
      openMathDialog(view, t)
      return true
    },
  }
  return [new Plugin({ props: { ...props } })]
}

/** Insert ▸ Formula. */
export function mathToolbarItem(t: Translate): ToolbarButton {
  return {
    type: 'button',
    id: 'math',
    icon: 'math',
    label: (tr) => tr('math.label.short'),
    command: (state) => !state.selection.$from.parent.type.spec.code,
    run: (view) => openMathDialog(view, t),
  }
}

/** Slash menu entry ("/formula"). */
export function mathSlashItem(t: Translate): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: 'math'
  command: Command
} {
  return {
    id: 'math',
    label: (tr) => tr('math.label.short'),
    keywords: ['formula', 'math', 'equazione', 'latex', 'matematica', 'equation'],
    icon: 'math',
    command: (_state, dispatch, view) => {
      if (!view) return false
      if (dispatch) openMathDialog(view as EditorView, t)
      return true
    },
  }
}

/** Formulas are in the schema? (for presets that include the plugin only sometimes) */
export const hasMath = (schema: Schema): boolean => MATH_NODES.every((n) => !!schema.nodes[n])
