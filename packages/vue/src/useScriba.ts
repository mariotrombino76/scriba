import {
  EditorState,
  baseKeymap,
  basicSchema,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  ADD_TO_HISTORY,
  type Plugin,
  type Schema,
} from '@scriba/core'
import { EditorView } from '@scriba/view'
import {
  onBeforeUnmount,
  onMounted,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from 'vue'
import { parseContent, serializeContent, type Content, type ContentFormat } from './content.js'

export interface UseScribaOptions {
  /** Default: the Phase 1 `basicSchema`. */
  schema?: Schema
  /** Initial content. */
  content?: Content | null
  /** Format of `content` and of `getContent()`. Default `'html'`. */
  format?: ContentFormat
  /** Extra plugins, run before the default keymaps. */
  plugins?: Plugin[]
  /** Replace the default plugins (history + keymaps) entirely. */
  defaultPlugins?: boolean
  editable?: MaybeRefOrGetter<boolean>
  /** Accessible name of the editing area. */
  label?: MaybeRefOrGetter<string | undefined>
  /** Called after every document change with the serialized content. */
  onChange?: (content: Content) => void
}

export interface UseScriba {
  view: ShallowRef<EditorView | null>
  state: ShallowRef<EditorState | null>
  /** Serialized document in the configured format. */
  getContent(): Content
  /** Replaces the document (untrusted input: parsed through the schema). Not undoable. */
  setContent(content: Content | null): void
  focus(): void
}

/** Default plugins: history and the standard keymaps. */
export function defaultScribaPlugins(schema: Schema): Plugin[] {
  return [history(), keymap(historyKeymap), keymap(formatKeymap(schema)), keymap(baseKeymap)]
}

/**
 * Creates an editor inside `target` when the component mounts and destroys it
 * on unmount.
 */
export function useScriba(
  target: Ref<HTMLElement | null>,
  options: UseScribaOptions = {},
): UseScriba {
  const schema = options.schema ?? basicSchema
  const format = options.format ?? 'html'
  const view = shallowRef<EditorView | null>(null)
  const state = shallowRef<EditorState | null>(null)

  onMounted(() => {
    const place = target.value
    if (!place) throw new Error('useScriba: target element is not mounted')
    const plugins = [
      ...(options.plugins ?? []),
      ...(options.defaultPlugins === false ? [] : defaultScribaPlugins(schema)),
    ]
    const editorState = EditorState.create({
      doc: parseContent(schema, options.content, format),
      plugins,
    })
    const label = toValue(options.label)
    const instance: EditorView = new EditorView(place, {
      state: editorState,
      ...(label ? { label } : {}),
      editable: () => toValue(options.editable) ?? true,
      dispatchTransaction(tr) {
        const next = instance.state.apply(tr)
        instance.updateState(next)
        state.value = next
        if (tr.docChanged && tr.getMeta('scribaSetContent') !== true)
          options.onChange?.(serializeContent(next.doc, format))
      },
    })
    view.value = instance
    state.value = editorState
  })

  watch(
    () => toValue(options.editable),
    () => view.value?.updateState(view.value.state),
  )
  watch(
    () => toValue(options.label),
    (label) => {
      if (label) view.value?.dom.setAttribute('aria-label', label)
    },
  )

  onBeforeUnmount(() => {
    view.value?.destroy()
    view.value = null
  })

  return {
    view,
    state,
    getContent: () => serializeContent((view.value?.state ?? state.value)!.doc, format),
    setContent(content) {
      const v = view.value
      if (!v) return
      const doc = parseContent(schema, content, format)
      const tr = v.state.tr.replaceWith(0, v.state.doc.content.size, doc.content)
      tr.setMeta(ADD_TO_HISTORY, false).setMeta('scribaSetContent', true)
      v.dispatch(tr)
    },
    focus: () => view.value?.focus(),
  }
}
