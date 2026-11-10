import type { Node } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import { createIcon } from '@scriba-editor/ui'
import type { NodeViewFactory } from '@scriba-editor/view'
import { embedTitle } from './nodes.js'
import { pageUrl, providerKind, type EmbedProvider } from './providers.js'

/**
 * How an embed looks in the editor: a card with the kind (video, song, map),
 * the title and the address, the size of the player. The player itself is not loaded while
 * writing: nothing is asked of the service until the page is published
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
    let icon: SVGSVGElement = createIcon(doc, 'video', 32)
    const text = doc.createElement('div')
    text.className = 'scriba-embed-text'
    const name = doc.createElement('strong')
    const address = doc.createElement('span')
    address.className = 'scriba-embed-address'
    text.append(name, address)
    dom.append(icon, text)

    const show = (node: Node) => {
      const title = embedTitle(node)
      const provider = node.attrs['provider'] as EmbedProvider
      const kind = providerKind(provider)
      const url = pageUrl({ provider, ref: node.attrs['ref'] as string })
      icon.replaceWith(
        (icon = createIcon(doc, kind === 'map' ? 'map' : kind === 'audio' ? 'music' : 'video', 32)),
      )
      name.textContent = title
      address.textContent = url
      dom.setAttribute('aria-label', t('embed.label', { kind: t(`embed.kind.${kind}`), title }))
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

/**
 * A video or audio file in the editor: the real player (play, seek, volume
 * work; the editor leaves events on it to the browser), in a frame that
 * selects the node. Its file is loaded: the editor's CSP needs `media-src`
 * for the files' origin.
 *
 * `nodeViews: { video_file: mediaFileNodeView(t), audio_file: mediaFileNodeView(t) }`
 */
export function mediaFileNodeView(t: Translate): NodeViewFactory {
  return (initial, view) => {
    const doc = view.document
    const dom = doc.createElement('div')
    dom.className = 'scriba-media-file'
    const tag = initial.type.name === 'audio_file' ? 'audio' : 'video'
    const player = doc.createElement(tag)
    player.controls = true
    player.preload = 'metadata'
    player.src = initial.attrs['src'] as string
    player.setAttribute('aria-label', t(tag === 'audio' ? 'embed.kind.audio' : 'embed.kind.video'))
    dom.appendChild(player)
    return {
      dom,
      update(next) {
        if (next.type !== initial.type) return false
        if (player.getAttribute('src') !== next.attrs['src'])
          player.src = next.attrs['src'] as string
        return true
      },
      // the player's own controls
      stopEvent: (event) => event.target === player,
    }
  }
}
