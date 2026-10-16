import type { Mark, Node } from '@scriba/core'

type Docx = typeof import('docx')
type Run = import('docx').ParagraphChild
type Block = import('docx').Paragraph | import('docx').Table

const HEADINGS = [
  'HEADING_1',
  'HEADING_2',
  'HEADING_3',
  'HEADING_4',
  'HEADING_5',
  'HEADING_6',
] as const
const ALIGN = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED' } as const
const RASTER: Record<string, 'png' | 'jpg' | 'gif'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
}
const INDENT = 720 // twips per level (half an inch)

interface Context {
  docx: Docx
  /** One numbering instance per ordered list, so each list restarts at its own start. */
  lists: number
  images: Map<
    string,
    { data: Uint8Array; type: 'png' | 'jpg' | 'gif'; w: number; h: number } | null
  >
}

/** Bytes and size of a raster `data:` image (other images are written as their alt text). */
async function loadImage(
  src: string,
): Promise<Context['images'] extends Map<string, infer V> ? V : never> {
  const m = /^data:(image\/(?:png|jpeg|gif));base64,([a-z0-9+/=]+)$/i.exec(src)
  if (!m) return null
  const type = RASTER[m[1]!.toLowerCase()]
  if (!type) return null
  const bin = atob(m[2]!)
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
  let w = 400
  let h = 300
  try {
    const bitmap = await createImageBitmap(new Blob([data], { type: m[1]! }))
    w = bitmap.width
    h = bitmap.height
    bitmap.close()
  } catch {
    // size unknown: a 4:3 box
  }
  return { data, type, w, h }
}

/** Raster data: images of the document, loaded once before writing. */
async function collectImages(doc: Node, ctx: Context): Promise<void> {
  const srcs = new Set<string>()
  doc.descendants((node) => {
    if (node.type.name === 'image') srcs.add(node.attrs['src'] as string)
  })
  for (const src of srcs) ctx.images.set(src, await loadImage(src))
}

function runs(node: Node, ctx: Context): Run[] {
  const { docx } = ctx
  const out: Run[] = []
  let link: { href: string; children: Run[] } | null = null
  const flush = () => {
    if (link) out.push(new docx.ExternalHyperlink({ link: link.href, children: link.children }))
    link = null
  }
  node.forEach((child) => {
    const marks = child.marks.filter((m: Mark) => m.type.spec.serialize !== false)
    const has = (name: string) => marks.some((m) => m.type.name === name)
    const href = marks.find((m) => m.type.name === 'link')?.attrs['href'] as string | undefined
    let run: Run
    if (child.isText) {
      run = new docx.TextRun({
        text: child.text!,
        bold: has('bold'),
        italics: has('italic'),
        strike: has('strike'),
        ...(has('underline') || href ? { underline: {} } : {}),
        ...(has('code') ? { font: 'Courier New' } : {}),
        ...(href ? { style: 'Hyperlink' } : {}),
      })
    } else if (child.type.name === 'hard_break') {
      run = new docx.TextRun({ text: '', break: 1 })
    } else if (child.type.name === 'image') {
      const img = ctx.images.get(child.attrs['src'] as string)
      const width = Math.min((child.attrs['width'] as number | null) ?? img?.w ?? 400, 600)
      run = img
        ? new docx.ImageRun({
            type: img.type,
            data: img.data,
            transformation: { width, height: Math.round((width * img.h) / Math.max(1, img.w)) },
            altText: { name: 'image', description: String(child.attrs['alt'] ?? ''), title: '' },
          })
        : new docx.TextRun({ text: String(child.attrs['alt'] || '[immagine]') })
    } else {
      const leaf = child.type.spec.leafText
      run = new docx.TextRun({ text: leaf ? leaf(child) : '' })
    }
    if (href && (!link || link.href !== href)) {
      flush()
      link = { href, children: [] }
    } else if (!href) flush()
    if (link) link.children.push(run)
    else out.push(run)
  })
  flush()
  return out
}

interface Place {
  indent: number
  list?: { level: number; ordered: boolean; instance: number }
}

function paragraph(
  node: Node,
  ctx: Context,
  place: Place,
  first: boolean,
): import('docx').Paragraph {
  const { docx } = ctx
  const align = node.attrs['align'] as keyof typeof ALIGN | null | undefined
  const numbered = first && place.list
  return new docx.Paragraph({
    children: runs(node, ctx),
    ...(node.type.name === 'heading'
      ? { heading: docx.HeadingLevel[HEADINGS[(node.attrs['level'] as number) - 1] ?? 'HEADING_1'] }
      : {}),
    ...(align && ALIGN[align] ? { alignment: docx.AlignmentType[ALIGN[align]] } : {}),
    ...(numbered
      ? place.list!.ordered
        ? {
            numbering: {
              reference: 'scriba-ol',
              level: place.list!.level,
              instance: place.list!.instance,
            },
          }
        : { bullet: { level: place.list!.level } }
      : place.indent
        ? { indent: { left: place.indent * INDENT } }
        : {}),
  })
}

function blocks(parent: Node, ctx: Context, place: Place): Block[] {
  const { docx } = ctx
  const out: Block[] = []
  parent.forEach((node, _offset, index) => {
    const name = node.type.name
    if (node.isTextblock && name !== 'code_block') {
      out.push(paragraph(node, ctx, place, index === 0))
    } else if (name === 'code_block') {
      for (const line of node.textContent.split('\n'))
        out.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: line, font: 'Courier New' })],
            indent: { left: place.indent * INDENT },
          }),
        )
    } else if (name === 'bullet_list' || name === 'ordered_list') {
      const ordered = name === 'ordered_list'
      const level = place.list ? Math.min(place.list.level + 1, 8) : 0
      const instance = ordered ? ++ctx.lists : 0
      node.forEach((item) => {
        out.push(
          ...blocks(item, ctx, {
            indent: place.indent + level + 1,
            list: { level, ordered, instance },
          }),
        )
      })
    } else if (name === 'table') {
      const rows: import('docx').TableRow[] = []
      node.forEach((row) => {
        const cells: import('docx').TableCell[] = []
        row.forEach((cell) =>
          cells.push(
            new docx.TableCell({
              children: blocks(cell, ctx, { indent: 0 }).filter(
                (b): b is import('docx').Paragraph => b instanceof docx.Paragraph,
              ),
              columnSpan: (cell.attrs['colspan'] as number) || 1,
              rowSpan: (cell.attrs['rowspan'] as number) || 1,
            }),
          ),
        )
        rows.push(new docx.TableRow({ children: cells }))
      })
      out.push(new docx.Table({ rows, width: { size: 100, type: docx.WidthType.PERCENTAGE } }))
    } else if (node.isAtom && node.type.spec.leafText) {
      out.push(
        new docx.Paragraph({
          children: [new docx.TextRun({ text: node.type.spec.leafText(node) })],
        }),
      )
    } else if (!node.isLeaf) {
      // quotes, callouts, unknown containers: their content, indented
      out.push(...blocks(node, ctx, { indent: place.indent + 1 }))
    }
  })
  return out
}

/** A Word file (.docx) of the document (docx loaded on demand). */
export async function documentToDocx(doc: Node, title: string): Promise<Blob> {
  const docx = await import('docx')
  const ctx: Context = { docx, lists: 0, images: new Map() }
  await collectImages(doc, ctx)
  const children = blocks(doc, ctx, { indent: 0 })
  const levels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: docx.LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: docx.AlignmentType.START,
    style: { paragraph: { indent: { left: INDENT * (level + 1), hanging: 360 } } },
  }))
  const file = new docx.Document({
    title,
    numbering: { config: [{ reference: 'scriba-ol', levels }] },
    sections: [{ children: children.length ? children : [new docx.Paragraph({})] }],
  })
  return docx.Packer.toBlob(file)
}
