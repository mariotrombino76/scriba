import type { DOMLikeElement, Node, NodeSpec } from '@scriba/core'
import {
  defaultSize,
  embedFromPlayerUrl,
  isAnyEmbedRef,
  isEmbedProvider,
  isEmbedRef,
  pageUrl,
  playerUrl,
  providerName,
  type EmbedProvider,
} from './providers.js'

/** Fixed iframe attributes, set by the editor only (never read from the input). */
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation'
export const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin'

/** The CSP `frame-src` sources a page needs to show the saved embeds. */
export const EMBED_FRAME_SRC = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://www.dailymotion.com',
  'https://open.spotify.com',
  'https://www.google.com',
] as const

export const MIN_EMBED_WIDTH = 200
export const MAX_EMBED_WIDTH = 1920
export const MIN_EMBED_HEIGHT = 80
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

/** The video's accessible name: its title, or the name of the service. */
export function embedTitle(node: Node): string {
  return (node.attrs['title'] as string) || providerName(node.attrs['provider'] as EmbedProvider)
}

/**
 * Embeds: an `<iframe>` whose `src` is exactly the player of an approved
 * service (see `EMBED_PROVIDERS`: YouTube privacy-enhanced, Vimeo, Dailymotion,
 * Spotify, Google Maps). Stored: service, checked reference,
 * title, width and height; the `src` is rebuilt from them and `sandbox`,
 * `referrerpolicy`, `loading` are fixed. Any other iframe is dropped (CLAUDE.md §5.5).
 *
 * Pages showing the saved HTML need the services in their CSP `frame-src` (see
 * `EMBED_FRAME_SRC`).
 */
export const embedNodes = {
  embed: {
    group: 'block',
    atom: true,
    attrs: {
      provider: { default: 'youtube', validate: isEmbedProvider },
      // the format of some service (toHTML checks it against the provider again)
      ref: { validate: isAnyEmbedRef },
      title: { default: '', validate: isTitle },
      width: { default: 560, validate: isSize(MIN_EMBED_WIDTH, MAX_EMBED_WIDTH) },
      height: { default: 315, validate: isSize(MIN_EMBED_HEIGHT, MAX_EMBED_HEIGHT) },
    },
    leafText: (node) =>
      pageUrl({
        provider: node.attrs['provider'] as EmbedProvider,
        ref: node.attrs['ref'] as string,
      }),
    parseHTML: [
      {
        tag: 'iframe',
        getAttrs: (el) => {
          const embed = embedFromPlayerUrl(el.getAttribute('src') ?? '')
          if (!embed) return false
          const fallback = defaultSize(embed.provider)
          return {
            provider: embed.provider,
            ref: embed.ref,
            title: cleanEmbedTitle(el.getAttribute('title') ?? ''),
            width: size(el, 'width', fallback.width, MIN_EMBED_WIDTH, MAX_EMBED_WIDTH),
            height: size(el, 'height', fallback.height, MIN_EMBED_HEIGHT, MAX_EMBED_HEIGHT),
          }
        },
      },
    ],
    toHTML: (node) => {
      const provider = node.attrs['provider'] as EmbedProvider
      const ref = node.attrs['ref'] as string
      // validated together here: the reference format depends on the service
      if (!isEmbedRef(provider, ref)) return ['p']
      return [
        'iframe',
        {
          src: playerUrl({ provider, ref }),
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
