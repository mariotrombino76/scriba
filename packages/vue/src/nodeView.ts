import { NodeSelection, type Node } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { EditorView, NodeView, NodeViewFactory } from '@scriba/view'
import { defineComponent, h, render, shallowReactive, type AppContext, type Component } from 'vue'

/** Props a component shown by `vueNodeView` receives. */
export interface NodeViewProps {
  /** The node (immutable; a new one arrives after every change). */
  node: Node
  /** Shortcut for `node.attrs`. */
  attrs: Readonly<Record<string, unknown>>
  /** The node is the selected node. */
  selected: boolean
  /** The editor is editable (false: show, do not change). */
  editable: boolean
  /**
   * Changes attributes (merged with the current ones) as one undoable step.
   * Values are validated by the schema: invalid ones are refused (returns false).
   */
  updateAttrs: (attrs: Record<string, unknown>) => boolean
  /** Gives the focus back to the editor with this node selected (e.g. on Escape). */
  leave: () => void
  /** Translations (when passed to `vueNodeView`). */
  t: Translate | undefined
}

export interface VueNodeViewOptions {
  /** Translations handed to the component as `t`. */
  t?: Translate
  /**
   * Your app's context, so the component sees its globals (plugins, provide):
   * `getCurrentInstance()?.appContext` in the component that sets up the editor.
   */
  appContext?: AppContext
  /** Element of the node: `div` for blocks (default), `span` for inline nodes. */
  as?: 'div' | 'span'
}

/**
 * Shows atomic nodes of a type with a Vue component (see `NodeViewProps`).
 * The component only draws the node and changes its attributes through
 * `updateAttrs`: the document stays the source of truth, and the HTML output
 * still comes from the node's `toHTML` (never from the component's DOM).
 *
 * ```ts
 * new EditorView(el, { state, nodeViews: { task: vueNodeView(TaskView, { t }) } })
 * ```
 */
export function vueNodeView(
  component: Component,
  options: VueNodeViewOptions = {},
): NodeViewFactory {
  return (node: Node, view: EditorView, getPos: () => number | null): NodeView => {
    const dom = view.document.createElement(options.as ?? (node.isInline ? 'span' : 'div'))
    dom.className = 'scriba-node-view'
    const state = shallowReactive({ node, selected: false, editable: view.editable })

    const updateAttrs = (attrs: Record<string, unknown>): boolean => {
      const pos = getPos()
      if (pos === null || !view.editable) return false
      try {
        view.dispatch(view.state.tr.setNodeAttrs(pos, attrs))
        return true
      } catch {
        return false // refused by the schema (invalid value)
      }
    }
    const leave = () => {
      const pos = getPos()
      if (pos === null) return
      view.focus()
      // select the node again, so arrows and Enter work from it
      const sel = view.state.selection
      if (!(sel instanceof NodeSelection) || sel.from !== pos)
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
    }

    const Root = defineComponent({
      render: () =>
        h(component, {
          node: state.node,
          attrs: state.node.attrs,
          selected: state.selected,
          editable: state.editable,
          updateAttrs,
          leave,
          t: options.t,
        } satisfies NodeViewProps),
    })
    const vnode = h(Root)
    vnode.appContext = options.appContext ?? null
    render(vnode, dom)
    const unsubscribe = view.subscribe(() => {
      if (state.editable !== view.editable) state.editable = view.editable
    })

    return {
      dom,
      update(next) {
        if (next.type !== state.node.type) return false
        state.node = next
        return true
      },
      selectNode: () => (state.selected = true),
      deselectNode: () => (state.selected = false),
      destroy() {
        unsubscribe()
        render(null, dom)
      },
    }
  }
}
