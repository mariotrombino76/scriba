import { NodeSelection, type Command, type KeyBindings, type Schema } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { ToolbarButton } from '@scriba/ui'
import type { EditorView } from '@scriba/view'

export { taskNodes, isTaskTitle, isTaskDate, titleFromText, MAX_TITLE } from './nodes.js'

export interface TaskAttrs {
  title: string
  done: boolean
  due: string | null
}

/**
 * Inserts a task after the current block (or in place of an empty
 * paragraph) and selects it, so Enter opens its fields.
 */
export function insertTask(schema: Schema, attrs: Partial<TaskAttrs> = {}): Command {
  return (state, dispatch) => {
    const type = schema.nodes['task']
    if (!type) return false
    const { $from } = state.selection
    // the top-level-most block around the cursor that can be followed by a task
    let depth = $from.depth
    while (depth > 0 && !$from.node(depth - 1).type.canContain(type)) depth--
    if (depth === 0) return false
    const block = $from.node(depth)
    const emptyParagraph = block.isTextblock && block.content.size === 0
    const from = emptyParagraph ? $from.before(depth) : $from.after(depth)
    const to = emptyParagraph ? $from.after(depth) : from
    if (!dispatch) return true
    const tr = state.tr.replaceWith(from, to, type.create(attrs))
    const at = tr.mapping.map(from, -1)
    // keep somewhere to type after it
    if (at + 1 >= tr.doc.content.size)
      tr.insert(tr.doc.content.size, schema.nodes['paragraph']!.create())
    dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView())
    return true
  }
}

/** The task selected as a node, if any. */
export function selectedTask(
  state: Parameters<Command>[0],
): { pos: number; attrs: TaskAttrs } | null {
  const sel = state.selection
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'task') return null
  return { pos: sel.from, attrs: sel.node.attrs as unknown as TaskAttrs }
}

/**
 * Enter on a selected task moves the focus into its first field (the node
 * view's); Space toggles done; arrows leave it as usual.
 */
export function taskKeymap(): KeyBindings {
  const open: Command = (state, dispatch, view) => {
    const task = selectedTask(state)
    if (!task || !view) return false
    const field = (view as EditorView)
      .nodeDOM(task.pos)
      ?.querySelector<HTMLElement>('input, button, textarea')
    if (!field) return false
    if (dispatch) field.focus()
    return true
  }
  const toggle: Command = (state, dispatch) => {
    const task = selectedTask(state)
    if (!task) return false
    dispatch?.(state.tr.setNodeAttrs(task.pos, { done: !task.attrs.done }))
    return true
  }
  return { Enter: open, ' ': toggle }
}

/** Toolbar button: insert a task. */
export function taskToolbarItem(schema: Schema): ToolbarButton {
  return {
    type: 'button',
    id: 'task',
    icon: 'task',
    label: (t) => t('task.insert'),
    command: insertTask(schema),
  }
}

/** Slash menu entry ("/attività"). */
export function taskSlashItem(schema: Schema): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: 'task'
  command: Command
} {
  return {
    id: 'task',
    label: (t) => t('task.insert'),
    keywords: ['todo', 'task', 'attività', 'compito', 'checklist'],
    icon: 'task',
    command: insertTask(schema),
  }
}

/** Selects the task again and gives the focus back to the editor (Escape in its fields). */
export function leaveTask(view: EditorView, pos: number): void {
  if (view.state.doc.nodeAt(pos)?.type.name !== 'task') return
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
  view.focus()
}
