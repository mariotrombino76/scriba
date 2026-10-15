import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { Plugin, PluginKey, type EditorState } from '@scriba/core'
import type { EditorView, InlineDecoration, PluginView, ViewPluginProps } from '@scriba/view'
import { fromRelative, toRelative } from './positions.js'

/** Who you are for the others (the server may replace it with the authenticated identity). */
export interface CollabUser {
  name: string
  /** Color slot 0–7 (classes `scriba-collab-c0`…`c7` in the theme). */
  color?: number
}

export interface CursorsOptions {
  awareness: Awareness
  /** Name of the shared XML fragment (default "scriba"). */
  field?: string
  user?: CollabUser
}

/** Another user's cursor and selection, in document positions. */
export interface RemoteCursor {
  clientId: number
  name: string
  color: number
  anchor: number
  head: number
}

export const cursorsKey = new PluginKey<readonly RemoteCursor[]>('collabCursors')

const COLORS = 8
const MAX_NAME = 60

function colorOf(value: unknown, clientId: number): number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < COLORS
    ? (value as number)
    : clientId % COLORS
}

/** A display name: plain text, one line, bounded (never markup). */
function nameOf(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.slice(0, MAX_NAME) || '?'
}

/**
 * Other users' cursors and selections (Yjs awareness). Selections are
 * decorations (colored by slot); carets with the user's name are an overlay
 * outside the editable area. Names are always shown as text (§5.8).
 */
export function collabCursors(options: CursorsOptions): Plugin<readonly RemoteCursor[]> {
  const props: ViewPluginProps = { pluginView: (view) => cursorsView(view, options) }
  return new Plugin<readonly RemoteCursor[]>({
    key: cursorsKey,
    state: {
      init: () => [],
      apply(tr, value) {
        return tr.getMeta<readonly RemoteCursor[]>(cursorsKey) ?? value
      },
    },
    props: {
      ...props,
      decorations(state: EditorState): InlineDecoration[] {
        const out: InlineDecoration[] = []
        for (const c of cursorsKey.getState(state) ?? []) {
          const from = Math.min(c.anchor, c.head)
          const to = Math.max(c.anchor, c.head)
          if (from < to)
            out.push({ from, to, class: `scriba-collab-sel scriba-collab-c${c.color}` })
        }
        return out
      },
    },
  })
}

function cursorsView(
  view: EditorView,
  { awareness, field = 'scriba', user }: CursorsOptions,
): PluginView {
  const ydoc = awareness.doc
  const fragment = ydoc.getXmlFragment(field)
  const doc = view.document
  const layer = doc.createElement('div')
  layer.className = 'scriba-collab-layer'
  layer.setAttribute('aria-hidden', 'true') // visual only; the text is unchanged by it
  doc.body.appendChild(layer)
  const carets = new Map<number, { caret: HTMLElement; label: HTMLElement }>()

  if (user)
    awareness.setLocalStateField('user', {
      name: nameOf(user.name),
      color: colorOf(user.color, awareness.clientID),
    })

  let lastShared = ''
  const shareSelection = () => {
    const { anchor, head } = view.state.selection
    const a = toRelative(view.state.doc, fragment, anchor)
    const h = toRelative(view.state.doc, fragment, head)
    if (!a || !h) return
    const cursor = { anchor: Y.relativePositionToJSON(a), head: Y.relativePositionToJSON(h) }
    const key = JSON.stringify(cursor)
    if (key === lastShared) return
    lastShared = key
    awareness.setLocalStateField('cursor', cursor)
  }

  const readCursors = (): RemoteCursor[] => {
    const out: RemoteCursor[] = []
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return
      const cursor = (state as { cursor?: { anchor?: unknown; head?: unknown } }).cursor
      const who = (state as { user?: { name?: unknown; color?: unknown } }).user
      if (!cursor?.anchor || !cursor.head) return
      try {
        const anchor = fromRelative(
          view.state.doc,
          fragment,
          Y.createRelativePositionFromJSON(cursor.anchor),
          ydoc,
        )
        const head = fromRelative(
          view.state.doc,
          fragment,
          Y.createRelativePositionFromJSON(cursor.head),
          ydoc,
        )
        if (anchor === null || head === null) return
        out.push({
          clientId,
          name: nameOf(who?.name),
          color: colorOf(who?.color, clientId),
          anchor,
          head,
        })
      } catch {
        /* malformed state from another client: ignored */
      }
    })
    return out
  }

  const place = () => {
    const cursors = cursorsKey.getState(view.state) ?? []
    const seen = new Set<number>()
    for (const c of cursors) {
      seen.add(c.clientId)
      let el = carets.get(c.clientId)
      if (!el) {
        const caret = doc.createElement('div')
        const label = doc.createElement('span')
        label.className = 'scriba-collab-name'
        caret.appendChild(label)
        layer.appendChild(caret)
        el = { caret, label }
        carets.set(c.clientId, el)
      }
      el.caret.className = `scriba-collab-caret scriba-collab-c${c.color}`
      el.label.textContent = c.name // text only, never HTML
      const at = view.coordsAtPos(Math.min(c.head, view.state.doc.content.size))
      el.caret.style.left = `${Math.round(at.left)}px` // CSSOM (strict CSP)
      el.caret.style.top = `${Math.round(at.top)}px`
      el.caret.style.height = `${Math.round(at.bottom - at.top)}px`
    }
    for (const [id, el] of carets)
      if (!seen.has(id)) {
        el.caret.remove()
        carets.delete(id)
      }
  }

  const refresh = () => {
    const next = readCursors()
    const prev = cursorsKey.getState(view.state) ?? []
    if (JSON.stringify(next) !== JSON.stringify(prev))
      view.dispatch(view.state.tr.setMeta(cursorsKey, next))
    else place()
  }

  const onAwareness = (_changes: unknown, origin: unknown) => {
    if (origin !== 'local') refresh()
  }
  awareness.on('change', onAwareness)
  const win = doc.defaultView
  win?.addEventListener('scroll', place, true)
  win?.addEventListener('resize', place)
  shareSelection()
  refresh()

  return {
    update(v, prev) {
      if (prev.doc !== v.state.doc || !prev.selection.eq(v.state.selection)) {
        // after the binding updated Yjs (it comes first in the plugin list)
        queueMicrotask(() => {
          shareSelection()
          refresh()
        })
      }
      place()
    },
    destroy() {
      awareness.off('change', onAwareness)
      awareness.setLocalStateField('cursor', null)
      win?.removeEventListener('scroll', place, true)
      win?.removeEventListener('resize', place)
      layer.remove()
    },
  }
}
