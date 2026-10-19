import {
  ADD_TO_HISTORY,
  EditorState,
  baseKeymap,
  basicSchema,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  type Plugin,
  type Schema,
} from '@scriba/core'
import {
  EditorView,
  parseContent,
  serializeContent,
  type Content,
  type ContentFormat,
  type NodeViewFactory,
} from '@scriba/view'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface UseScribaOptions {
  /** Default: the Phase 1 `basicSchema`. Read once, when the editor is created. */
  schema?: Schema
  /** Initial content (later changes: `setContent`, or the `value` of `<ScribaEditor>`). */
  content?: Content | null
  /** Format of `content` and of `getContent()`. Default `'html'`. */
  format?: ContentFormat
  /** Extra plugins, run before the default keymaps. Read once. */
  plugins?: Plugin[]
  /** `false`: no default plugins (history + keymaps). */
  defaultPlugins?: boolean
  editable?: boolean
  /** Accessible name of the editing area. */
  label?: string
  /** Called after every change of the document by the user, with the serialized content. */
  onChange?: (content: Content) => void
  /** Custom views of atomic nodes. Read once. */
  nodeViews?: Readonly<Record<string, NodeViewFactory>>
}

export interface UseScriba {
  /** The editor, once mounted (null before the first effect and after unmount). */
  view: EditorView | null
  /** The current state (updated on every transaction: re-renders the component). */
  state: EditorState | null
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
 * Creates an editor inside `target` after the component mounts and destroys it
 * on unmount (also under React's StrictMode double mount).
 */
export function useScriba(
  target: RefObject<HTMLElement | null>,
  options: UseScribaOptions = {},
): UseScriba {
  const [view, setView] = useState<EditorView | null>(null)
  const [state, setState] = useState<EditorState | null>(null)
  // latest options, read by the editor's callbacks without re-creating it
  const latest = useRef(options)
  latest.current = options
  const schema = options.schema ?? basicSchema
  const format = options.format ?? 'html'

  useEffect(() => {
    const place = target.current
    if (!place) throw new Error('useScriba: target element is not mounted')
    const o = latest.current
    const editorState = EditorState.create({
      doc: parseContent(schema, o.content, format),
      plugins: [
        ...(o.plugins ?? []),
        ...(o.defaultPlugins === false ? [] : defaultScribaPlugins(schema)),
      ],
    })
    const instance: EditorView = new EditorView(place, {
      state: editorState,
      ...(o.label ? { label: o.label } : {}),
      ...(o.nodeViews ? { nodeViews: o.nodeViews } : {}),
      editable: () => latest.current.editable ?? true,
      dispatchTransaction(tr) {
        const next = instance.state.apply(tr)
        instance.updateState(next)
        setState(next)
        if (tr.docChanged && tr.getMeta('scribaSetContent') !== true)
          latest.current.onChange?.(serializeContent(next.doc, format))
      },
    })
    setView(instance)
    setState(editorState)
    return () => {
      instance.destroy()
      setView(null)
    }
    // created once per mount: schema, plugins and format are read at creation
  }, [])

  useEffect(() => {
    view?.updateState(view.state) // read-only on or off
  }, [view, options.editable])

  useEffect(() => {
    if (view && options.label) view.dom.setAttribute('aria-label', options.label)
  }, [view, options.label])

  const getContent = useCallback(
    () => serializeContent((view?.state ?? state)!.doc, format),
    [view, state, format],
  )
  const setContent = useCallback(
    (content: Content | null) => {
      if (!view) return
      const doc = parseContent(schema, content, format)
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content)
      tr.setMeta(ADD_TO_HISTORY, false).setMeta('scribaSetContent', true)
      view.dispatch(tr)
    },
    [view, schema, format],
  )
  const focus = useCallback(() => view?.focus(), [view])
  return { view, state, getContent, setContent, focus }
}
