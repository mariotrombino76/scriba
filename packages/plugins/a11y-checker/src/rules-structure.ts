import { Selection, TextSelection, type Node } from '@scriba-editor/core'
import { wrapInList } from '@scriba-editor/plugin-list'
import { toggleHeader } from '@scriba-editor/plugin-table'
import type { Rule } from './rule.js'
import type { A11yAction } from './types.js'
import {
  WCAG,
  cleanText,
  contentRange,
  onDoc,
  plain,
  runWithSelection,
  sharedAttrs,
} from './util.js'

/** A short, all-bold paragraph that reads like a heading. */
const MAX_FAKE_HEADING = 80
const BULLET = /^\s*([-*•–·▪◦‣])\s+/
const NUMBER = /^\s*(\d{1,3})[.)]\s+/
/** Blocks where a short bold line or a "1." is usually not a heading or a list. */
const SKIPPED_PARENTS = new Set(['list_item', 'table_cell', 'table_header', 'task_item'])

const isHeading = (node: Node) => node.type.name === 'heading'
const levelOf = (node: Node) => node.attrs['level'] as number

export const headingRules: Rule[] = [
  {
    id: 'heading-empty',
    run({ doc, report }) {
      const paragraph = doc.type.schema.nodes['paragraph']
      doc.descendants((node, pos) => {
        if (!isHeading(node)) return !node.isTextblock
        if (!plain(node.textContent))
          report({
            rule: 'heading-empty',
            severity: 'error',
            criterion: WCAG.infoAndRelationships,
            target: contentRange(node, pos),
            params: {},
            repair: paragraph
              ? {
                  kind: 'actions',
                  actions: [
                    {
                      id: 'toParagraph',
                      command: onDoc(doc, (tr) => {
                        tr.setBlockType(pos + 1, pos + 1, paragraph, sharedAttrs(node, paragraph))
                        return true
                      }),
                    },
                  ],
                }
              : null,
          })
        return false
      })
    },
  },
  {
    id: 'heading-order',
    run({ doc, report }) {
      let previous = 0
      doc.descendants((node, pos) => {
        if (!isHeading(node)) return !node.isTextblock
        if (!plain(node.textContent)) return false
        const level = levelOf(node)
        // the first heading may start at any level (the page around the editor has its own)
        if (previous && level > previous + 1) {
          const allowed = previous + 1
          const levels = [
            allowed,
            ...Array.from({ length: allowed - 1 }, (_, i) => allowed - 1 - i),
          ]
          report({
            rule: 'heading-order',
            severity: 'error',
            criterion: WCAG.infoAndRelationships,
            target: contentRange(node, pos),
            params: { level, previous },
            repair: {
              kind: 'heading',
              levels,
              apply: (to) =>
                onDoc(doc, (tr) => {
                  if (!levels.includes(to)) return false
                  tr.setNodeAttrs(pos, { level: to })
                  return true
                }),
            },
          })
        }
        previous = level
        return false
      })
    },
  },
  {
    id: 'paragraph-as-heading',
    run({ doc, report }) {
      const heading = doc.type.schema.nodes['heading']
      const bold = doc.type.schema.marks['bold']
      if (!heading || !bold) return
      let previous = 0
      const visit = (parent: Node, start: number) => {
        parent.forEach((node, offset, index) => {
          const pos = start + offset
          if (isHeading(node)) {
            if (plain(node.textContent)) previous = levelOf(node)
            return
          }
          if (!node.isTextblock) {
            if (!SKIPPED_PARENTS.has(node.type.name)) visit(node, pos + 1)
            return
          }
          if (node.type.name !== 'paragraph' || !looksLikeHeading(node, bold.name)) return
          // a heading introduces something: the last block, or one before another fake heading, is not
          const next = parent.maybeChild(index + 1)
          if (!next || (next.type.name === 'paragraph' && looksLikeHeading(next, bold.name))) return
          const suggested = Math.min(Math.max(previous + 1, 2), 6)
          const levels = [
            suggested,
            ...[1, 2, 3, 4, 5, 6].filter((l) => l !== suggested && l <= Math.max(previous + 1, 2)),
          ]
          report({
            rule: 'paragraph-as-heading',
            severity: 'warning',
            criterion: WCAG.infoAndRelationships,
            target: contentRange(node, pos),
            params: {},
            repair: {
              kind: 'heading',
              levels,
              apply: (level) =>
                onDoc(doc, (tr) => {
                  if (!levels.includes(level) || doc.nodeAt(pos) !== node) return false
                  tr.removeMark(pos + 1, pos + node.nodeSize - 1, bold)
                  tr.setBlockType(pos + 1, pos + 1, heading, sharedAttrs(node, heading, { level }))
                  return true
                }),
            },
          })
          previous = suggested
        })
      }
      visit(doc, 0)
    },
  },
]

/** Short, bold from start to end, no sentence punctuation at the end, no line breaks. */
function looksLikeHeading(node: Node, bold: string): boolean {
  const text = plain(node.textContent)
  if (!text || text.length > MAX_FAKE_HEADING || /[.,;:!?…]$/.test(text)) return false
  let allBold = true
  node.forEach((child) => {
    if (
      child.isText
        ? plain(child.text ?? '') && !child.marks.some((m) => m.type.name === bold)
        : true
    )
      allBold = false
  })
  return allBold
}

type ListKind = 'bullet' | 'number'

/** The marker a paragraph starts with, if its first text starts with one. */
function marker(node: Node): { kind: ListKind; length: number; number: number } | null {
  if (node.type.name !== 'paragraph' || !node.firstChild?.isText) return null
  const text = node.firstChild.text ?? ''
  const bullet = BULLET.exec(text)
  if (bullet && text.length > bullet[0].length)
    return { kind: 'bullet', length: bullet[0].length, number: 0 }
  const number = NUMBER.exec(text)
  if (number && text.length > number[0].length)
    return { kind: 'number', length: number[0].length, number: Number(number[1]) }
  return null
}

export const listRules: Rule[] = [
  {
    id: 'fake-list',
    run({ doc, report }) {
      const { bullet_list, ordered_list, list_item } = doc.type.schema.nodes
      const visit = (parent: Node, start: number) => {
        const children: { node: Node; pos: number }[] = []
        parent.forEach((node, offset) => children.push({ node, pos: start + offset }))
        for (let i = 0; i < children.length;) {
          const first = marker(children[i]!.node)
          if (!first) {
            const { node, pos } = children[i]!
            if (!node.isTextblock && !node.isAtom && !SKIPPED_PARENTS.has(node.type.name))
              visit(node, pos + 1)
            i++
            continue
          }
          let end = i + 1
          while (end < children.length && marker(children[end]!.node)?.kind === first.kind) end++
          if (end - i >= 2) {
            const items = children.slice(i, end)
            const listType = first.kind === 'bullet' ? bullet_list : ordered_list
            const actions: A11yAction[] = []
            if (listType && list_item)
              actions.push({
                id: first.kind === 'bullet' ? 'toBulletList' : 'toOrderedList',
                command: onDoc(doc, (tr) => {
                  for (const { node, pos } of [...items].reverse())
                    tr.delete(pos + 1, pos + 1 + marker(node)!.length)
                  const from = tr.mapping.map(items[0]!.pos + 1)
                  const to = tr.mapping.map(items[items.length - 1]!.pos + 1)
                  const attrs =
                    first.kind === 'number' && first.number !== 1 ? { start: first.number } : null
                  return runWithSelection(
                    tr,
                    (d) => TextSelection.between(d.resolve(from), d.resolve(to)),
                    wrapInList(listType, list_item, attrs),
                  )
                }),
              })
            const last = items[items.length - 1]!
            report({
              rule: 'fake-list',
              severity: 'warning',
              criterion: WCAG.infoAndRelationships,
              target: {
                kind: 'text',
                from: items[0]!.pos + 1,
                to: last.pos + last.node.nodeSize - 1,
              },
              params: { count: items.length },
              repair: actions.length ? { kind: 'actions', actions } : null,
            })
          }
          i = end
        }
      }
      visit(doc, 0)
    },
  },
]

const role = (node: Node) => node.type.spec['tableRole'] as string | undefined

export const tableRules: Rule[] = [
  {
    id: 'table-headers',
    run({ doc, report }) {
      doc.descendants((node, pos) => {
        if (role(node) !== 'table') return !node.isTextblock
        let headers = 0
        let cells = 0
        let columns = 0
        node.forEach((row) => {
          let width = 0
          row.forEach((cell) => {
            cells++
            width += (cell.attrs['colspan'] as number | undefined) ?? 1
            if (role(cell) === 'header_cell') headers++
          })
          columns = Math.max(columns, width)
        })
        if (headers || cells < 2) return true
        const inFirstCell = (d: Node) => Selection.near(d.resolve(pos + 3), 1)
        const actions: A11yAction[] = []
        if (columns > 1)
          actions.push({
            id: 'headerRow',
            command: onDoc(doc, (tr) => runWithSelection(tr, inFirstCell, toggleHeader('row'))),
          })
        if (node.childCount > 1)
          actions.push({
            id: 'headerColumn',
            command: onDoc(doc, (tr) => runWithSelection(tr, inFirstCell, toggleHeader('column'))),
          })
        report({
          rule: 'table-headers',
          severity: 'error',
          criterion: WCAG.infoAndRelationships,
          target: { kind: 'node', pos },
          params: {},
          repair: actions.length ? { kind: 'actions', actions } : null,
        })
        return true
      })
    },
  },
  {
    id: 'table-header-empty',
    run({ doc, report }) {
      doc.descendants((node, pos) => {
        if (role(node) !== 'header_cell') return !node.isTextblock
        if (!plain(node.textContent) && !hasLeaf(node))
          report({
            rule: 'table-header-empty',
            severity: 'warning',
            criterion: WCAG.infoAndRelationships,
            target: { kind: 'text', from: pos + 2, to: pos + node.nodeSize - 2 },
            params: {},
            repair: null,
          })
        return false
      })
    },
  },
  {
    id: 'table-caption',
    run({ doc, report }) {
      doc.descendants((node, pos) => {
        if (role(node) !== 'table') return !node.isTextblock
        if (!('caption' in node.attrs) || node.attrs['caption']) return true
        report({
          rule: 'table-caption',
          severity: 'warning',
          criterion: WCAG.infoAndRelationships,
          target: { kind: 'node', pos },
          params: {},
          repair: {
            kind: 'text',
            field: 'caption',
            value: '',
            maxLength: 500,
            apply: (value) =>
              onDoc(doc, (tr) => {
                const caption = cleanText(value ?? '', 500)
                if (!caption || doc.nodeAt(pos) !== node) return false
                tr.setNodeAttrs(pos, { caption })
                return true
              }),
          },
        })
        return true
      })
    },
  },
]

/** Whether a node holds an image or another leaf that can name it. */
function hasLeaf(node: Node): boolean {
  let found = false
  node.descendants((child) => {
    if (child.isLeaf && !child.isText && child.attrs['alt']) found = true
    return !found
  })
  return found
}
