import {
  LINE_HEIGHTS,
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
  withAttr,
} from '@scriba-editor/core'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
const ALIGNS: readonly string[] = ['left', 'center', 'right', 'justify']
/** Maximum indentation level; each level is 2em. */
export const MAX_INDENT = 8

function readAlign(el: DOMLikeElement): TextAlign | null {
  const value = (styleValue(el, 'text-align') ?? el.getAttribute('align') ?? '').toLowerCase()
  return ALIGNS.includes(value) ? (value as TextAlign) : null
}

export type LineHeight = (typeof LINE_HEIGHTS)[number]
export type TextDirection = 'ltr' | 'rtl'

/** Line height from a style: one of the allowed values, or a percentage of one (Word: 150%). */
function readLineHeight(el: DOMLikeElement): LineHeight | null {
  const raw = styleValue(el, 'line-height')?.trim()
  if (!raw) return null
  const pct = /^(\d{2,3})%$/.exec(raw)
  const value = pct ? String(Number(pct[1]) / 100) : raw
  return (LINE_HEIGHTS as readonly string[]).includes(value) ? (value as LineHeight) : null
}

/**
 * Only right-to-left is kept: left-to-right is the default (Google Docs writes
 * dir="ltr" on every block, which would only add noise).
 */
function readDirection(el: DOMLikeElement): 'rtl' | null {
  return el.getAttribute('dir')?.toLowerCase() === 'rtl' ? 'rtl' : null
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
 * Adds `align`, `indent` and `lineHeight` attributes (typed inline styles) and
 * `dir` (the `dir` attribute: text direction) to textblock specs (default:
 * paragraph and heading).
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
        lineHeight: {
          default: null,
          validate: (v) => v === null || (LINE_HEIGHTS as readonly unknown[]).includes(v),
        },
        dir: { default: null, validate: (v) => v === null || v === 'rtl' },
      },
      parseHTML: (spec.parseHTML ?? []).map((rule): ParseRule => ({
        ...rule,
        getAttrs: (el) => {
          const base = rule.getAttrs ? rule.getAttrs(el) : null
          if (base === false) return false
          return {
            ...base,
            align: readAlign(el),
            indent: readIndent(el),
            lineHeight: readLineHeight(el),
            dir: readDirection(el),
          }
        },
      })),
      ...(toHTML
        ? {
            toHTML: (node: Node): HTMLSpec => {
              const indent = node.attrs['indent'] as number
              const styled = withStyle(toHTML(node), {
                'text-align': node.attrs['align'] as string | null,
                'margin-left': indent ? `${indent * 2}em` : null,
                'line-height': node.attrs['lineHeight'] as string | null,
              })
              return withAttr(styled, 'dir', node.attrs['dir'] as string | null)
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

/** Sets one block attribute on the selected blocks that have it (`null` = default). */
function setBlockAttr(attr: string, value: unknown): Command {
  return (state, dispatch) => {
    let any = false
    const targets: number[] = []
    eachStyledBlock(state, attr, (node, pos) => {
      any = true
      if (node.attrs[attr] !== value) targets.push(pos)
    })
    if (!any) return false
    if (dispatch && targets.length) {
      const tr = state.tr
      for (const pos of targets) tr.setNodeAttrs(pos, { [attr]: value })
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** True when every selected block has this value of the attribute. */
function allBlocks(state: EditorState, attr: string, value: unknown): boolean {
  let all = true
  let any = false
  eachStyledBlock(state, attr, (node) => {
    any = true
    if (node.attrs[attr] !== value) all = false
  })
  return any && all
}

/** Sets the line height of the selected blocks (`null` = the theme's). */
export function setLineHeight(lineHeight: LineHeight | null): Command {
  return setBlockAttr('lineHeight', lineHeight)
}

export function hasLineHeight(state: EditorState, lineHeight: LineHeight | null): boolean {
  return allBlocks(state, 'lineHeight', lineHeight)
}

/**
 * Sets the text direction of the selected blocks: `'rtl'` for Arabic, Hebrew…;
 * `'ltr'` (or `null`) goes back to the default, left to right.
 */
export function setTextDirection(dir: TextDirection | null): Command {
  return setBlockAttr('dir', dir === 'rtl' ? 'rtl' : null)
}

export function hasTextDirection(state: EditorState, dir: TextDirection): boolean {
  return allBlocks(state, 'dir', dir === 'rtl' ? 'rtl' : null)
}
