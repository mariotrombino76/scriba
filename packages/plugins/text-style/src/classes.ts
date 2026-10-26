import {
  withClass,
  type Command,
  type DOMLikeElement,
  type EditorState,
  type MarkSpec,
  type Node,
  type NodeSpec,
  type ParseRule,
  type Schema,
} from '@scriba/core'
import type { ToolbarMenu, ToolbarMenuEntry } from '@scriba/ui'
import { markValue, setMarkValue } from './marks.js'

/**
 * Integrator classes (approved 2026-10-26), like TinyMCE's style_formats:
 * you list the classes your site styles (e.g. `nota-margine`); only those are
 * kept, on paragraphs and headings or on text (`<span class>`). Every other
 * class is dropped, so pasted `MsoNormal` & co. never reach the document.
 * Use the same lists in the browser and on the server (`sanitize-server`).
 */
export const CLASS_NAME = /^[a-z][a-z0-9-]{0,63}$/

/** Checks a configured list: valid names, none of the editor's own (`scriba-…`). */
function checkedList(classes: readonly string[]): readonly string[] {
  for (const name of classes)
    if (!CLASS_NAME.test(name) || name.startsWith('scriba-'))
      throw new RangeError(`Invalid class "${name}": use [a-z][a-z0-9-]*, not "scriba-…"`)
  return [...new Set(classes)]
}

/** The first class of the element that is in the list, or null. */
function firstAllowed(el: DOMLikeElement, allowed: readonly string[]): string | null {
  const classes = (el.getAttribute('class') ?? '').split(/\s+/)
  return classes.find((c) => allowed.includes(c)) ?? null
}

/**
 * Adds an optional `className` (one of `classes`) to the block specs (default:
 * paragraph and heading). HTML: `<p class="nota-margine">`.
 */
export function withBlockClasses<N extends Record<string, NodeSpec>>(
  nodes: N,
  classes: readonly string[],
  names: readonly string[] = ['paragraph', 'heading'],
): N {
  const allowed = checkedList(classes)
  const out: Record<string, NodeSpec> = { ...nodes }
  for (const name of names) {
    const spec = nodes[name]
    if (!spec) continue
    const toHTML = spec.toHTML
    out[name] = {
      ...spec,
      attrs: {
        ...spec.attrs,
        className: { default: null, validate: (v) => v === null || allowed.includes(v as string) },
      },
      parseHTML: (spec.parseHTML ?? []).map((rule): ParseRule => ({
        ...rule,
        getAttrs: (el) => {
          const base = rule.getAttrs ? rule.getAttrs(el) : null
          if (base === false) return false
          return { ...base, className: firstAllowed(el, allowed) }
        },
      })),
      ...(toHTML
        ? {
            toHTML: (node: Node) =>
              withClass(toHTML(node), node.attrs['className'] as string | null),
          }
        : {}),
    }
  }
  return out as N
}

/**
 * The `text_class` mark: a `<span>` with one of `classes` (one at a time on
 * the same text). A span with no listed class is not this mark.
 */
export function classMarks(classes: readonly string[]): { text_class: MarkSpec } {
  const allowed = checkedList(classes)
  return {
    text_class: {
      attrs: { name: { validate: (v) => allowed.includes(v as string) } },
      parseHTML: [
        {
          tag: 'span',
          getAttrs: (el) => {
            const name = firstAllowed(el, allowed)
            return name ? { name } : false
          },
        },
      ],
      toHTML: (mark) => ['span', { class: mark.attrs['name'] as string }, 0],
    },
  }
}

/** Textblocks touched by the selection that can have a class, with positions. */
function classBlocks(state: EditorState): { node: Node; pos: number }[] {
  const found: { node: Node; pos: number }[] = []
  const { from, to } = state.selection
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock && node.type.spec.attrs && 'className' in node.type.spec.attrs)
      found.push({ node, pos })
    return !node.isTextblock
  })
  return found
}

/** Gives the selected paragraphs/headings the class `name` (null: removes it). */
export function setBlockClass(name: string | null): Command {
  return (state, dispatch) => {
    const blocks = classBlocks(state).filter((b) => {
      const spec = b.node.type.spec.attrs!['className']!
      return name === null || !spec.validate || spec.validate(name)
    })
    if (!blocks.length) return false
    if (dispatch) {
      const tr = state.tr
      for (const b of blocks) tr.setNodeAttrs(b.pos, { className: name })
      dispatch(tr)
    }
    return true
  }
}

/** True when every selected block has the class. */
export function hasBlockClass(state: EditorState, name: string): boolean {
  const blocks = classBlocks(state)
  return blocks.length > 0 && blocks.every((b) => b.node.attrs['className'] === name)
}

/** A class offered in the Format menu, with the label your users see. */
export interface ClassFormat {
  /** Shown in the menu (yours to translate). */
  readonly label: string
  /** The class: listed in `withBlockClasses` (block) or `classMarks` (inline). */
  readonly class: string
  /** Paragraph/heading or selected text. */
  readonly kind: 'block' | 'inline'
}

/**
 * Format ▸ Styles: your classes, like TinyMCE's style_formats. A block class
 * toggles on the selected paragraphs; an inline one on the selected text.
 */
export function classFormatsMenu(schema: Schema, formats: readonly ClassFormat[]): ToolbarMenu {
  const mark = schema.marks['text_class']
  const entries = formats.map((format): ToolbarMenuEntry => {
    if (format.kind === 'block')
      return {
        id: `class-block-${format.class}`,
        label: () => format.label,
        command: (state, dispatch, view) =>
          setBlockClass(hasBlockClass(state, format.class) ? null : format.class)(
            state,
            dispatch,
            view,
          ),
        isActive: (state) => hasBlockClass(state, format.class),
      }
    if (!mark) throw new RangeError('Inline class formats need classMarks in the schema')
    return {
      id: `class-inline-${format.class}`,
      label: () => format.label,
      command: (state, dispatch, view) =>
        setMarkValue(
          mark,
          markValue(state, mark, 'name') === format.class ? null : { name: format.class },
        )(state, dispatch, view),
      isActive: (state) => markValue(state, mark, 'name') === format.class,
    }
  })
  return {
    type: 'menu',
    id: 'class-formats',
    icon: 'styles',
    label: (t) => t('classes.menu'),
    entries,
  }
}
