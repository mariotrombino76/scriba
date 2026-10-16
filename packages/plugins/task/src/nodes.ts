import type { DOMLike, NodeSpec } from '@scriba/core'

export const MAX_TITLE = 200

/** Control characters, zero-width and direction marks (they would hide or reorder text). */
function hasControl(value: string): boolean {
  for (const ch of value) {
    const c = ch.codePointAt(0)!
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) ||
        (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true
  } // prettier-ignore
  return false
}

/** A title: up to 200 characters on one line (empty allowed while being written). */
export function isTaskTitle(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TITLE && !hasControl(value)
}

/** A real calendar date as `YYYY-MM-DD` (e.g. not 2026-02-30). */
export function isTaskDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Title from an element's text: one line, trimmed, at most 200 characters. */
export function titleFromText(text: string): string {
  return [...text.replace(/\s+/g, ' ').trim()]
    .filter((ch) => !hasControl(ch))
    .join('')
    .slice(0, MAX_TITLE)
    .trim()
}

function textOf(node: DOMLike, depth = 0): string {
  if (node.nodeType === 3) return node.nodeValue ?? ''
  if (depth > 4) return ''
  let out = ''
  for (let i = 0; i < node.childNodes.length && out.length <= MAX_TITLE * 2; i++)
    out += textOf(node.childNodes[i]!, depth + 1)
  return out
}

/**
 * The task node: a block, atomic (one unit for the editor: selected,
 * deleted and undone as a whole). Its look comes from a node view (e.g.
 * `TaskView` with `vueNodeView` in `@scriba/vue`); its HTML is always
 * `<div class="scriba-task" data-task data-done="false" data-due="2026-10-20">Title</div>`.
 */
export const taskNodes = {
  task: {
    group: 'block',
    atom: true,
    attrs: {
      title: { default: '', validate: isTaskTitle },
      done: { default: false, validate: (v) => typeof v === 'boolean' },
      due: { default: null, validate: (v) => v === null || isTaskDate(v) },
    },
    leafText: (node) =>
      `[${node.attrs['done'] ? 'x' : ' '}] ${node.attrs['title'] as string}` +
      (node.attrs['due'] ? ` (${node.attrs['due'] as string})` : ''),
    parseHTML: [
      {
        tag: 'div',
        priority: 60,
        getAttrs: (el) => {
          if (el.getAttribute('data-task') === null) return false
          const due = el.getAttribute('data-due')
          return {
            title: titleFromText(textOf(el)),
            done: el.getAttribute('data-done') === 'true',
            due: isTaskDate(due) ? due : null,
          }
        },
      },
    ],
    toHTML: (node) => [
      'div',
      {
        class: 'scriba-task',
        'data-task': '',
        'data-done': String(node.attrs['done']),
        'data-due': node.attrs['due'] as string | null,
      },
      node.attrs['title'] as string,
    ],
  },
} satisfies Record<string, NodeSpec>
