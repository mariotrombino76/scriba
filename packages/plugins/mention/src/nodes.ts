import type { DOMLike, NodeSpec } from '@scriba/core'

export const MAX_ID_LENGTH = 200
export const MAX_LABEL_LENGTH = 100

/**
 * Control characters, zero-width and direction marks: they would hide or
 * reorder the visible name.
 */
function hasControl(value: string): boolean {
  for (const ch of value) {
    const c = ch.codePointAt(0)!
    if (
      c <= 0x1f ||
      (c >= 0x7f && c <= 0x9f) ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x202a && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069)
    )
      return true
  }
  return false
}

/** An id: 1–200 characters, no spaces or control characters. */
export function isMentionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !/\s/.test(value) &&
    !hasControl(value)
  )
}

/** A label: 1–100 characters on one line, no control characters. */
export function isMentionLabel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_LABEL_LENGTH &&
    value.trim() === value &&
    !hasControl(value)
  )
}

/** Visible text of an element (bounded: a mention is short). */
function textOf(node: DOMLike, depth = 0): string {
  if (node.nodeType === 3) return node.nodeValue ?? ''
  if (depth > 4) return ''
  let out = ''
  for (let i = 0; i < node.childNodes.length && out.length <= MAX_LABEL_LENGTH + 1; i++)
    out += textOf(node.childNodes[i]!, depth + 1)
  return out
}

/** Label from the element's text: "@Anna Rossi" → "Anna Rossi" (spaces collapsed). */
export function labelFromText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/^@/, '').trim()
}

/**
 * The mention node: inline and atomic (deleted in one go, never edited
 * letter by letter). `id` is the person's id in your system, `label` the name
 * shown when it was inserted. In HTML: `<span data-mention-id="…">@Name</span>`.
 *
 * The label is only display text: anyone can paste a mention with any label.
 * Resolve the id on your server (current name, permissions, notifications).
 */
export const mentionNodes = {
  mention: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      id: { validate: isMentionId },
      label: { validate: isMentionLabel },
    },
    leafText: (node) => `@${node.attrs['label'] as string}`,
    parseHTML: [
      {
        tag: 'span',
        priority: 60,
        getAttrs: (el) => {
          const id = el.getAttribute('data-mention-id')
          if (id === null) return false
          return { id, label: labelFromText(textOf(el)) }
        },
      },
    ],
    toHTML: (node) => [
      'span',
      { class: 'scriba-mention', 'data-mention-id': node.attrs['id'] as string },
      `@${node.attrs['label'] as string}`,
    ],
  },
} satisfies Record<string, NodeSpec>
