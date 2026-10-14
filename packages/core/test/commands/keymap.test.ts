import { describe, expect, it } from 'vitest'
import {
  baseKeymap,
  formatKeymap,
  history,
  historyKeymap,
  keyInputName,
  keymap,
  normalizeKeyName,
  runKeymaps,
  type EditorState,
  type KeyInput,
} from '../../src/index.js'
import { b, doc, p, schema } from '../helpers/schema.js'
import { stateAt } from '../helpers/state.js'

describe('key names', () => {
  it('normalizes bindings', () => {
    expect(normalizeKeyName('Mod-b', false)).toBe('Ctrl-b')
    expect(normalizeKeyName('Mod-b', true)).toBe('Meta-b')
    expect(normalizeKeyName('Shift-Mod-z', false)).toBe('Ctrl-Shift-z')
    expect(normalizeKeyName('Mod-Alt-1', false)).toBe('Alt-Ctrl-1')
    expect(normalizeKeyName('Mod--', false)).toBe('Ctrl--')
    expect(() => normalizeKeyName('Hyper-x', false)).toThrow()
  })

  it('names key inputs the same way', () => {
    expect(keyInputName({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('Ctrl-Shift-z')
    expect(keyInputName({ key: 'Enter' })).toBe('Enter')
  })
})

describe('keymaps', () => {
  const press = (state: EditorState, input: KeyInput) => {
    let next = state
    const handled = runKeymaps(state, (tr) => (next = state.apply(tr)), input)
    return { handled, state: next }
  }

  it('runs bindings by priority', () => {
    const calls: string[] = []
    const low = keymap({ 'Mod-b': () => (calls.push('low'), true) }, { mac: false })
    const high = keymap({ 'Mod-b': () => (calls.push('high'), true) }, { mac: false, priority: 10 })
    const s = stateAt(doc(p('a')), 1, 1, [low, high])
    expect(press(s, { key: 'b', ctrlKey: true }).handled).toBe(true)
    expect(calls).toEqual(['high'])
  })

  it('wires formatting, editing and history keys together', () => {
    const plugins = [
      history(),
      keymap(historyKeymap, { mac: false }),
      keymap(formatKeymap(schema), { mac: false }),
      keymap(baseKeymap, { mac: false }),
    ]
    let s = stateAt(doc(p('abcd')), 2, 4, plugins)
    s = press(s, { key: 'b', ctrlKey: true }).state
    expect(s.doc.eq(doc(p('a', b('bc'), 'd')))).toBe(true)
    s = press(s, { key: 'z', ctrlKey: true }).state
    expect(s.doc.eq(doc(p('abcd')))).toBe(true)
    s = press(s, { key: 'y', ctrlKey: true }).state
    expect(s.doc.eq(doc(p('a', b('bc'), 'd')))).toBe(true)
    s = press(s, { key: 'Enter' }).state
    expect(s.doc.eq(doc(p('a'), p('d')))).toBe(true)
    expect(press(s, { key: 'q', ctrlKey: true }).handled).toBe(false)
  })
})
