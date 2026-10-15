import type { EditorState, Node } from '@scriba/core'

/** What the counter shows. */
export interface TextCount {
  words: number
  /** Characters as people see them (an emoji or "é" is one), spaces included, line breaks not. */
  characters: number
  charactersNoSpaces: number
}

type Segmenter = {
  segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }>
}
type SegmenterCtor = new (locale?: string, options?: { granularity: string }) => Segmenter

const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter

/** Fallback word pattern: letters/digits, joined by an apostrophe or hyphen ("l'albero", "e-mail"). */
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

/** Words only (cheaper than `countString`: what the status bar needs). */
export function countWords(text: string, locale?: string): number {
  if (!Seg) return text.match(WORD)?.length ?? 0
  let words = 0
  for (const s of new Seg(locale, { granularity: 'word' }).segment(text)) if (s.isWordLike) words++
  return words
}

/** Plain text of a document range as read: blocks, line breaks and images separate words. */
export function rangeText(doc: Node, from = 0, to = doc.content.size): string {
  return doc.content.textBetween(from, to, '\n', '\n')
}

/**
 * Counts words and characters in plain text. Words come from `Intl.Segmenter`
 * when available (works for languages without spaces, e.g. Japanese).
 */
export function countString(text: string, locale?: string): TextCount {
  const visible = text.replace(/\n/g, '')
  let characters = 0
  let blanks = 0
  if (Seg) {
    for (const g of new Seg(locale, { granularity: 'grapheme' }).segment(visible)) {
      characters++
      if (/^\s+$/u.test(g.segment)) blanks++
    }
  } else {
    for (const ch of visible) {
      characters++
      if (/\s/u.test(ch)) blanks++
    }
  }
  return { words: countWords(text, locale), characters, charactersNoSpaces: characters - blanks }
}

/** Counts a document range; blocks, line breaks and images separate words. */
export function countRange(doc: Node, from = 0, to = doc.content.size, locale?: string): TextCount {
  return countString(rangeText(doc, from, to), locale)
}

/** Counts of the whole document and of the selection (null when nothing is selected). */
export function countState(
  state: EditorState,
  locale?: string,
): { document: TextCount; selection: TextCount | null } {
  const { from, to, empty } = state.selection
  return {
    document: countRange(state.doc, 0, state.doc.content.size, locale),
    selection: empty ? null : countRange(state.doc, from, to, locale),
  }
}
