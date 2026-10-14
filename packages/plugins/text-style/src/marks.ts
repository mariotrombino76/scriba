import {
  normalizeColor,
  normalizeFontFamily,
  normalizeLength,
  styleValue,
  type Command,
  type EditorState,
  type HTMLSpec,
  type MarkSpec,
  type MarkType,
} from '@scriba/core'

const fontSize = (v: unknown) =>
  typeof v === 'string' ? normalizeLength(v, ['px', 'pt', 'em', 'rem', '%'], 400) : null

/** Marks for colors and fonts. Values are validated and normalized (typed styles). */
export const textStyleMarks = {
  text_color: {
    attrs: { color: { validate: (v) => normalizeColor(v) === v } },
    parseHTML: [
      {
        tag: 'span',
        getAttrs: (el) => normalizedOrFalse('color', normalizeColor(styleValue(el, 'color'))),
      },
      {
        tag: 'font',
        getAttrs: (el) => normalizedOrFalse('color', normalizeColor(el.getAttribute('color'))),
      },
    ],
    toHTML: (mark): HTMLSpec => ['span', { style: { color: mark.attrs['color'] as string } }, 0],
  },
  background_color: {
    attrs: { color: { validate: (v) => normalizeColor(v) === v } },
    parseHTML: [
      {
        tag: 'span',
        getAttrs: (el) =>
          normalizedOrFalse('color', normalizeColor(styleValue(el, 'background-color'))),
      },
      { tag: 'mark', getAttrs: () => ({ color: '#ffff00' }) },
    ],
    toHTML: (mark): HTMLSpec => [
      'span',
      { style: { 'background-color': mark.attrs['color'] as string } },
      0,
    ],
  },
  font_family: {
    attrs: { family: { validate: (v) => normalizeFontFamily(v) === v } },
    parseHTML: [
      {
        tag: 'span',
        getAttrs: (el) =>
          normalizedOrFalse('family', normalizeFontFamily(styleValue(el, 'font-family'))),
      },
      {
        tag: 'font',
        getAttrs: (el) => normalizedOrFalse('family', normalizeFontFamily(el.getAttribute('face'))),
      },
    ],
    toHTML: (mark): HTMLSpec => [
      'span',
      { style: { 'font-family': mark.attrs['family'] as string } },
      0,
    ],
  },
  font_size: {
    attrs: { size: { validate: (v) => fontSize(v) === v } },
    parseHTML: [
      {
        tag: 'span',
        getAttrs: (el) => normalizedOrFalse('size', fontSize(styleValue(el, 'font-size'))),
      },
    ],
    toHTML: (mark): HTMLSpec => [
      'span',
      { style: { 'font-size': mark.attrs['size'] as string } },
      0,
    ],
  },
} satisfies Record<string, MarkSpec>

function normalizedOrFalse(attr: string, value: string | null): Record<string, string> | false {
  return value === null ? false : { [attr]: value }
}

/**
 * Applies a mark with the given attributes to the selection (replacing any
 * existing mark of that type), or removes it when `attrs` is null.
 * With a cursor it changes the marks of the next typed text.
 */
export function setMarkValue(type: MarkType, attrs: Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const { from, to, empty, $from } = state.selection
    let applies = empty ? $from.parent.type.allowsMarkType(type) : false
    if (!empty) {
      state.doc.nodesBetween(from, to, (node) => {
        if (node.inlineContent && node.type.allowsMarkType(type)) applies = true
        return !applies
      })
    }
    if (!applies) return false
    if (!dispatch) return true
    const mark = attrs ? type.create(attrs) : null
    const tr = state.tr
    if (empty) {
      tr.removeStoredMark(type)
      if (mark) tr.addStoredMark(mark)
    } else {
      tr.removeMark(from, to, type)
      if (mark) tr.addMark(from, to, mark)
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** Value of `attr` of the mark at the cursor / selection start, or null. */
export function markValue(state: EditorState, type: MarkType, attr: string): unknown {
  const { empty, $from, from, to } = state.selection
  if (empty) return type.isInSet(state.storedMarks ?? $from.marks())?.attrs[attr] ?? null
  let value: unknown = undefined
  let mixed = false
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || mixed) return
    const v = type.isInSet(node.marks)?.attrs[attr] ?? null
    if (value === undefined) value = v
    else if (value !== v) mixed = true
  })
  return mixed ? null : (value ?? null)
}
