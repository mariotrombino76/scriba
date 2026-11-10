import { STYLE_DATA_ATTR } from '@scriba-editor/core'

/**
 * Cleans pasted HTML before the schema parser. Runs on the body of an INERT
 * document (`DOMParser`): nothing here executes, and whatever it leaves still
 * goes through the schema parser, so this is about fidelity, not security.
 */

export interface PasteCleanOptions {
  /** Keep font family and size (default false: Word/Docs put Calibri 11pt everywhere). */
  keepFonts?: boolean
  /** Keep text colors (default true; black and near-black are always dropped as "default"). */
  keepColors?: boolean
}

export type PasteSource = 'word' | 'google-docs' | 'other'

/** Guesses where the HTML comes from. */
export function detectSource(body: HTMLElement): PasteSource {
  const doc = body.ownerDocument
  if (body.querySelector('[id^="docs-internal-guid"]')) return 'google-docs'
  const html = doc.documentElement
  const generator =
    doc.querySelector('meta[name="Generator"], meta[name="generator"]')?.getAttribute('content') ??
    ''
  if (
    /Microsoft (Word|Excel|PowerPoint)/i.test(generator) ||
    [...html.attributes].some((a) => a.value.includes('urn:schemas-microsoft-com:office')) ||
    body.querySelector('[class^="Mso"], [class*=" Mso"], [style*="mso-"]')
  ) {
    return 'word'
  }
  return 'other'
}

const FONT_PROPS = ['font-family', 'font-size']

function unwrap(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  el.remove()
}

/** Black / "windowtext" / near-black: the default text color, not a choice. */
function isDefaultColor(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v === 'windowtext' || v === 'black' || v === 'auto' || v === 'inherit' || v === 'initial')
    return true
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)
  let rgb: number[] | null = null
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(v)
  if (m) rgb = [Number(m[1]), Number(m[2]), Number(m[3])]
  return !!rgb && rgb.every((c) => c <= 0x40)
}

/** Inline style as declarations (read from the attribute text: no CSSOM, see below). */
function readStyle(el: Element): [string, string][] {
  const raw = el.getAttribute(STYLE_DATA_ATTR) ?? el.getAttribute('style') ?? ''
  const out: [string, string][] = []
  for (const decl of raw.split(';')) {
    const colon = decl.indexOf(':')
    if (colon < 0) continue
    const prop = decl.slice(0, colon).trim().toLowerCase()
    const value = decl.slice(colon + 1).trim()
    if (prop && value) out.push([prop, value])
  }
  return out
}

/**
 * Drops default fonts/colors. The cleaned style goes into `data-scriba-style`:
 * Chromium enforces the page's CSP inside the inert document, so its CSSOM
 * ignores inline styles and rewriting `style` would raise CSP violations.
 */
function cleanStyles(root: HTMLElement, options: PasteCleanOptions): void {
  for (const el of root.querySelectorAll<HTMLElement>('[style]')) {
    const kept = readStyle(el).filter(([prop, value]) => {
      if (!options.keepFonts && FONT_PROPS.includes(prop)) return false
      if (prop === 'color' && (options.keepColors === false || isDefaultColor(value))) return false
      if (prop === 'background-color' && (options.keepColors === false || isTransparent(value)))
        return false
      return true
    })
    el.removeAttribute('style')
    el.setAttribute(STYLE_DATA_ATTR, kept.map(([p, v]) => `${p}: ${v}`).join('; '))
  }
  for (const font of root.querySelectorAll('font')) {
    if (!options.keepFonts) {
      font.removeAttribute('face')
      font.removeAttribute('size')
    }
    const color = font.getAttribute('color')
    if (color && (options.keepColors === false || isDefaultColor(color)))
      font.removeAttribute('color')
  }
}

function isTransparent(value: string): boolean {
  const v = value.trim().toLowerCase().replace(/\s+/g, '')
  return v === 'transparent' || v === 'rgba(0,0,0,0)' || v === 'initial' || v === 'inherit'
}

/** `<ul><li>a</li><ul>…</ul></ul>` (Google Docs, some sites) → the sub-list goes into the previous item. */
function nestStrayLists(root: HTMLElement): void {
  for (const list of [...root.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol')]) {
    const prev = list.previousElementSibling
    if (prev?.tagName === 'LI') prev.appendChild(list)
  }
}

interface WordItem {
  p: HTMLElement
  level: number
  ordered: boolean
  listId: string
}

/**
 * Word writes lists as paragraphs with `mso-list:l0 level2 lfo1` and the bullet
 * typed in a `mso-list:Ignore` span. Rebuild real, nested lists from them.
 */
function rebuildWordLists(root: HTMLElement): void {
  const doc = root.ownerDocument
  const items: WordItem[] = []
  for (const p of root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6')) {
    const style = p.getAttribute('style') ?? ''
    const m = /mso-list:\s*(l\d+)\s+level(\d+)/i.exec(style)
    if (!m) continue
    const marker = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]')
    const markerText = (marker?.textContent ?? '').replace(/\u00a0/g, ' ').trim()
    items.push({
      p,
      level: Math.max(1, Math.min(9, Number(m[2]))),
      ordered: /^[(]?([0-9]+|[a-z]|[ivxlcdm]+)[.)]/i.test(markerText),
      listId: m[1]!,
    })
  }
  // Groups of consecutive list paragraphs (siblings) become one list tree.
  let i = 0
  while (i < items.length) {
    const group = [items[i]!]
    while (i + group.length < items.length) {
      const next = items[i + group.length]!
      const last = group[group.length - 1]!
      if (next.p.previousElementSibling !== last.p) break
      group.push(next)
    }
    i += group.length
    const stack: { list: HTMLElement; level: number }[] = []
    const first = group[0]!
    let root: HTMLElement | null = null
    for (const item of group) {
      while (stack.length && stack[stack.length - 1]!.level > item.level) stack.pop()
      let top = stack[stack.length - 1]
      if (!top || top.level < item.level) {
        const list = doc.createElement(item.ordered ? 'ol' : 'ul')
        if (top) {
          const lastItem =
            top.list.lastElementChild ?? top.list.appendChild(doc.createElement('li'))
          lastItem.appendChild(list)
        } else {
          root = list
        }
        top = { list, level: item.level }
        stack.push(top)
      }
      const li = doc.createElement('li')
      const para = doc.createElement('p')
      for (const marker of item.p.querySelectorAll(
        '[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]',
      ))
        marker.remove()
      while (item.p.firstChild) para.appendChild(item.p.firstChild)
      li.appendChild(para)
      top.list.appendChild(li)
    }
    if (root) first.p.before(root)
    for (const item of group) item.p.remove()
  }
}

/** Word-only markup: `o:p` and other namespaced tags, title/subtitle classes, empty spacer paragraphs. */
function cleanWord(root: HTMLElement): void {
  const doc = root.ownerDocument
  for (const el of [...root.querySelectorAll('*')]) {
    if (el.tagName.includes(':')) el.remove() // o:p, v:shape, w:sdt… (o:p only holds a &nbsp;)
  }
  for (const el of root.querySelectorAll(
    '[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]',
  )) {
    if (!el.closest('[style*="mso-list:l"], [style*="mso-list: l"]')) el.remove()
  }
  for (const [cls, tag] of [
    ['MsoTitle', 'h1'],
    ['MsoSubtitle', 'h2'],
  ] as const) {
    for (const p of [...root.querySelectorAll(`p.${cls}`)]) {
      const h = doc.createElement(tag)
      while (p.firstChild) h.appendChild(p.firstChild)
      p.replaceWith(h)
    }
  }
}

/** Google Docs: unwrap the guid wrapper, drop stray top-level <br>. */
function cleanGoogleDocs(root: HTMLElement): void {
  for (const wrapper of [...root.querySelectorAll('b[id^="docs-internal-guid"]')]) unwrap(wrapper)
  for (const br of [...root.querySelectorAll(':scope > br')]) br.remove()
}

/** Paragraphs holding only spaces / &nbsp; become truly empty. */
function emptySpacerParagraphs(root: HTMLElement): void {
  for (const p of root.querySelectorAll('p')) {
    if (!p.querySelector('img, br') && !(p.textContent ?? '').replace(/[\s\u00a0]/g, '')) {
      while (p.firstChild) p.firstChild.remove()
    }
  }
}

/** Cleans the pasted DOM in place. */
export function cleanPastedDOM(body: HTMLElement, options: PasteCleanOptions = {}): PasteSource {
  const source = detectSource(body)
  if (source === 'word') {
    rebuildWordLists(body)
    cleanWord(body)
  }
  if (source === 'google-docs') cleanGoogleDocs(body)
  nestStrayLists(body)
  cleanStyles(body, options)
  emptySpacerParagraphs(body)
  return source
}
