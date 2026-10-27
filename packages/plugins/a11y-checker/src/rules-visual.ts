import type { Mark, Node } from '@scriba/core'
import { contrastRatio, formatRatio, suggestColor } from './contrast.js'
import type { Rule } from './rule.js'
import type { A11yAction } from './types.js'
import { WCAG, contentRange, onDoc, withinLevel } from './util.js'

/** Default sizes of headings (browser stylesheet, 16px text): they are bold. */
const HEADING_PX = [32, 24, 18.72, 16, 13.28, 10.72]
const BASE_PX = 16

const markAttr = (marks: readonly Mark[], name: string, attr: string) =>
  marks.find((m) => m.type.name === name)?.attrs[attr] as string | undefined

/** Font size in px from a `font_size` mark value (relative units against 16px). */
function sizePx(size: string | undefined, fallback: number): number {
  const m = size ? /^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/.exec(size) : null
  if (!m) return fallback
  const n = Number(m[1])
  switch (m[2]) {
    case 'pt':
      return (n * 4) / 3
    case 'em':
    case 'rem':
      return n * BASE_PX
    case '%':
      return (n / 100) * BASE_PX
    default:
      return n
  }
}

/** WCAG "large scale" text: at least 18pt (24px), or 14pt (18.66px) bold. */
function isLarge(px: number, bold: boolean): boolean {
  return px >= 24 || (bold && px >= 18.66)
}

interface Piece {
  from: number
  to: number
  color: string
  background: string
  min: number
  /** Has a color mark of its own (removing them gives the page's colors back). */
  marked: boolean
}

export const visualRules: Rule[] = [
  {
    id: 'contrast',
    run({ doc, options, report }) {
      if (!withinLevel(WCAG.contrastMinimum, options.level)) return
      const enhanced = withinLevel(WCAG.contrastEnhanced, options.level)
      const criterion = enhanced ? WCAG.contrastEnhanced : WCAG.contrastMinimum
      const textColor = doc.type.schema.marks['text_color']
      const backgroundMark = doc.type.schema.marks['background_color']

      const visit = (node: Node, pos: number, cellBackground: string | null) => {
        if (node.isTextblock) return check(node, pos, cellBackground)
        const background = (node.attrs['background'] as string | null | undefined) ?? cellBackground
        node.forEach((child, offset) => {
          if (!child.isLeaf) visit(child, pos + 1 + offset, background)
        })
      }

      const check = (block: Node, pos: number, cellBackground: string | null) => {
        const heading = block.type.name === 'heading' ? (block.attrs['level'] as number) : 0
        const basePx = heading ? (HEADING_PX[heading - 1] ?? BASE_PX) : BASE_PX
        const pieces: Piece[] = []
        block.forEach((child, offset) => {
          if (!child.isText || !child.text?.trim()) return
          const color = markAttr(child.marks, 'text_color', 'color')
          const highlight = markAttr(child.marks, 'background_color', 'color')
          const background = highlight ?? cellBackground
          // text with no color of its own shows the page's colors: nothing to check
          if (!color && !background) return
          const bold = !!heading || child.marks.some((m) => m.type.name === 'bold')
          const large = isLarge(sizePx(markAttr(child.marks, 'font_size', 'size'), basePx), bold)
          const min = enhanced ? (large ? 4.5 : 7) : large ? 3 : 4.5
          const from = pos + 1 + offset
          const piece = {
            from,
            to: from + child.nodeSize,
            color: color ?? options.color,
            background: background ?? options.background,
            min,
            marked: !!color || !!highlight,
          }
          const last = pieces[pieces.length - 1]
          if (
            last &&
            last.to === piece.from &&
            last.color === piece.color &&
            last.background === piece.background &&
            last.min === piece.min
          ) {
            last.to = piece.to
            last.marked ||= piece.marked
          } else pieces.push(piece)
        })
        for (const piece of pieces) {
          const ratio = contrastRatio(piece.color, piece.background)
          if (ratio >= piece.min) continue
          const actions: A11yAction[] = []
          const suggested = textColor
            ? suggestColor(piece.color, piece.background, piece.min)
            : null
          if (suggested && textColor)
            actions.push({
              id: 'suggestedColor',
              params: { color: suggested },
              command: onDoc(doc, (tr) => {
                tr.addMark(piece.from, piece.to, textColor.create({ color: suggested }))
                return true
              }),
            })
          // without its color marks the text has the page's color on the cell's (or page's) background
          const plainBackground = cellBackground ?? options.background
          if (piece.marked && contrastRatio(options.color, plainBackground) >= piece.min)
            actions.push({
              id: 'removeColor',
              command: onDoc(doc, (tr) => {
                if (textColor) tr.removeMark(piece.from, piece.to, textColor)
                if (backgroundMark) tr.removeMark(piece.from, piece.to, backgroundMark)
                return true
              }),
            })
          report({
            rule: 'contrast',
            severity: 'error',
            criterion,
            target: { kind: 'text', from: piece.from, to: piece.to },
            params: {
              ratio: formatRatio(ratio),
              required: String(piece.min),
              color: piece.color,
              background: piece.background,
            },
            repair: actions.length ? { kind: 'actions', actions } : null,
          })
        }
      }

      visit(doc, -1, null)
    },
  },
  {
    id: 'justified-text',
    run({ doc, options, report }) {
      if (!withinLevel(WCAG.visualPresentation, options.level)) return
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true
        if (node.attrs['align'] === 'justify')
          report({
            rule: 'justified-text',
            severity: 'warning',
            criterion: WCAG.visualPresentation,
            target: contentRange(node, pos),
            params: {},
            repair: {
              kind: 'actions',
              actions: [
                {
                  id: 'alignLeft',
                  command: onDoc(doc, (tr) => {
                    tr.setNodeAttrs(pos, { align: null })
                    return true
                  }),
                },
              ],
            },
          })
        return false
      })
    },
  },
]
