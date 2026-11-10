import { parseHTML, type Node, type NodeJSON, type Schema } from '@scriba-editor/core'
import { parseInertHTML } from '@scriba-editor/view'

/** A saved version of the document, as your server lists it. */
export interface Revision {
  /** Your id for it: passed back to `content`. */
  readonly id: string
  /** When it was saved (a Date, an ISO string or a timestamp). */
  readonly createdAt: Date | string | number
  /** Who saved it. Shown as text. */
  readonly author?: string
  /** An optional name ("Sent to the client"). Shown as text. */
  readonly label?: string
}

export interface RevisionOptions {
  /** The saved versions, newest first (e.g. fetched from your server). */
  revisions: () => Promise<readonly Revision[]>
  /**
   * A version's content: HTML, or the JSON of `doc.toJSON()`. Untrusted: it
   * goes through the schema (parser or JSON validation), like `setContent`.
   */
  content: (revision: Revision) => Promise<string | NodeJSON>
  /** Locale of the dates (default: the browser's). */
  locale?: string
}

/** Longest version HTML accepted (characters): bigger ones are refused, not cut. */
export const MAX_REVISION_LENGTH = 5_000_000

/** Reads a version's content through the schema. Throws if the schema refuses it. */
export function parseRevision(schema: Schema, source: string | NodeJSON): Node {
  if (typeof source !== 'string') {
    const doc = schema.nodeFromJSON(source)
    if (doc.type !== schema.topNodeType) throw new RangeError('A version must be a whole document')
    return doc
  }
  if (source.length > MAX_REVISION_LENGTH)
    throw new RangeError(`Version longer than ${MAX_REVISION_LENGTH} characters`)
  return parseHTML(schema, parseInertHTML(source).body)
}

/** "12 nov 2026, 10:30", in the given locale. Invalid dates give an empty string. */
export function formatRevisionDate(value: Revision['createdAt'], locale?: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
