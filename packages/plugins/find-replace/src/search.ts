/**
 * Search engine: plain functions on strings, no DOM, shared by the main
 * thread (plain text) and the Web Worker (regular expressions).
 */

export interface SearchQuery {
  text: string
  /** Treat `text` as a regular expression. */
  regex?: boolean
  caseSensitive?: boolean
  /** Only whole words (letters/digits not continuing on either side). */
  wholeWord?: boolean
}

/** A match in one text: [text index, start, end, capture groups]. */
export type RawMatch = readonly [number, number, number, readonly string[]]

export interface SearchResult {
  matches: RawMatch[]
  /** More matches exist than `maxMatches`. */
  truncated: boolean
}

export const MAX_QUERY_LENGTH = 500
export const DEFAULT_MAX_MATCHES = 10_000

/** Why a query cannot run (shown to the user), or null. */
export type QueryError = 'empty' | 'tooLong' | 'invalid' | null

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Builds the RegExp for a query (always `g` + `u`), or reports why it cannot. */
export function compileQuery(query: SearchQuery): RegExp | QueryError {
  if (!query.text) return 'empty'
  if (query.text.length > MAX_QUERY_LENGTH) return 'tooLong'
  let source = query.regex ? query.text : escape(query.text)
  if (query.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  try {
    return new RegExp(source, query.caseSensitive ? 'gu' : 'giu')
  } catch {
    return 'invalid'
  }
}

/** Finds matches in a list of texts (one per textblock). Empty matches are skipped. */
export function searchTexts(
  texts: readonly string[],
  query: SearchQuery,
  maxMatches = DEFAULT_MAX_MATCHES,
): SearchResult | QueryError {
  const re = compileQuery(query)
  if (!(re instanceof RegExp)) return re
  const matches: RawMatch[] = []
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]!
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++ // zero-width match: move on (a regex like `a*` must not loop forever)
        continue
      }
      if (matches.length >= maxMatches) return { matches, truncated: true }
      matches.push([i, m.index, m.index + m[0].length, m.slice(1).map((g) => g ?? '')])
    }
  }
  return { matches, truncated: false }
}

/**
 * Replacement text: `$&` the whole match, `$1`…`$99` groups, `$$` a dollar
 * (regex mode only; plain text is used as is).
 */
export function expandReplacement(
  template: string,
  match: string,
  groups: readonly string[],
  regex: boolean,
): string {
  if (!regex) return template
  return template.replace(/\$(\$|&|\d{1,2})/g, (all, token: string) => {
    if (token === '$') return '$'
    if (token === '&') return match
    const n = Number(token)
    return n >= 1 && n <= groups.length ? groups[n - 1]! : all
  })
}
