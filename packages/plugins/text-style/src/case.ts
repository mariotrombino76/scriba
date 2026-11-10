import { CLOSE_HISTORY, TextSelection, type Command, type Mark } from '@scriba-editor/core'

/** The case changes of the Format menu (TinyMCE's "case change"). */
export const LETTER_CASES = ['lower', 'upper', 'title', 'sentence'] as const
export type LetterCase = (typeof LETTER_CASES)[number]

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const SENTENCE_END = /[.!?…]/u
const SPACE = /\s/u

/** Transforms one piece of text, carrying what came before (word and sentence starts). */
class CaseRun {
  constructor(
    private readonly kind: LetterCase,
    private readonly locale: string | undefined,
    private prev: string,
    private sentenceStart: boolean,
  ) {}

  private pending = false

  apply(text: string): string {
    const up = (c: string) => c.toLocaleUpperCase(this.locale)
    const low = (c: string) => c.toLocaleLowerCase(this.locale)
    if (this.kind === 'upper') return up(text)
    if (this.kind === 'lower') return low(text)
    let out = ''
    for (const c of text) {
      const letter = LETTER_OR_DIGIT.test(c)
      if (this.kind === 'title') out += letter && !LETTER_OR_DIGIT.test(this.prev) ? up(c) : low(c)
      else {
        out += letter && this.sentenceStart ? up(c) : low(c)
        if (letter) this.sentenceStart = this.pending = false
        else if (SENTENCE_END.test(c)) this.pending = true
        else if (SPACE.test(c) && this.pending) this.sentenceStart = true
      }
      this.prev = c
    }
    return out
  }
}

/**
 * Changes the case of the selected text: lowercase, UPPERCASE, Title Case
 * (every word) or Sentence case (first letter of each sentence). Formatting is
 * kept; the selection stays on the changed text. Only text changes.
 */
export function changeCase(kind: LetterCase, locale?: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty) return false
    // any letter selected? (stops at the first one: cheap on a whole big document)
    let letters = false
    state.doc.nodesBetween(from, to, (node) => {
      if (letters) return false
      if (node.isText) letters = LETTER_OR_DIGIT.test(node.text)
      return !node.isText
    })
    if (!letters) return false
    if (!dispatch) return true
    const pieces: { from: number; to: number; text: string; marks: readonly Mark[] }[] = []
    let run: CaseRun | null = null
    let block = -1
    state.doc.nodesBetween(from, to, (node, pos, parent) => {
      if (!node.isText || !parent) return true
      const start = Math.max(from, pos)
      const end = Math.min(to, pos + node.nodeSize)
      const $start = state.doc.resolve(start)
      if ($start.start() !== block) {
        // a new paragraph: what precedes the selection in it decides the first word/sentence
        block = $start.start()
        const before = parent.textBetween(0, $start.parentOffset, undefined, '\ufffc')
        run = new CaseRun(
          kind,
          locale,
          before.slice(-1),
          !before.trim() || /[.!?…]\s+[^\p{L}\p{N}]*$/u.test(before),
        )
      }
      const original = node.text.slice(start - pos, end - pos)
      const text = run!.apply(original)
      if (text !== original) pieces.push({ from: start, to: end, text, marks: node.marks })
      return false
    })
    const tr = state.tr
    for (const p of pieces.reverse())
      tr.replaceWith(p.from, p.to, state.schema.text(p.text, p.marks))
    tr.setSelection(TextSelection.create(tr.doc, from, tr.mapping.map(to)))
    // its own undo step, even right after typing or another change
    dispatch(tr.setMeta(CLOSE_HISTORY, true).scrollIntoView())
    return true
  }
}
