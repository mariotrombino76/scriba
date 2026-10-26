import type { NodeSpec } from '@scriba/core'

/**
 * Collapsible sections (approved 2026-10-19): `<details>` with its `<summary>`
 * title and the blocks it shows or hides. The only attribute is `open`.
 *
 * HTML: `<details open><summary>Title</summary><p>…</p></details>`. A pasted
 * `<details>` without `<summary>` gets an empty title; a `<summary>` outside a
 * `<details>` keeps just its text.
 */
export const detailsNodes = {
  details: {
    group: 'block',
    content: 'details_summary block+',
    defining: true,
    attrs: { open: { default: true, validate: (v) => typeof v === 'boolean' } },
    parseHTML: [{ tag: 'details', getAttrs: (el) => ({ open: el.getAttribute('open') !== null }) }],
    toHTML: (node) => ['details', node.attrs['open'] ? { open: '' } : {}, 0],
  },
  details_summary: {
    content: 'inline*',
    // Backspace at its start does not merge it into the block before, Enter does not split it
    defining: true,
    isolating: true,
    parseHTML: [{ tag: 'summary' }],
    toHTML: () => ['summary', 0],
  },
} satisfies Record<string, NodeSpec>
