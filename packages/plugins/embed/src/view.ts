import type { Node } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import { createIcon } from '@scriba/ui'
import type { NodeViewFactory } from '@scriba/view'
import { embedTitle } from './nodes.js'
import { pageUrl, type EmbedProvider } from './providers.js'

/**
 * How a video looks in the editor: a card with the service, the title and the
 * address, the size of the player. The player itself is not loaded while
 * writing: nothing is asked of YouTube or Vimeo until the page is published
 * (and the editor needs no `frame-src` in its CSP). Double-click or Enter edits it.
 *
 * `new EditorView(el, { nodeViews: { embed: embedNodeView(t) } })`
 */
export function embedNodeView(t: Translate): NodeViewFactory {
  return (initial, view) => {
    const doc = view.document
    const dom = doc.createElement('div')
    dom.className = 'scriba-embed'
    dom.setAttribute('role', 'img')
    const icon = createIcon(doc, 'video', 32)
    const text = doc.createElement('div')
    text.className = 'scriba-embed-text'
    const name = doc.createElement('strong')
    const address = doc.createElement('span')
    address.className = 'scriba-embed-address'
    text.append(name, address)
    dom.append(icon, text)

    const show = (node: Node) => {
      const title = embedTitle(node)
      const url = pageUrl({
        provider: node.attrs['provider'] as EmbedProvider,
        id: node.attrs['videoId'] as string,
      })
      name.textContent = title
      address.textContent = url
      dom.setAttribute('aria-label', t('embed.label', { title }))
      dom.style.width = `${node.attrs['width'] as number}px`
      dom.style.aspectRatio = `${node.attrs['width'] as number} / ${node.attrs['height'] as number}`
    }
    show(initial)
    return {
      dom,
      update(next) {
        if (next.type !== initial.type) return false
        show(next)
        return true
      },
    }
  }
}
