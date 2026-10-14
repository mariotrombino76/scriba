import {
  styleValue,
  withStyle,
  type Command,
  type DOMLikeElement,
  type EditorState,
  type HTMLSpec,
  type Node,
  type NodeSpec,
  type NodeType,
  type ParseRule,
} from '@scriba/core'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
const ALIGNS: readonly string[] = ['left', 'center', 'right', 'justify']
/** Maximum indentation level; each level is 2em. */
export const MAX_INDENT = 8

function readAlign(el: DOMLikeElement): TextAlign | null {
  const value = (styleValue(el, 'text-align') ?? el.getAttribute('align') ?? '').toLowerCase()
  return ALIGNS.includes(value) ? (value as TextAlign) : null
}

/** Reads indentation from margin-left/padding-left (Word, TinyMCE, Google Docs). */
function readIndent(el: DOMLikeElement): number {
  const raw = styleValue(el, 'margin-left') ?? styleValue(el, 'padding-left')
  const m = raw && /^(\d+(?:\.\d+)?)(em|rem|px|pt)$/.exec(raw)
  if (!m) return 0
  const per: Record<string, number> = { em: 2, rem: 2, px: 32, pt: 24 }
  return Math.max(0, Math.min(MAX_INDENT, Math.round(Number(m[1]) / per[m[2]!]!)))
}

/**
 * Adds `align` and `indent` attributes to textblock specs (default: paragraph
 * and heading), read from / written to typed inline styles.
 */
export function withBlockStyles<N extends Record<string, NodeSpec>>(
  nodes: N,
  names: readonly string[] = ['paragraph', 'heading'],
): N {
  const out: Record<string, NodeSpec> = { ...nodes }
  for (const name of names) {
    const spec = nodes[name]
    if (!spec) continue
    const toHTML = spec.toHTML
    out[name] = {
      ...spec,
      attrs: {
        ...spec.attrs,
        align: { default: null, validate: (v) => v === null || ALIGNS.includes(v as string) },
        indent: {
          default: 0,
          validate: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_INDENT,
        },
      },
      parseHTML: (spec.parseHTML ?? []).map((rule): ParseRule => ({
        ...rule,
        getAttrs: (el) => {
          const base = rule.getAttrs ? rule.getAttrs(el) : null
          if (base === false) return false
          return { ...base, align: readAlign(el), indent: readIndent(el) }
        },
      })),
      ...(toHTML
        ? {
            toHTML: (node: Node): HTMLSpec => {
              const indent = node.attrs['indent'] as number
              return withStyle(toHTML(node), {
                'text-align': node.attrs['align'] as string | null,
                'margin-left': indent ? `${indent * 2}em` : null,
              })
            },
          }
        : {}),
    }
  }
  return out as N
}

/** Textblocks in the selection that have the attribute. */
function eachStyledBlock(
  state: EditorState,
  attr: string,
  f: (node: Node, pos: number) => void,
): void {
  const { from, to } = state.selection
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    if (node.type.spec.attrs && attr in node.type.spec.attrs) f(node, pos)
    return false
  })
}

/** Sets the alignment of the selected blocks (`null` = default). */
export function setTextAlign(align: TextAlign | null): Command {
  return (state, dispatch) => {
    const targets: number[] = []
    eachStyledBlock(state, 'align', (node, pos) => {
      if (node.attrs['align'] !== align) targets.push(pos)
    })
    let any = false
    eachStyledBlock(state, 'align', () => (any = true))
    if (!any) return false
    if (dispatch && targets.length) {
      const tr = state.tr
      for (const pos of targets) tr.setNodeAttrs(pos, { align })
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Changes the indentation of the selected blocks by `delta` levels. */
export function changeIndent(delta: number): Command {
  return (state, dispatch) => {
    const targets: { pos: number; indent: number }[] = []
    eachStyledBlock(state, 'indent', (node, pos) => {
      const indent = Math.max(0, Math.min(MAX_INDENT, (node.attrs['indent'] as number) + delta))
      if (indent !== node.attrs['indent']) targets.push({ pos, indent })
    })
    if (!targets.length) return false
    if (dispatch) {
      const tr = state.tr
      for (const { pos, indent } of targets) tr.setNodeAttrs(pos, { indent })
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** True when every selected block has this alignment (null alignment counts as left). */
export function isAligned(state: EditorState, align: TextAlign): boolean {
  let all = true
  let any = false
  eachStyledBlock(state, 'align', (node) => {
    any = true
    const value = (node.attrs['align'] as string | null) ?? 'left'
    if (value !== align) all = false
  })
  return any && all
}

export type { NodeType }
