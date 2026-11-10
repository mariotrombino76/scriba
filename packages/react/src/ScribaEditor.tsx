import type { Plugin, Schema } from '@scriba-editor/core'
import { createTranslator, type Messages } from '@scriba-editor/i18n'
import { defineScribaToolbar, inlineToolbar, type ScribaToolbar } from '@scriba-editor/ui'
import { sameContent, type Content, type ContentFormat, type NodeViewFactory } from '@scriba-editor/view'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useScriba, type UseScriba } from './useScriba.js'

export interface ScribaEditorProps {
  /** The content (HTML string or JSON). Changes from outside replace the document. */
  value?: Content | null
  /** Called after every change by the user, with the content in `format`. */
  onChange?: (value: Content) => void
  /** `'html'` (default) or `'json'`. */
  format?: ContentFormat
  /** Read when the editor is created. */
  schema?: Schema
  /** Read when the editor is created. */
  plugins?: Plugin[]
  editable?: boolean
  /** Accessible name; defaults to the translated "Rich text editor". */
  label?: string
  /** UI language (`'it'`, `'en'`…) or a message object. Default `'it'`. */
  locale?: string | Messages
  /** Shows the default `<scriba-toolbar>` above the editor. Default true. */
  toolbar?: boolean
  /** Inline mode: page styles, toolbar only while focused (floating). Read when mounted. */
  inline?: boolean
  /** Custom views of atomic nodes. Read when the editor is created. */
  nodeViews?: Readonly<Record<string, NodeViewFactory>>
  className?: string
}

/**
 * The Scriba editor as a React component: `<ScribaEditor value={html} onChange={setHtml} />`.
 * The ref exposes `getContent`, `setContent`, `focus`, `view` and `state`.
 * The content is untrusted input: it always goes through the schema parser.
 */
export const ScribaEditor = forwardRef<UseScriba, ScribaEditorProps>(function ScribaEditor(
  {
    value = null,
    onChange,
    format = 'html',
    schema,
    plugins,
    editable = true,
    label,
    locale = 'it',
    toolbar = true,
    inline = false,
    nodeViews,
    className,
  },
  ref,
) {
  defineScribaToolbar()
  const t = useMemo(() => createTranslator(locale), [locale])
  const editorEl = useRef<HTMLDivElement | null>(null)
  const toolbarEl = useRef<ScribaToolbar | null>(null)
  const rootEl = useRef<HTMLDivElement | null>(null)
  const lastEmitted = useRef<Content | null>(value)
  const scriba = useScriba(editorEl, {
    ...(schema ? { schema } : {}),
    ...(plugins ? { plugins } : {}),
    ...(nodeViews ? { nodeViews } : {}),
    content: value,
    format,
    editable,
    label: label ?? t('editor.label'),
    onChange(content) {
      lastEmitted.current = content
      onChange?.(content)
    },
  })
  useImperativeHandle(ref, () => scriba, [scriba])

  // the toolbar is a Web Component: its properties are set here (works with React 18 and 19)
  useEffect(() => {
    const bar = toolbarEl.current
    if (!bar) return
    bar.translator = t
    bar.view = scriba.view
  }, [t, scriba.view, toolbar])

  useEffect(() => {
    if (!inline || !rootEl.current || !toolbarEl.current) return
    const handle = inlineToolbar(rootEl.current, toolbarEl.current)
    return () => handle.destroy()
  }, [inline, toolbar])

  // a value changed from outside replaces the content (parsed through the schema)
  useEffect(() => {
    if (!scriba.view || sameContent(value, lastEmitted.current)) return
    lastEmitted.current = value
    scriba.setContent(value)
  }, [value, scriba])

  return (
    <div
      ref={rootEl}
      className={['scriba', inline ? 'scriba-inline' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {toolbar ? <scriba-toolbar ref={toolbarEl} /> : null}
      <div ref={editorEl} className="scriba-mount" />
    </div>
  )
})

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'scriba-toolbar': React.DetailedHTMLProps<React.HTMLAttributes<ScribaToolbar>, ScribaToolbar>
    }
  }
}
