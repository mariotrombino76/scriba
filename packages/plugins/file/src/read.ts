import { HTMLLimitError, parseHTML, type Node, type Schema } from '@scriba-editor/core'
import { parseMarkdown } from '@scriba-editor/plugin-markdown'
import { parseInertHTML } from '@scriba-editor/view'

/** Formats the editor opens. */
export type OpenFormat = 'docx' | 'html' | 'markdown' | 'text'

export interface OpenLimits {
  /** Largest file accepted (bytes, default 10 MB). */
  maxFileBytes?: number
  /** Largest uncompressed content of a .docx (bytes, default 50 MB: guards against zip bombs). */
  maxUnzippedBytes?: number
  /** Most entries in a .docx (default 2000). */
  maxZipEntries?: number
}

/** Why a file could not be opened (the message key says it to the user). */
export class OpenFileError extends Error {
  constructor(
    readonly reason: 'type' | 'size' | 'damaged' | 'tooComplex',
    message = reason,
  ) {
    super(message)
    this.name = 'OpenFileError'
  }
}

export const OPEN_ACCEPT = '.docx,.html,.htm,.md,.markdown,.txt'

/** The format of a file, from its extension (the type a browser reports is not reliable). */
export function formatOf(name: string): OpenFormat | null {
  const ext = name.toLowerCase().match(/\.([a-z]+)$/)?.[1]
  switch (ext) {
    case 'docx':
      return 'docx'
    case 'html':
    case 'htm':
      return 'html'
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'txt':
      return 'text'
    default:
      return null
  }
}

/** A .docx is a zip: check its declared sizes before anything unzips it. */
async function checkZip(data: ArrayBuffer, limits: Required<OpenLimits>): Promise<void> {
  const { default: JSZip } = await import('jszip')
  let zip: InstanceType<typeof JSZip>
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new OpenFileError('damaged')
  }
  let total = 0
  let entries = 0
  for (const file of Object.values(zip.files)) {
    entries++
    if (file.dir) continue
    // declared sizes, from the central directory (not trusted beyond this check)
    const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize
    total += typeof size === 'number' && size >= 0 ? size : limits.maxUnzippedBytes
    if (entries > limits.maxZipEntries || total > limits.maxUnzippedBytes)
      throw new OpenFileError('tooComplex')
  }
  if (!zip.file('word/document.xml')) throw new OpenFileError('damaged')
}

/** Word → HTML with mammoth (loaded on demand); embedded images become data: URLs. */
async function docxToHTML(data: ArrayBuffer, limits: Required<OpenLimits>): Promise<string> {
  await checkZip(data, limits)
  const mammoth = await import('mammoth')
  try {
    // `arrayBuffer` for the browser build, `buffer` for Node (same bytes; never a `path`)
    const input = { arrayBuffer: data, buffer: data } as unknown as { arrayBuffer: ArrayBuffer }
    const result = await mammoth.convertToHtml(
      input,
      // never read files the document links to (CLAUDE.md §5.2)
      { externalFileAccess: false },
    )
    return result.value
  } catch {
    throw new OpenFileError('damaged')
  }
}

/** Plain text: one paragraph per line (blank lines kept as empty paragraphs). */
function textToDoc(schema: Schema, text: string): Node {
  const paragraph = schema.nodes['paragraph']!
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks = lines.map((line) => paragraph.create(null, line ? schema.text(line) : null))
  return schema.topNodeType.createAndFill(null, blocks) ?? schema.topNodeType.createAndFill()!
}

/**
 * Reads a file into a document of `schema`. Its content is untrusted input:
 * HTML (also what Word becomes) goes through an inert document and the schema
 * parser with limits, like a paste (CLAUDE.md §5.2, §5.10).
 */
export async function readDocument(
  schema: Schema,
  file: Blob & { name: string },
  limits: OpenLimits = {},
): Promise<Node> {
  const all: Required<OpenLimits> = {
    maxFileBytes: limits.maxFileBytes ?? 10_000_000,
    maxUnzippedBytes: limits.maxUnzippedBytes ?? 50_000_000,
    maxZipEntries: limits.maxZipEntries ?? 2000,
  }
  const format = formatOf(file.name)
  if (!format) throw new OpenFileError('type')
  if (file.size > all.maxFileBytes) throw new OpenFileError('size')
  try {
    switch (format) {
      case 'text':
        return textToDoc(schema, await file.text())
      case 'markdown':
        return parseMarkdown(schema, await file.text())
      case 'html':
      case 'docx': {
        const html =
          format === 'html' ? await file.text() : await docxToHTML(await file.arrayBuffer(), all)
        return parseHTML(schema, parseInertHTML(html).body, { maxDepth: 64, maxNodes: 100_000 })
      }
    }
  } catch (e) {
    if (e instanceof OpenFileError) throw e
    if (e instanceof HTMLLimitError) throw new OpenFileError('tooComplex')
    throw new OpenFileError('damaged')
  }
}
