import {
  Fragment,
  type Command,
  type EditorState,
  type KeyBindings,
  type Node,
  type NodeSpec,
  type Plugin,
} from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { ToolbarMenu, ToolbarMenuEntry } from '@scriba-editor/ui'
import { createSuggestion, type SuggestItem, type Suggestion } from '@scriba-editor/plugin-mention'

/**
 * Merge tags (approved 2026-10-26), like TinyMCE's: `{{cliente.nome}}` placeholders
 * your app fills in later (letters, e-mails). HTML:
 * `<span data-merge-tag="cliente.nome">{{cliente.nome}}</span>`; the name is
 * only lowercase letters, digits, `_` and `.` (no markup, no spaces), at most 100.
 */
export const MERGE_TAG_NAME = /^[a-z0-9_]+(?:\.[a-z0-9_]+){0,9}$/
export const MAX_MERGE_TAG_NAME = 100

export const isMergeTagName = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= MAX_MERGE_TAG_NAME && MERGE_TAG_NAME.test(v)

/** A tag offered to your users. */
export interface MergeTag {
  /** The name written in the document (`cliente.nome`). */
  readonly name: string
  /** What the menu and the suggestions show (yours to translate). */
  readonly label: string
  /** Optional group shown before the label ("Cliente › Nome"). */
  readonly group?: string
}

export const mergeTagNodes = {
  merge_tag: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { name: { validate: isMergeTagName } },
    leafText: (node) => `{{${node.attrs['name'] as string}}}`,
    parseHTML: [
      {
        tag: 'span',
        // before formatting spans: this span is the tag, not a style
        priority: 60,
        getAttrs: (el) => {
          const name = el.getAttribute('data-merge-tag')
          return isMergeTagName(name) ? { name } : false
        },
      },
    ],
    toHTML: (node) => {
      const name = node.attrs['name'] as string
      return ['span', { 'data-merge-tag': name }, `{{${name}}}`]
    },
  },
} satisfies Record<string, NodeSpec>

/** Only well-formed tags from your list (checked once: it is configuration, not input). */
function checkedTags(tags: readonly MergeTag[]): readonly MergeTag[] {
  for (const tag of tags)
    if (!isMergeTagName(tag.name)) throw new RangeError(`Invalid merge tag name "${tag.name}"`)
  return tags
}

/** Inserts the tag `name` at the cursor (replacing the selection). */
export function insertMergeTag(name: string): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes['merge_tag']
    const { $from } = state.selection
    if (!type || !isMergeTagName(name) || $from.parent.type.spec.code) return false
    if (!$from.parent.inlineContent || !$from.parent.type.canContain(type)) return false
    dispatch?.(state.tr.replaceSelectionWith(type.create({ name })).scrollIntoView())
    return true
  }
}

const shown = (tag: MergeTag) => (tag.group ? `${tag.group} › ${tag.label}` : tag.label)

interface TagItem extends SuggestItem {
  readonly name: string
}

/** Typing "{{" opens a list of your tags, filtered by what follows (name or label). */
function tagSuggestion(tags: readonly MergeTag[], t: Translate): Suggestion<TagItem> {
  const items: TagItem[] = tags.map((tag) => ({
    name: tag.name,
    label: shown(tag),
    detail: `{{${tag.name}}}`,
  }))
  return createSuggestion<TagItem>({
    name: 'merge-tag',
    trigger: '{{',
    canOpen: (state, from) => {
      const type = state.schema.nodes['merge_tag']
      return !!type && state.doc.resolve(from).parent.type.canContain(type)
    },
    isQuery: (query) => /^[\p{L}\p{N}_. ]{0,50}$/u.test(query) && !/^\s|\s\s/.test(query),
    clean: (raw, max) => (Array.isArray(raw) ? (raw as TagItem[]).slice(0, max) : []),
    insert: (state, from, to, item) => {
      const type = state.schema.nodes['merge_tag']
      if (!type || !isMergeTagName(item.name)) return null
      return state.tr.replaceWith(
        from,
        to,
        type.create({ name: item.name }, null, state.doc.resolve(from).marks()),
      )
    },
    search: (query) => {
      const q = query.trim().toLocaleLowerCase()
      return items.filter(
        (item) => !q || item.name.includes(q) || item.label.toLocaleLowerCase().includes(q),
      )
    },
    texts: {
      list: t('mergeTag.list'),
      loading: t('mention.loading'),
      none: t('mergeTag.none'),
      error: t('mention.error'),
    },
    className: 'scriba-merge-tag-menu',
    debounce: 0,
  })
}

/** The "{{" suggestions: add `plugins` and `keymap()` (high priority) to the editor. */
export function mergeTags(
  tags: readonly MergeTag[],
  t: Translate,
): { plugins: Plugin[]; keymap(): KeyBindings } {
  const suggestion = tagSuggestion(checkedTags(tags), t)
  return { plugins: [suggestion.plugin], keymap: () => suggestion.keymap() }
}

/** Insert ▸ Merge tag: one entry per tag of your list. */
export function mergeTagMenu(tags: readonly MergeTag[]): ToolbarMenu {
  return {
    type: 'menu',
    id: 'merge-tags',
    icon: 'mergeTag',
    label: (t) => t('mergeTag.menu'),
    entries: checkedTags(tags).map((tag): ToolbarMenuEntry => ({
      id: `merge-tag-${tag.name}`,
      label: () => shown(tag),
      command: insertMergeTag(tag.name),
    })),
  }
}

/**
 * The document with each tag replaced by its value, as plain text keeping the
 * formatting around it (a tag without a value stays as it is). The values are
 * text: never parsed as HTML.
 */
export function fillMergeTags(doc: Node, values: Readonly<Record<string, string>>): Node {
  const fill = (node: Node): Node => {
    if (!node.content.size) return node
    const children: Node[] = []
    let changed = false
    // neighbouring text with the same formatting becomes one text node (a normalized document)
    const push = (child: Node) => {
      const last = children[children.length - 1]
      if (last?.isText && child.isText && last.sameMarkup(child))
        children[children.length - 1] = doc.type.schema.text(last.text! + child.text!, last.marks)
      else children.push(child)
    }
    node.content.forEach((child) => {
      if (child.type.name === 'merge_tag') {
        const value = values[child.attrs['name'] as string]
        if (typeof value === 'string') {
          changed = true
          if (value) push(doc.type.schema.text(value, child.marks))
          return
        }
      }
      const next = fill(child)
      if (next !== child) changed = true
      push(next)
    })
    return changed ? node.copy(Fragment.fromArray(children)) : node
  }
  return fill(doc)
}

/** The names of the tags used in the document, in order, without repeats. */
export function mergeTagsIn(state: EditorState | { doc: Node }): string[] {
  const names = new Set<string>()
  state.doc.descendants((node) => {
    if (node.type.name === 'merge_tag') names.add(node.attrs['name'] as string)
  })
  return [...names]
}
