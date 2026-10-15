import type { Fragment } from '@scriba/core'

/** First position where two fragments differ (null when equal). */
export function diffStart(a: Fragment, b: Fragment, pos = 0): number | null {
  for (let i = 0; ; i++) {
    if (i === a.childCount || i === b.childCount) return a.childCount === b.childCount ? null : pos
    const ca = a.child(i)
    const cb = b.child(i)
    if (ca === cb) {
      pos += ca.nodeSize
      continue
    }
    if (!ca.sameMarkup(cb)) return pos
    if (ca.isText && ca.text !== cb.text) {
      const ta = ca.text
      const tb = cb.text
      let j = 0
      while (j < ta.length && j < tb.length && ta[j] === tb[j]) j++
      return pos + j
    }
    if (ca.content.size || cb.content.size) {
      const inner = diffStart(ca.content, cb.content, pos + 1)
      if (inner !== null) return inner
    }
    pos += ca.nodeSize
  }
}

/** Last positions (in a and in b) where two fragments differ, scanning from the end. */
export function diffEnd(
  a: Fragment,
  b: Fragment,
  posA = a.size,
  posB = b.size,
): { a: number; b: number } | null {
  for (let ia = a.childCount, ib = b.childCount; ;) {
    if (ia === 0 || ib === 0) return ia === ib ? null : { a: posA, b: posB }
    const ca = a.child(--ia)
    const cb = b.child(--ib)
    const size = ca.nodeSize
    if (ca === cb) {
      posA -= size
      posB -= size
      continue
    }
    if (!ca.sameMarkup(cb)) return { a: posA, b: posB }
    if (ca.isText && ca.text !== cb.text) {
      const ta = ca.text
      const tb = cb.text
      let same = 0
      const min = Math.min(ta.length, tb.length)
      while (same < min && ta[ta.length - same - 1] === tb[tb.length - same - 1]) {
        same++
        posA--
        posB--
      }
      return { a: posA, b: posB }
    }
    if (ca.content.size || cb.content.size) {
      const inner = diffEnd(ca.content, cb.content, posA - 1, posB - 1)
      if (inner) return inner
    }
    posA -= size
    posB -= size
  }
}
