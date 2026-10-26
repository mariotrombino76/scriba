import type { DOMLikeElement, Node, NodeSpec } from '@scriba/core'
import {
  isEmbedProvider,
  isVideoId,
  pageUrl,
  playerUrl,
  videoFromPlayerUrl,
  type EmbedProvider,
} from './providers.js'

/** Fixed iframe attributes, set by the editor only (never read from the input). */
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation'
export const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin'

export const MIN_EMBED_WIDTH = 200
export const MAX_EMBED_WIDTH = 1920
export const MIN_EMBED_HEIGHT = 113
export const MAX_EMBED_HEIGHT = 1080
export const MAX_EMBED_TITLE = 200

const isSize = (min: number, max: number) => (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isControl = (c: string) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127
const isTitle = (v: unknown) =>
  typeof v === 'string' && v.length <= MAX_EMBED_TITLE && ![...v].some(isControl)

/** A title from outside (HTML, dialog): control characters become spaces, within the limit. */
export function cleanEmbedTitle(raw: string): string {
  return [...raw]
    .map((c) => (isControl(c) ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EMBED_TITLE)
}

/** A size attribute in HTML: digits only, kept within the limits. */
function size(el: DOMLikeElement, name: string, fallback: number, min: number, max: number) {
  const raw = el.getAttribute(name)?.trim() ?? ''
  if (!/^\d{1,5}$/.test(raw)) return fallback
  return Math.min(max, Math.max(min, Number(raw)))
}

const PROVIDER_NAME: Record<EmbedProvider, string> = { youtube: 'YouTube', vimeo: 'Vimeo' }

/** The video's accessible name: its title, or the name of the service. */
export function embedTitle(node: Node): string {
  return (node.attrs['title'] as string) || PROVIDER_NAME[node.attrs['provider'] as EmbedProvider]
}

/**
 * Video embeds (approved 2026-10-19): an `<iframe>` whose `src` is exactly a
 * YouTube privacy-enhanced player (`www.youtube-nocookie.com/embed/<id>`) or a
 * Vimeo player (`player.vimeo.com/video/<id>`). Stored: service, checked id,
 * title, width and height; the `src` is rebuilt from them and `sandbox`,
 * `referrerpolicy`, `loading` are fixed. Any other iframe is dropped (CLAUDE.md §5.5).
 *
 * Pages showing the saved HTML need `frame-src https://www.youtube-nocookie.com
 * https://player.vimeo.com` in their CSP.
 */
export const embedNodes = {
  embed: {
    group: 'block',
    atom: true,
    attrs: {
      provider: { default: 'youtube', validate: isEmbedProvider },
      // the format of either service (toHTML checks it against the provider again)
      videoId: {
        validate: (v) => isVideoId('youtube', v) || isVideoId('vimeo', v),
      },
      title: { default: '', validate: isTitle },
      width: { default: 560, validate: isSize(MIN_EMBED_WIDTH, MAX_EMBED_WIDTH) },
      height: { default: 315, validate: isSize(MIN_EMBED_HEIGHT, MAX_EMBED_HEIGHT) },
    },
    leafText: (node) =>
      pageUrl({
        provider: node.attrs['provider'] as EmbedProvider,
        id: node.attrs['videoId'] as string,
      }),
    parseHTML: [
      {
        tag: 'iframe',
        getAttrs: (el) => {
          const video = videoFromPlayerUrl(el.getAttribute('src') ?? '')
          if (!video) return false
          const title = cleanEmbedTitle(el.getAttribute('title') ?? '')
          return {
            provider: video.provider,
            videoId: video.id,
            title,
            width: size(el, 'width', 560, MIN_EMBED_WIDTH, MAX_EMBED_WIDTH),
            height: size(el, 'height', 315, MIN_EMBED_HEIGHT, MAX_EMBED_HEIGHT),
          }
        },
      },
    ],
    toHTML: (node) => {
      const provider = node.attrs['provider'] as EmbedProvider
      const id = node.attrs['videoId'] as string
      // validated together here: the id format depends on the service
      if (!isVideoId(provider, id)) return ['p']
      return [
        'iframe',
        {
          src: playerUrl({ provider, id }),
          width: String(node.attrs['width']),
          height: String(node.attrs['height']),
          title: embedTitle(node),
          sandbox: EMBED_SANDBOX,
          referrerpolicy: EMBED_REFERRER_POLICY,
          loading: 'lazy',
        },
      ]
    },
  },
} satisfies Record<string, NodeSpec>
