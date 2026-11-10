import type { Node } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import { createIcon } from '@scriba-editor/ui'
import type { NodeViewFactory } from '@scriba-editor/view'
import { setDetailsOpen } from './commands.js'

/**
 * How a section looks in the editor: a button to open or close it, then its
 * title and content (hidden when closed, by the theme's CSS). A native
 * `<details>` would open and close by itself on clicks, outside the document.
 *
 * `new EditorView(el, { nodeViews: { details: detailsNodeView(t) } })`
 */
export function detailsNodeView(t: Translate): NodeViewFactory {
  return (initial, view, getPos) => {
    let node: Node = initial
    const doc = view.document
    const dom = doc.createElement('div')
    dom.className = 'scriba-details'
    const toggle = doc.createElement('button')
    toggle.type = 'button'
    toggle.className = 'scriba-details-toggle'
    toggle.contentEditable = 'false'
    // reached with the keyboard through the menu command, not with Tab inside the text
    toggle.tabIndex = -1
    toggle.setAttribute('aria-label', t('details.toggle'))
    toggle.appendChild(createIcon(doc, 'chevronRight', 16))
    const content = doc.createElement('div')
    content.className = 'scriba-details-content'
    dom.append(toggle, content)

    const show = (open: boolean) => {
      dom.toggleAttribute('data-open', open)
      toggle.setAttribute('aria-expanded', String(open))
    }
    show(node.attrs['open'] === true)
    toggle.addEventListener('mousedown', (e) => e.preventDefault())
    toggle.addEventListener('click', () => {
      const pos = getPos()
      if (pos === null) return
      // read-only: open and close only on this screen, the document stays as it is
      if (!view.editable) return show(!dom.hasAttribute('data-open'))
      setDetailsOpen(pos, !node.attrs['open'])(view.state, (tr) => view.dispatch(tr))
    })
    return {
      dom,
      contentDOM: content,
      update(next) {
        if (next.type !== node.type) return false
        node = next
        show(next.attrs['open'] === true)
        return true
      },
    }
  }
}
