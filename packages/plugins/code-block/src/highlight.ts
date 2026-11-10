import { Plugin, PluginKey, type EditorState, type Node } from '@scriba-editor/core'
import type { InlineDecoration } from '@scriba-editor/view'
import type { Element, ElementContent, Root } from 'hast'
import type { createLowlight } from 'lowlight'

export type Lowlight = ReturnType<typeof createLowlight>

export interface HighlightOptions {
  /** A lowlight instance with the grammars you want (`createLowlight(common)`…). */
  lowlight: Lowlight
  /** Guess the language of blocks without one (slower). Default false. */
  autoDetect?: boolean
  /** Longer blocks are not highlighted (keeps typing fast, §5.10). Default 100 000 chars. */
  maxLength?: number
}

interface Range {
  from: number
  to: number
  cls: string
}

/** Turns lowlight's token tree into ranges. Only class names and text lengths are used: no markup. */
function tokens(tree: Root): Range[] {
  const out: Range[] = []
  let pos = 0
  const walk = (nodes: readonly ElementContent[], classes: readonly string[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        if (classes.length && node.value.length)
          out.push({ from: pos, to: pos + node.value.length, cls: classes.join(' ') })
        pos += node.value.length
      } else if (node.type === 'element') {
        const own = (node as Element).properties?.['className']
        const names = Array.isArray(own) ? own.map(String).filter((c) => /^[\w-]+$/.test(c)) : []
        walk(node.children, [...classes, ...names])
      }
    }
  }
  walk(tree.children as ElementContent[], [])
  return out
}

export const codeHighlightKey = new PluginKey('codeHighlight')

/**
 * Syntax highlighting for code blocks, as view decorations (CLAUDE.md §5.5:
 * no HTML from the highlighter ever reaches the page). Results are cached
 * per code block node, so unchanged blocks are never re-highlighted.
 */
export function codeHighlight(options: HighlightOptions): Plugin {
  const { lowlight } = options
  const maxLength = options.maxLength ?? 100_000
  const perBlock = new WeakMap<Node, Range[]>()
  const perDoc = new WeakMap<Node, InlineDecoration[]>()

  const highlightBlock = (node: Node): Range[] => {
    const cached = perBlock.get(node)
    if (cached) return cached
    const text = node.textContent
    const language = node.attrs['language'] as string | null
    let ranges: Range[] = []
    if (text && text.length <= maxLength) {
      try {
        if (language && lowlight.registered(language))
          ranges = tokens(lowlight.highlight(language, text))
        else if (!language && options.autoDetect) ranges = tokens(lowlight.highlightAuto(text))
      } catch {
        ranges = [] // never let the highlighter break editing
      }
    }
    perBlock.set(node, ranges)
    return ranges
  }

  return new Plugin({
    key: codeHighlightKey,
    props: {
      decorations(state: EditorState): InlineDecoration[] {
        const cached = perDoc.get(state.doc)
        if (cached) return cached
        const decorations: InlineDecoration[] = []
        state.doc.descendants((node, pos) => {
          if (node.type.spec.code && node.isTextblock) {
            for (const r of highlightBlock(node))
              decorations.push({ from: pos + 1 + r.from, to: pos + 1 + r.to, class: r.cls })
            return false
          }
          return !node.isTextblock
        })
        perDoc.set(state.doc, decorations)
        return decorations
      },
    },
  })
}
