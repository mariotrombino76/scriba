import {
  ADD_TO_HISTORY,
  CLOSE_HISTORY,
  Plugin,
  sanitizeUrl,
  type EditorState,
  type MarkType,
} from '@scriba/core'
import type { ViewPluginProps } from '@scriba/view'

/** An address ending at the cursor: http(s)://…, www.…, mailto:… or an e-mail address. */
const ADDRESS_AT_END =
  /(?:^|[\s([{"'«“])((?:https?:\/\/|www\.)[^\s<>"«»“”]{2,2000}|mailto:[^\s<>"]{3,320}|[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+)$/i
/** Punctuation that ends a sentence, not the address ("vedi www.x.it."). */
const TRAILING = /[.,;:!?'"»”]$/
/** Most text read back from the cursor. */
const MAX_LOOKBACK = 2100

/**
 * The address just before `end` (a position inside a textblock), as the range to link and
 * its safe URL, or null: no address, already a link, in code, or refused by the URL
 * whitelist (§5.3).
 */
export function addressBefore(
  state: EditorState,
  end: number,
  type: MarkType,
): { from: number; to: number; href: string } | null {
  const $end = state.doc.resolve(end)
  const parent = $end.parent
  if (!parent.inlineContent || parent.type.spec.code) return null
  const start = Math.max(0, $end.parentOffset - MAX_LOOKBACK)
  // one character per position: leaves (images…) stand for one, so offsets stay positions
  const text = parent.textBetween(start, $end.parentOffset, undefined, '￼')
  const m = ADDRESS_AT_END.exec(text)
  if (!m) return null
  let raw = m[1]!
  // trailing punctuation and an unbalanced closing parenthesis belong to the sentence
  for (;;) {
    if (TRAILING.test(raw)) raw = raw.slice(0, -1)
    else if (raw.endsWith(')') && raw.split('(').length < raw.split(')').length)
      raw = raw.slice(0, -1)
    else break
  }
  if (raw.length < 4) return null
  const offset = text.length - m[1]!.length
  const from = $end.start() + start + offset
  const to = from + raw.length
  if (state.doc.rangeHasMark(from, to, type) || hasCode(state, from, to)) return null
  const href = /^(https?|mailto):/i.test(raw)
    ? raw
    : raw.includes('@') && !/^www\./i.test(raw)
      ? `mailto:${raw}`
      : `https://${raw}`
  const safe = sanitizeUrl(href, { kind: 'link' })
  return safe ? { from, to, href: safe } : null
}

function hasCode(state: EditorState, from: number, to: number): boolean {
  const code = state.schema.marks['code']
  return !!code && state.doc.rangeHasMark(from, to, code)
}

/**
 * Links typed addresses, like TinyMCE's autolink: after a space or Enter,
 * `https://…`, `www.…` (→ https) and e-mail addresses (→ mailto) become links.
 * After a space the link is its own undo step (Ctrl+Z keeps the text, drops the
 * link); after Enter it is part of the line break. Addresses go through the URL
 * whitelist like any link.
 */
export function autolink(type: MarkType): Plugin {
  const props: ViewPluginProps = {
    handleTextInput(view, from, to, text) {
      if (!/^\s$/.test(text) || from !== to || view.composing) return false
      const found = addressBefore(view.state, from, type)
      if (!found) return false
      view.dispatch(view.state.tr.insertText(text, from, to))
      const tr = view.state.tr.addMark(found.from, found.to, type.create({ href: found.href }))
      view.dispatch(tr.setMeta(CLOSE_HISTORY, true))
      return true
    },
  }
  return new Plugin({
    props: { ...props },
    // Enter at the end of a line ending with an address: link it in the line just ended
    appendTransaction(trs, oldState, newState) {
      if (!trs.some((tr) => tr.docChanged && tr.getMeta(ADD_TO_HISTORY) !== false)) return null
      const old = oldState.selection.$head
      const now = newState.selection.$head
      if (!oldState.selection.empty || !newState.selection.empty) return null
      if (old.parentOffset !== old.parent.content.size || now.parentOffset !== 0) return null
      if (now.before() < 2) return null
      const $prev = newState.doc.resolve(now.before() - 1)
      if (!$prev.parent.inlineContent || !$prev.parent.eq(old.parent)) return null
      const found = addressBefore(newState, $prev.pos, type)
      if (!found) return null
      return newState.tr.addMark(found.from, found.to, type.create({ href: found.href }))
    },
  })
}
