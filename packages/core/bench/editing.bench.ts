import { expect, test } from 'vitest'
import { TextSelection, splitBlock, toggleMark, undo } from '../src/index.js'
import { bigDoc, bigState } from './fixtures.js'

/**
 * Editing a 1 MB document (CLAUDE.md §7): typing must stay under 16 ms per key,
 * view included; the core part must be a small share of it. Run with
 * `pnpm bench`; compare with the previous results (no more than 10% slower
 * without a reason).
 */
const BUDGET_MS = 4 // the core's share of the 16 ms frame

const doc = bigDoc()
let state = bigState(doc)

test('1 MB document: one keystroke in the core', async ({ bench }) => {
  const results = await bench.compare(
    bench('type a character in the middle', () => {
      state = state.apply(state.tr.insertText('a'))
    }),
    bench('type a character at the end', () => {
      const end = TextSelection.atEnd(state.doc)
      state = state.apply(state.tr.setSelection(end).insertText('a'))
    }),
    bench('Enter (split the paragraph)', () => {
      splitBlock(state, (tr) => (state = state.apply(tr)))
    }),
    bench('bold on five characters', () => {
      const from = state.selection.from
      const s = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from - 5, from)))
      toggleMark(s.schema.marks['bold']!)(s, (tr) => (state = s.apply(tr)))
    }),
    bench('type, then undo', () => {
      const typed = state.apply(state.tr.insertText('x'))
      undo(typed, (tr) => (state = typed.apply(tr)))
    }),
  )
  for (const name of [
    'type a character in the middle',
    'type a character at the end',
    'Enter (split the paragraph)',
    'bold on five characters',
    'type, then undo',
  ] as const)
    expect(results.get(name).latency.p75, name).toBeLessThan(BUDGET_MS)
})
