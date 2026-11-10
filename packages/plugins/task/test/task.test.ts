// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  NodeSelection,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  runKeymaps,
  keymap,
  serializeHTML,
} from '@scriba-editor/core'
import { serializeMarkdown } from '@scriba-editor/plugin-markdown'
import { insertTask, isTaskDate, selectedTask, taskKeymap, taskNodes } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...taskNodes },
  marks: basicSchemaSpec.marks,
})
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html').body
const parse = (html: string) => parseHTML(schema, dom(html))
const TASK =
  '<div class="scriba-task" data-task="" data-done="true" data-due="2026-10-20">Revisione contratto</div>'

describe('task node', () => {
  it('round trip through HTML', () => {
    expect(serializeHTML(parse(TASK))).toBe(TASK)
    expect(serializeHTML(parse('<div data-task>Da fare</div>'))).toBe(
      '<div class="scriba-task" data-task="" data-done="false">Da fare</div>',
    )
  })

  it('invalid attributes fall back to safe values; the title is plain text', () => {
    const doc = parse(
      '<div data-task data-done="yes" data-due="2026-02-30" onclick="x"><b>Uno</b><img src=x onerror=alert(1)>\n due‮</div>',
    )
    expect(doc.firstChild!.attrs).toEqual({ title: 'Uno due', done: false, due: null })
    expect(serializeHTML(doc)).toBe(
      '<div class="scriba-task" data-task="" data-done="false">Uno due</div>',
    )
    expect(() => schema.nodes['task']!.create({ title: 'a\nb' })).toThrow()
    expect(() => schema.nodes['task']!.create({ due: '2026-13-01' })).toThrow()
  })

  it('a plain div is not a task', () => {
    expect(serializeHTML(parse('<div>testo</div>'))).toBe('<p>testo</p>')
  })

  it('dates: real calendar days only', () => {
    expect(isTaskDate('2028-02-29')).toBe(true)
    expect(isTaskDate('2026-02-29')).toBe(false)
    expect(isTaskDate('2026-1-01')).toBe(false)
    expect(isTaskDate(null)).toBe(false)
  })

  it('Markdown: a line with its state, title and due date', () => {
    expect(serializeMarkdown(parse(`<p>Prima</p>${TASK}`))).toBe(
      'Prima\n\n\\[x\\] Revisione contratto (2026-10-20)\n',
    )
  })
})

describe('commands', () => {
  const at = (html: string, pos: number) => {
    const doc = parse(html)
    return EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos) })
  }
  const run = (state: EditorState, cmd: ReturnType<typeof insertTask>) => {
    let next = state
    cmd(state, (tr) => (next = state.apply(tr)))
    return next
  }

  it('inserts after the current block, selected, with a paragraph after it', () => {
    const s = run(at('<p>ab</p>', 2), insertTask(schema, { title: 'Nuova' }))
    expect(serializeHTML(s.doc)).toBe(
      '<p>ab</p><div class="scriba-task" data-task="" data-done="false">Nuova</div><p></p>',
    )
    expect(selectedTask(s)?.pos).toBe(4)
  })

  it('replaces an empty paragraph', () => {
    const s = run(at('<p>ab</p><p></p><p>c</p>', 5), insertTask(schema))
    expect(serializeHTML(s.doc)).toBe(
      '<p>ab</p><div class="scriba-task" data-task="" data-done="false"></div><p>c</p>',
    )
  })

  it('Space on a selected task toggles it (one undoable step)', () => {
    const doc = parse(`${TASK}<p>x</p>`)
    let s = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [keymap(taskKeymap())],
    })
    runKeymaps(s, (tr) => (s = s.apply(tr)), { key: ' ' })
    expect(s.doc.firstChild!.attrs['done']).toBe(false)
  })
})
