import {
  sanitizeUrl,
  TextSelection,
  type Command,
  type EditorState,
  type HTMLSpec,
  type KeyBindings,
  type MarkSpec,
  type MarkType,
  type Schema,
} from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import {
  openDialog,
  withoutPressed,
  type ContextMenuSection,
  type ToolbarControl,
} from '@scriba/ui'
import type { EditorView } from '@scriba/view'

/** The link mark. `href` is checked against the URL whitelist (§5.3) wherever it is created. */
export const linkMarks = {
  link: {
    attrs: {
      href: { url: { kind: 'link' } },
      target: { default: null, validate: (v) => v === null || v === '_blank' },
    },
    inclusive: false,
    parseHTML: [
      {
        tag: 'a',
        getAttrs: (el) => ({
          href: el.getAttribute('href'),
          target: el.getAttribute('target') === '_blank' ? '_blank' : null,
        }),
      },
    ],
    toHTML: (mark): HTMLSpec => {
      const target = mark.attrs['target'] as string | null
      // target=_blank always gets rel=noopener noreferrer (§5.3)
      return [
        'a',
        { href: mark.attrs['href'] as string, target, rel: target ? 'noopener noreferrer' : null },
        0,
      ]
    },
  },
} satisfies Record<string, MarkSpec>

function linkType(schema: Schema): MarkType {
  const type = schema.marks['link']
  if (!type) throw new RangeError('The schema has no "link" mark (add linkMarks)')
  return type
}

/** Extent of the link around the cursor (or the selection when it is not empty). */
export function linkRange(
  state: EditorState,
  type: MarkType,
): { from: number; to: number; href: string; target: string | null } | null {
  const { $from, from, to, empty } = state.selection
  if (!empty) {
    let found: { href: string; target: string | null } | null = null
    state.doc.nodesBetween(from, to, (node) => {
      const mark = type.isInSet(node.marks)
      if (mark && !found)
        found = {
          href: mark.attrs['href'] as string,
          target: mark.attrs['target'] as string | null,
        }
    })
    return found ? { from, to, ...(found as { href: string; target: string | null }) } : null
  }
  const parent = $from.parent
  const index = $from.index()
  const at = parent.maybeChild(index) ?? parent.maybeChild(index - 1)
  const before = $from.textOffset ? parent.child(index) : parent.maybeChild(index - 1)
  const mark = type.isInSet(before?.marks ?? []) ?? type.isInSet(at?.marks ?? [])
  if (!mark) return null
  // Expand over neighbouring nodes carrying the same link.
  let startIndex = $from.textOffset
    ? index
    : before && mark.isInSet(before.marks)
      ? index - 1
      : index
  let endIndex = startIndex + 1
  while (startIndex > 0 && mark.isInSet(parent.child(startIndex - 1).marks)) startIndex--
  while (endIndex < parent.childCount && mark.isInSet(parent.child(endIndex).marks)) endIndex++
  let pos = $from.start()
  for (let i = 0; i < startIndex; i++) pos += parent.child(i).nodeSize
  let end = pos
  for (let i = startIndex; i < endIndex; i++) end += parent.child(i).nodeSize
  return {
    from: pos,
    to: end,
    href: mark.attrs['href'] as string,
    target: mark.attrs['target'] as string | null,
  }
}

/**
 * Sets a link: on the selection, on the whole link around the cursor, or —
 * with a bare cursor — inserts the address itself as linked text.
 * Returns false (does nothing) for unsafe URLs.
 */
export function setLink(schema: Schema, href: string, target: '_blank' | null = null): Command {
  const type = linkType(schema)
  return (state, dispatch) => {
    const safe = sanitizeUrl(href, { kind: 'link' })
    if (!safe) return false
    if (!dispatch) return true
    const mark = type.create({ href: safe, target })
    const tr = state.tr
    const range = linkRange(state, type)
    const { from, to, empty } = state.selection
    if (!empty) {
      tr.removeMark(from, to, type).addMark(from, to, mark)
    } else if (range) {
      tr.removeMark(range.from, range.to, type).addMark(range.from, range.to, mark)
    } else {
      tr.insert(from, schema.text(safe, [...state.selection.$from.marks(), mark]))
      tr.setSelection(TextSelection.create(tr.doc, from + safe.length))
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** Removes the link from the selection or around the cursor. */
export function removeLink(schema: Schema): Command {
  const type = linkType(schema)
  return (state, dispatch) => {
    const range = linkRange(state, type)
    if (!range) return false
    dispatch?.(state.tr.removeMark(range.from, range.to, type).scrollIntoView())
    return true
  }
}

let dialogIds = 0

/** Common user input: `www.example.com` → `https://www.example.com`. */
export function normalizeLinkInput(value: string): string {
  const v = value.trim()
  if (/^www\./i.test(v)) return `https://${v}`
  if (/^[^\s/:@]+@[^\s/:@]+\.[a-z]{2,}$/i.test(v)) return `mailto:${v}`
  return v
}

/**
 * Opens the accessible link dialog for the view (focus trap, Escape, focus
 * returns to the editor). Invalid addresses are refused with an announced error.
 */
export function openLinkDialog(view: EditorView, t: Translate): void {
  const schema = view.state.schema
  const type = linkType(schema)
  const current = linkRange(view.state, type)
  const doc = view.document
  openDialog(doc, {
    title: t('link.dialogTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const urlLabel = doc.createElement('label')
      urlLabel.append(t('link.url'))
      const input = doc.createElement('input')
      input.type = 'text'
      input.name = 'href'
      input.setAttribute('autocomplete', 'url')
      input.spellcheck = false
      input.value = current?.href ?? ''
      const errorId = `scriba-link-error-${++dialogIds}`
      input.setAttribute('aria-describedby', errorId)
      urlLabel.append(input)

      const check = doc.createElement('label')
      check.className = 'scriba-check'
      const newTab = doc.createElement('input')
      newTab.type = 'checkbox'
      newTab.name = 'newTab'
      newTab.checked = current?.target === '_blank'
      check.append(newTab, t('link.newTab'))

      const error = doc.createElement('p')
      error.id = errorId
      error.className = 'scriba-dialog-error'
      error.setAttribute('aria-live', 'polite')

      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const button = (label: string, kind: 'submit' | 'button') => {
        const b = doc.createElement('button')
        b.type = kind
        b.textContent = label
        return b
      }
      const cancel = button(t('link.cancel'), 'button')
      cancel.addEventListener('click', () => handle.close())
      actions.append(cancel)
      if (current) {
        const remove = button(t('link.remove'), 'button')
        remove.addEventListener('click', () => {
          removeLink(schema)(view.state, (tr) => view.dispatch(tr))
          handle.close()
        })
        actions.append(remove)
      }
      actions.append(button(t('link.save'), 'submit'))

      form.addEventListener('submit', (event) => {
        event.preventDefault()
        const href = normalizeLinkInput(input.value)
        const ok = setLink(
          schema,
          href,
          newTab.checked ? '_blank' : null,
        )(view.state, (tr) => view.dispatch(tr))
        if (!ok) {
          input.setAttribute('aria-invalid', 'true')
          error.textContent = t('link.invalid')
          input.focus()
          return
        }
        handle.close()
      })
      form.append(urlLabel, check, error, actions)
      queueMicrotask(() => input.focus())
    },
  })
}

/** Mod-k opens the link dialog. Needs the view (passed by the keymap). */
export function linkKeymap(t: Translate): KeyBindings {
  return {
    'Mod-k': (state, _dispatch, view) => {
      if (!view || !state.schema.marks['link']) return false
      openLinkDialog(view as EditorView, t)
      return true
    },
  }
}

/** Toolbar button opening the dialog; pressed when the cursor is in a link. */
export function linkToolbarItems(schema: Schema, t: Translate): ToolbarControl[] {
  const type = linkType(schema)
  return [
    {
      type: 'button',
      id: 'link',
      icon: 'link',
      label: (tr) => tr('link.label'),
      shortcut: 'Mod-k',
      command: (state) => state.selection.$from.parent.type.allowsMarkType(type),
      isActive: (state) => !!linkRange(state, type),
      run: (view) => openLinkDialog(view, t),
    },
  ]
}

/**
 * Context menu section on a link (like TinyMCE's): edit, remove, open. Opening
 * also works read-only, in a new tab without access to this page (`noopener`).
 */
export function linkContextMenu(schema: Schema, t: Translate): ContextMenuSection {
  const type = linkType(schema)
  const inLink = (state: EditorState) => !!linkRange(state, type)
  return {
    id: 'link',
    isVisible: inLink,
    items: [
      // an action here, not a pressed toggle
      ...linkToolbarItems(schema, t).map(withoutPressed),
      {
        type: 'button',
        id: 'unlink',
        label: (tr) => tr('link.remove'),
        command: removeLink(schema),
      },
      {
        type: 'button',
        id: 'open_link',
        label: (tr) => tr('link.open'),
        command: inLink,
        readOnly: true,
        run: (view) => {
          const range = linkRange(view.state, type)
          const href = range && sanitizeUrl(range.href, { kind: 'link' })
          if (href) view.document.defaultView?.open(href, '_blank', 'noopener,noreferrer')
        },
      },
    ],
  }
}

export { autolink, addressBefore } from './autolink.js'
