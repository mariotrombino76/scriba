// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  EditorState,
  NodeSelection,
  Schema,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { taskNodes } from '@scriba/plugin-task'
import { TaskView, vueNodeView } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...taskNodes },
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const TASK = '<div data-task data-done="false" data-due="2020-01-01">Revisione</div><p>x</p>'

function setup(editable = true) {
  const place = document.createElement('div')
  document.body.appendChild(place)
  const doc = parseHTML(schema, new DOMParser().parseFromString(TASK, 'text/html').body)
  let canEdit = editable
  const view = new EditorView(place, {
    state: EditorState.create({ schema, doc, plugins: [history()] }),
    nodeViews: { task: vueNodeView(TaskView, { t }) },
    editable: () => canEdit,
  })
  const q = <E extends Element>(sel: string) => view.dom.querySelector<E>(sel)!
  const change = async (input: HTMLInputElement, value: string) => {
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
  }
  const setEditable = async (on: boolean) => {
    canEdit = on
    view.updateState(view.state)
    await nextTick()
  }
  return { view, q, change, setEditable }
}

describe('vueNodeView + TaskView', () => {
  it('draws the task with the component; accessible names from i18n', () => {
    const { q } = setup()
    const group = q('.scriba-task-view')
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-label')).toBe('Revisione: da fare')
    expect(q<HTMLInputElement>('.scriba-task-title').value).toBe('Revisione')
    expect(q('.scriba-task-done').getAttribute('aria-label')).toBe('Fatto')
    expect(q('.scriba-task-overdue').textContent).toBe('In ritardo')
  })

  it('changes go into the document as undoable steps; the component follows', async () => {
    const { view, q, change } = setup()
    const box = q<HTMLInputElement>('.scriba-task-done')
    box.click()
    await nextTick()
    expect(view.state.doc.firstChild!.attrs['done']).toBe(true)
    expect(q('.scriba-task-view').classList.contains('is-done')).toBe(true)
    expect(view.dom.querySelector('.scriba-task-overdue')).toBeNull()
    await change(q('.scriba-task-title'), '  Revisione   finale ')
    await change(q('.scriba-task-due'), '2030-12-31')
    expect(serializeHTML(view.state.doc)).toBe(
      '<div class="scriba-task" data-task="" data-done="true" data-due="2030-12-31">Revisione finale</div><p>x</p>',
    )
    undo(view.state, (tr) => view.dispatch(tr))
    await nextTick()
    expect(q<HTMLInputElement>('.scriba-task-due').value).toBe('2020-01-01')
  })

  it('an invalid date is refused by the schema and announced', async () => {
    const { view, q, change } = setup()
    await change(q('.scriba-task-due'), '2026-02-30')
    expect(view.state.doc.firstChild!.attrs['due']).toBe('2020-01-01')
    expect(q('[role=alert]').textContent?.trim()).toBe('Data non valida: usa AAAA-MM-GG')
    expect(q('.scriba-task-due').getAttribute('aria-invalid')).toBe('true')
  })

  it('read-only: fields locked, nothing changes', async () => {
    const { view, q, setEditable } = setup()
    await setEditable(false)
    expect(q<HTMLInputElement>('.scriba-task-done').disabled).toBe(true)
    expect(q<HTMLInputElement>('.scriba-task-title').readOnly).toBe(true)
    q<HTMLInputElement>('.scriba-task-done').click()
    await nextTick()
    expect(view.state.doc.firstChild!.attrs['done']).toBe(false)
  })

  it('selected state, and the component is unmounted with the node', async () => {
    const { view, q } = setup()
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))
    await nextTick()
    expect(q('.scriba-task-view').classList.contains('is-selected')).toBe(true)
    const el = q('.scriba-node-view')
    view.dispatch(view.state.tr.delete(0, 1))
    await nextTick()
    expect(el.childElementCount).toBe(0) // render(null): component unmounted
  })
})
