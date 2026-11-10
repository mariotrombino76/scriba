import type { Mark, Node } from '@scriba-editor/core'
import type { Rule } from './rule.js'
import { WCAG, cleanText, onDoc, plain } from './util.js'

/** Image alternative texts are at most this long (the image node's limit). */
const MAX_ALT = 1000
const MAX_LINK_TEXT = 500
const MAX_EMBED_TITLE = 200

/** Link texts that say nothing about where the link goes (compared lowercase, without punctuation). */
export const GENERIC_LINK_TEXTS: readonly string[] = [
  'qui',
  'clicca qui',
  'clicca',
  'premi qui',
  'questo',
  'questo link',
  'link',
  'leggi',
  'leggi qui',
  'leggi tutto',
  'leggi di più',
  'continua',
  'continua a leggere',
  'altro',
  'di più',
  'scopri di più',
  'vai',
  'here',
  'click here',
  'click',
  'this',
  'this link',
  'read more',
  'more',
  'learn more',
  'continue',
  'go',
]

const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|tiff?|heic)$/i
const CAMERA_NAME = /^(?:img|image|dsc|dscn|pxl|photo|foto|screenshot|schermata)[\s_-]?\d[\d_-]*$/i
const GENERIC_ALT = new Set([
  'immagine',
  'image',
  'foto',
  'photo',
  'picture',
  'img',
  'grafica',
  'graphic',
  'icona',
  'icon',
])

/** The file name of an image address, without extension ("" for data: URLs). */
function fileName(src: string): string {
  if (src.startsWith('data:')) return ''
  const path = src.split(/[?#]/)[0]!
  const last = path.slice(path.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(last)
      .replace(/\.[a-z0-9]+$/i, '')
      .toLowerCase()
  } catch {
    return last.toLowerCase()
  }
}

/** An alternative text that is a file name, a camera name or a word like "image". */
export function isUnhelpfulAlt(alt: string, src: string): boolean {
  const text = plain(alt).toLowerCase()
  if (!text) return false
  if (IMAGE_FILE.test(text) || CAMERA_NAME.test(text) || GENERIC_ALT.has(text)) return true
  const name = fileName(src)
  return name.length > 2 && text === name
}

const linkMark = (node: Node): Mark | undefined => node.marks.find((m) => m.type.name === 'link')

/** A run of inline content under the same link. */
export interface LinkRun {
  readonly from: number
  readonly to: number
  readonly mark: Mark
  readonly text: string
  /** Images in the run, with their position. */
  readonly images: readonly { readonly node: Node; readonly pos: number }[]
}

/** The links of a textblock, in order (one run per link mark). */
export function linkRuns(block: Node, pos: number): LinkRun[] {
  const runs: {
    from: number
    to: number
    mark: Mark
    text: string
    images: LinkRun['images'][number][]
  }[] = []
  block.forEach((child, offset) => {
    const at = pos + 1 + offset
    const mark = linkMark(child)
    const last = runs[runs.length - 1]
    if (!mark) return
    if (last && last.to === at && last.mark.eq(mark)) {
      last.to = at + child.nodeSize
      last.text += child.text ?? ''
    } else
      runs.push({ from: at, to: at + child.nodeSize, mark, text: child.text ?? '', images: [] })
    if (child.type.name === 'image') runs[runs.length - 1]!.images.push({ node: child, pos: at })
  })
  return runs
}

/** An image that is all of its link (no text next to it): its alt text names the link. */
function isWholeLink(doc: Node, pos: number, image: Node): boolean {
  if (!linkMark(image)) return false
  const $pos = doc.resolve(pos)
  const run = linkRuns($pos.parent, $pos.start() - 1).find((r) => r.from <= pos && pos < r.to)
  return !!run && !plain(run.text)
}

/** Replaces the text of a link, keeping the marks of its first character. */
function linkTextRepair(doc: Node, run: LinkRun) {
  return {
    kind: 'text' as const,
    field: 'linkText' as const,
    value: plain(run.text),
    maxLength: MAX_LINK_TEXT,
    apply: (value: string | null) =>
      onDoc(doc, (tr) => {
        const text = cleanText(value ?? '', MAX_LINK_TEXT)
        if (!text) return false
        const marks = doc.resolve(run.from + 1).marks()
        const first = doc.nodeAt(run.from)
        tr.replaceWith(
          run.from,
          run.to,
          doc.type.schema.text(text, first?.isText ? first.marks : marks),
        )
        return true
      }),
  }
}

function altRepair(doc: Node, image: Node, pos: number, decorative: boolean, value = '') {
  return {
    kind: 'text' as const,
    field: 'alt' as const,
    value,
    decorative,
    maxLength: MAX_ALT,
    apply: (raw: string | null) =>
      onDoc(doc, (tr) => {
        const alt = raw === null ? '' : cleanText(raw, MAX_ALT)
        if (raw !== null && !alt) return false
        if (doc.nodeAt(pos) !== image) return false
        tr.setNodeAttrs(pos, { alt })
        return true
      }),
  }
}

export const imageRules: Rule[] = [
  {
    id: 'image-alt',
    run({ doc, report }) {
      doc.descendants((node, pos) => {
        if (node.type.name !== 'image' || node.attrs['alt'] !== null) return true
        report({
          rule: 'image-alt',
          severity: 'error',
          criterion: WCAG.nonTextContent,
          target: { kind: 'node', pos },
          params: {},
          // an image that is the whole link must describe it: never decorative
          repair: altRepair(doc, node, pos, !isWholeLink(doc, pos, node)),
        })
        return false
      })
    },
  },
  {
    id: 'image-alt-filename',
    run({ doc, report }) {
      doc.descendants((node, pos) => {
        if (node.type.name !== 'image') return true
        const alt = node.attrs['alt'] as string | null
        if (alt && isUnhelpfulAlt(alt, node.attrs['src'] as string))
          report({
            rule: 'image-alt-filename',
            severity: 'error',
            criterion: WCAG.nonTextContent,
            target: { kind: 'node', pos },
            params: { alt: plain(alt) },
            repair: altRepair(doc, node, pos, !isWholeLink(doc, pos, node)),
          })
        return false
      })
    },
  },
  {
    id: 'image-alt-long',
    run({ doc, options, report }) {
      doc.descendants((node, pos) => {
        if (node.type.name !== 'image') return true
        const alt = node.attrs['alt'] as string | null
        if (alt && plain(alt).length > options.maxAltLength)
          report({
            rule: 'image-alt-long',
            severity: 'info',
            criterion: WCAG.nonTextContent,
            target: { kind: 'node', pos },
            params: { length: plain(alt).length, max: options.maxAltLength },
            repair: altRepair(doc, node, pos, false, plain(alt)),
          })
        return false
      })
    },
  },
]

/** Visits every textblock's links. */
function eachLink(
  doc: Node,
  visit: (run: LinkRun, runs: readonly LinkRun[], index: number) => void,
) {
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const runs = linkRuns(node, pos)
    runs.forEach((run, i) => visit(run, runs, i))
    return false
  })
}

/** Text of a link run for comparison: lowercase, without punctuation. */
const normalized = (text: string) => plain(text.toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' '))

export const linkRules: Rule[] = [
  {
    id: 'link-no-text',
    run({ doc, report }) {
      eachLink(doc, (run) => {
        if (plain(run.text)) return
        if (run.images.some((i) => i.node.attrs['alt'])) return
        // images still without a text are reported (and fixed) by 'image-alt'
        if (run.images.some((i) => i.node.attrs['alt'] === null)) return
        const image = run.images[0]
        report({
          rule: 'link-no-text',
          severity: 'error',
          criterion: WCAG.linkPurpose,
          target: image
            ? { kind: 'node', pos: image.pos }
            : { kind: 'text', from: run.from, to: run.to },
          params: {},
          repair: image ? altRepair(doc, image.node, image.pos, false) : linkTextRepair(doc, run),
        })
      })
    },
  },
  {
    id: 'link-text',
    run({ doc, options, report }) {
      eachLink(doc, (run) => {
        const text = normalized(run.text)
        if (
          !text ||
          !options.genericLinkTexts.has(text) ||
          run.images.some((i) => i.node.attrs['alt'])
        )
          return
        report({
          rule: 'link-text',
          severity: 'warning',
          criterion: WCAG.linkPurpose,
          target: { kind: 'text', from: run.from, to: run.to },
          params: { text: plain(run.text) },
          repair: linkTextRepair(doc, run),
        })
      })
    },
  },
  {
    id: 'adjacent-links',
    run({ doc, report }) {
      eachLink(doc, (run, runs, i) => {
        const next = runs[i + 1]
        if (!next || next.mark.attrs['href'] !== run.mark.attrs['href']) return
        // only spaces between them: the same link said twice (often an image and its caption)
        if (plain(doc.textBetween(run.to, next.from))) return
        report({
          rule: 'adjacent-links',
          severity: 'warning',
          criterion: WCAG.linkPurpose,
          target: { kind: 'text', from: run.from, to: next.to },
          params: {},
          repair: {
            kind: 'actions',
            actions: [
              {
                id: 'mergeLinks',
                command: onDoc(doc, (tr) => {
                  tr.addMark(run.from, next.to, run.mark)
                  return true
                }),
              },
            ],
          },
        })
      })
    },
  },
]

export const embedRules: Rule[] = [
  {
    id: 'embed-title',
    run({ doc, report }) {
      doc.descendants((node, pos) => {
        if (node.type.name !== 'embed') return !node.isTextblock
        if (plain((node.attrs['title'] as string) ?? '')) return false
        report({
          rule: 'embed-title',
          severity: 'warning',
          criterion: WCAG.nameRoleValue,
          target: { kind: 'node', pos },
          params: {},
          repair: {
            kind: 'text',
            field: 'title',
            value: '',
            maxLength: MAX_EMBED_TITLE,
            apply: (value) =>
              onDoc(doc, (tr) => {
                const title = cleanText(value ?? '', MAX_EMBED_TITLE)
                if (!title || doc.nodeAt(pos) !== node) return false
                tr.setNodeAttrs(pos, { title })
                return true
              }),
          },
        })
        return false
      })
    },
  },
]

/** The default list, normalized like the link texts. */
export const defaultGenericLinkTexts = (list: readonly string[] = GENERIC_LINK_TEXTS) =>
  new Set(list.map(normalized).filter(Boolean))
