import { Plugin, PluginKey, type EditorState, type Node } from '@scriba-editor/core'
import type { InlineDecoration } from '@scriba-editor/view'
import type { RawMatch } from './search.js'

/** A match in the document. */
export interface Match {
  from: number
  to: number
  groups: readonly string[]
}

export interface FindState {
  matches: readonly Match[]
  /** Index of the current match (-1: none). */
  current: number
}

export const findKey = new PluginKey<FindState>('findReplace')

const EMPTY: FindState = { matches: [], current: -1 }

/** Placeholder for inline leaves (images, line breaks): keeps text offsets equal to positions. */
const LEAF = '￼'

/** Text of every textblock with its content start, for searching. */
export function blockTexts(doc: Node): { starts: number[]; texts: string[] } {
  const starts: number[] = []
  const texts: string[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    node.forEach((child) => (text += child.isText ? child.text : LEAF))
    starts.push(pos + 1)
    texts.push(text)
    return false
  })
  return { starts, texts }
}

/** Raw matches (block, offsets) → document positions. */
export function toMatches(raw: readonly RawMatch[], starts: readonly number[]): Match[] {
  return raw.map(([block, from, to, groups]) => ({
    from: starts[block]! + from,
    to: starts[block]! + to,
    groups,
  }))
}

export function getFindState(state: EditorState): FindState {
  return findKey.getState(state) ?? EMPTY
}

/** Plugin keeping the matches (mapped through edits) and showing them as decorations. */
export function findPlugin(): Plugin<FindState> {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => EMPTY,
      apply(tr, value) {
        const meta = tr.getMeta<FindState>(findKey)
        if (meta) return meta
        if (!tr.docChanged || !value.matches.length) return value
        // keep highlights in place until the next search (dropping matches that were edited)
        const matches: Match[] = []
        let current = -1
        value.matches.forEach((m, i) => {
          const from = tr.mapping.mapResult(m.from, 1)
          const to = tr.mapping.mapResult(m.to, -1)
          if (from.deleted || to.deleted || to.pos - from.pos !== m.to - m.from) return
          if (i === value.current) current = matches.length
          matches.push({ from: from.pos, to: to.pos, groups: m.groups })
        })
        return { matches, current }
      },
    },
    props: {
      decorations(state: EditorState): InlineDecoration[] {
        const { matches, current } = getFindState(state)
        return matches.map((m, i) => ({
          from: m.from,
          to: m.to,
          class: i === current ? 'scriba-find-match scriba-find-current' : 'scriba-find-match',
        }))
      },
    },
  })
}
