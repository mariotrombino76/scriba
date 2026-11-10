import {
  withAttr,
  type Command,
  type EditorState,
  type HTMLSpec,
  type Node,
  type NodeSpec,
} from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import { openDialog, type ToolbarButton } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'

/**
 * Anchors (approved 2026-10-19): an `id` on paragraphs and headings, always with this
 * fixed prefix, so a document can never clobber page globals (`id="location"`…) or
 * collide with the page's own ids (CLAUDE.md §5.4). Links point to `#anchor-<name>`.
 */
export const ANCHOR_PREFIX = 'anchor-'
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/

export const isAnchorName = (v: unknown): v is string => typeof v === 'string' && NAME.test(v)

/** A name typed by a user, made valid: "Introduzione al Corso" → "introduzione-al-corso". */
export function anchorName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

/** Adds the `anchor` attribute to the given block specs (default: paragraph and heading). */
export function withAnchors<N extends Record<string, NodeSpec>>(
  nodes: N,
  names: readonly string[] = ['paragraph', 'heading'],
): N {
  const out: Record<string, NodeSpec> = { ...nodes }
  for (const name of names) {
    const spec = nodes[name]
    if (!spec) continue
    const toHTML = spec.toHTML
    out[name] = {
      ...spec,
      attrs: {
        ...spec.attrs,
        anchor: { default: null, validate: (v) => v === null || isAnchorName(v) },
      },
      parseHTML: (spec.parseHTML ?? []).map((rule) => ({
        ...rule,
        getAttrs: (el) => {
          const base = rule.getAttrs ? rule.getAttrs(el) : null
          if (base === false) return false
          const id = el.getAttribute('id') ?? ''
          const anchor = id.startsWith(ANCHOR_PREFIX) ? id.slice(ANCHOR_PREFIX.length) : null
          return { ...base, anchor: isAnchorName(anchor) ? anchor : null }
        },
      })),
      ...(toHTML
        ? {
            toHTML: (node: Node): HTMLSpec => {
              const anchor = node.attrs['anchor'] as string | null
              return withAttr(toHTML(node), 'id', anchor ? `${ANCHOR_PREFIX}${anchor}` : null)
            },
          }
        : {}),
    }
  }
  return out as N
}

/** The anchor names in the document, in order. */
export function anchorsIn(doc: Node): string[] {
  const names: string[] = []
  doc.descendants((node) => {
    const anchor = node.attrs['anchor']
    if (typeof anchor === 'string') names.push(anchor)
    return !node.isTextblock
  })
  return names
}

/** The block at the cursor that can have an anchor, with its position. */
function anchorBlock(state: EditorState): { node: Node; pos: number } | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.spec.attrs && 'anchor' in node.type.spec.attrs)
      return { node, pos: $from.before(d) }
  }
  return null
}

/** Sets (or with null removes) the anchor of the block at the cursor; refuses a name in use. */
export function setAnchor(name: string | null): Command {
  return (state, dispatch) => {
    const block = anchorBlock(state)
    if (!block || (name !== null && !isAnchorName(name))) return false
    if (name !== null && name !== block.node.attrs['anchor'] && anchorsIn(state.doc).includes(name))
      return false
    dispatch?.(state.tr.setNodeAttrs(block.pos, { anchor: name }))
    return true
  }
}

/** Dialog to name (or rename, or remove) the anchor of the block at the cursor. */
export function openAnchorDialog(view: EditorView, t: Translate): void {
  const block = anchorBlock(view.state)
  if (!block) return
  const current = (block.node.attrs['anchor'] as string | null) ?? ''
  openDialog(view.document, {
    title: t('anchor.title'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const doc = view.document
      const label = doc.createElement('label')
      label.textContent = t('anchor.name')
      const input = doc.createElement('input')
      input.type = 'text'
      input.value = current
      input.maxLength = 80
      input.setAttribute('autocomplete', 'off')
      label.appendChild(input)
      const hint = doc.createElement('p')
      hint.className = 'scriba-dialog-hint'
      const error = doc.createElement('p')
      error.className = 'scriba-dialog-error'
      error.setAttribute('role', 'alert')
      const showHint = () => {
        const name = anchorName(input.value)
        hint.textContent = name ? t('anchor.hint', { link: `#${ANCHOR_PREFIX}${name}` }) : ''
      }
      input.addEventListener('input', showHint)
      showHint()
      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const button = (text: string, type: 'submit' | 'button', onClick?: () => void) => {
        const b = doc.createElement('button')
        b.type = type
        b.textContent = text
        if (onClick) b.addEventListener('click', onClick)
        actions.appendChild(b)
      }
      if (current)
        button(t('anchor.remove'), 'button', () => {
          setAnchor(null)(view.state, (tr) => view.dispatch(tr))
          handle.close()
        })
      button(t('anchor.cancel'), 'button', () => handle.close())
      button(t('anchor.save'), 'submit')
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const name = anchorName(input.value)
        if (!name) {
          error.textContent = t('anchor.invalid')
          input.setAttribute('aria-invalid', 'true')
          return
        }
        if (!setAnchor(name)(view.state, (tr) => view.dispatch(tr))) {
          error.textContent = t('anchor.taken')
          input.setAttribute('aria-invalid', 'true')
          return
        }
        handle.close()
      })
      form.append(label, hint, error, actions)
      input.focus()
    },
  })
}

/** Insert ▸ Anchor (TinyMCE's anchor): names the paragraph or heading at the cursor. */
export function anchorToolbarItem(t: Translate): ToolbarButton {
  return {
    type: 'button',
    id: 'anchor',
    icon: 'anchor',
    label: (tr) => tr('anchor.label'),
    command: (state) => !!anchorBlock(state),
    run: (view) => openAnchorDialog(view, t),
  }
}
