import type { EditorState, Node } from '@scriba/core'

/**
 * A visual-only class on a range of inline content (syntax highlighting,
 * search results…). Decorations never change the document, so they are not
 * saved, not undoable and not shared with collaborators.
 */
export interface InlineDecoration {
  from: number
  to: number
  /** Space-separated class names (letters, digits, `-`, `_`). */
  class: string
}

/** Plugin prop: `props: { decorations: (state) => InlineDecoration[] }`. */
export type DecorationSource = (state: EditorState) => readonly InlineDecoration[]

const CLASS_LIST = /^[A-Za-z_][\w-]*( [A-Za-z_][\w-]*)*$/

interface BlockDeco {
  from: number
  to: number
  cls: string
}

/** Decorations grouped by the content start of their textblock (relative positions). */
export class DecorationIndex {
  static readonly empty = new DecorationIndex(new Map())

  private constructor(private readonly blocks: ReadonlyMap<number, readonly BlockDeco[]>) {}

  static build(doc: Node, decorations: readonly InlineDecoration[]): DecorationIndex {
    if (!decorations.length) return DecorationIndex.empty
    const blocks = new Map<number, BlockDeco[]>()
    const size = doc.content.size
    for (const d of decorations) {
      if (!(d.from < d.to) || d.from < 0 || d.to > size || !CLASS_LIST.test(d.class)) continue
      const $from = doc.resolve(d.from)
      if (!$from.parent.inlineContent) continue
      const start = $from.start()
      const end = Math.min(d.to, $from.end())
      if (end <= d.from) continue
      let list = blocks.get(start)
      if (!list) blocks.set(start, (list = []))
      list.push({ from: d.from - start, to: end - start, cls: d.class })
    }
    for (const list of blocks.values()) list.sort((a, b) => a.from - b.from || a.to - b.to)
    return new DecorationIndex(blocks)
  }

  /** Decorations of the textblock whose content starts at `contentStart` (relative positions). */
  forBlock(contentStart: number): readonly BlockDeco[] {
    return this.blocks.get(contentStart) ?? []
  }

  /** Stable string describing a block's decorations (to detect changes). */
  key(contentStart: number): string {
    return this.forBlock(contentStart)
      .map((d) => `${d.from}-${d.to}-${d.cls}`)
      .join('|')
  }

  /** Content starts of blocks whose decorations differ between two indexes. */
  static changedBlocks(a: DecorationIndex, b: DecorationIndex): number[] {
    if (a === b) return []
    const starts = new Set([...a.blocks.keys(), ...b.blocks.keys()])
    return [...starts].filter((s) => a.key(s) !== b.key(s))
  }
}

/** Collects decorations from all plugins of the state. */
export function stateDecorations(state: EditorState): DecorationIndex {
  const all: InlineDecoration[] = []
  for (const plugin of state.plugins) {
    const source = plugin.props['decorations'] as DecorationSource | undefined
    if (typeof source === 'function') all.push(...source(state))
  }
  return DecorationIndex.build(state.doc, all)
}
