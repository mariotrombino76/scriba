/**
 * The services that may be embedded (YouTube and Vimeo approved 2026-10-19;
 * Dailymotion, Spotify and Google Maps 2026-10-26) and how their addresses are
 * read. Only a service and a checked reference are stored: the iframe address
 * is always rebuilt from them, never copied from the input.
 */
export const EMBED_PROVIDERS = ['youtube', 'vimeo', 'dailymotion', 'spotify', 'maps'] as const
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number]

export interface EmbedRef {
  readonly provider: EmbedProvider
  /** Video id, `track/<id>` for Spotify, the `pb` parameter for Google Maps. */
  readonly ref: string
}

/** What kind of player: names the card in the editor and the default size. */
export type EmbedKind = 'video' | 'audio' | 'map'

interface ProviderSpec {
  readonly name: string
  readonly kind: EmbedKind
  /** The only references kept (charset and length). */
  readonly ref: RegExp
  readonly size: { readonly width: number; readonly height: number }
  player(ref: string): string
  page(ref: string): string
  /** The reference in an exact player address (HTML input), or null. */
  fromPlayer(url: URL): string | null
  /** The reference in a usual link to the content (dialog input), or null. */
  fromLink?(url: URL, host: string): string | null
}

const SPOTIFY_TYPES = 'track|album|playlist|episode'
const match = (re: RegExp, s: string) => re.exec(s)?.[1] ?? null

const PROVIDERS: Record<EmbedProvider, ProviderSpec> = {
  youtube: {
    name: 'YouTube',
    kind: 'video',
    ref: /^[A-Za-z0-9_-]{11}$/,
    size: { width: 560, height: 315 },
    player: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
    page: (id) => `https://www.youtube.com/watch?v=${id}`,
    fromPlayer: (url) =>
      url.hostname === 'www.youtube-nocookie.com' || url.hostname === 'youtube-nocookie.com'
        ? match(/^\/embed\/([^/]+)$/, url.pathname)
        : null,
    fromLink(url, host) {
      if (host === 'youtu.be') return match(/^\/([^/]+)$/, url.pathname)
      if (host !== 'youtube.com') return null
      if (url.pathname === '/watch') return url.searchParams.get('v')
      return match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/, url.pathname)
    },
  },
  vimeo: {
    name: 'Vimeo',
    kind: 'video',
    ref: /^[1-9]\d{0,11}$/,
    size: { width: 560, height: 315 },
    player: (id) => `https://player.vimeo.com/video/${id}`,
    page: (id) => `https://vimeo.com/${id}`,
    fromPlayer: (url) =>
      url.hostname === 'player.vimeo.com' ? match(/^\/video\/(\d+)$/, url.pathname) : null,
    fromLink: (url, host) => (host === 'vimeo.com' ? match(/^\/(\d+)\/?$/, url.pathname) : null),
  },
  dailymotion: {
    name: 'Dailymotion',
    kind: 'video',
    ref: /^x[a-z0-9]{4,12}$/i,
    size: { width: 560, height: 315 },
    player: (id) => `https://www.dailymotion.com/embed/video/${id}`,
    page: (id) => `https://www.dailymotion.com/video/${id}`,
    fromPlayer: (url) =>
      url.hostname === 'www.dailymotion.com'
        ? match(/^\/embed\/video\/([^/]+)$/, url.pathname)
        : null,
    fromLink(url, host) {
      if (host === 'dai.ly') return match(/^\/([^/]+)$/, url.pathname)
      if (host === 'geo.dailymotion.com' && url.pathname === '/player.html')
        return url.searchParams.get('video')
      return host === 'dailymotion.com' ? match(/^\/video\/([^/]+)\/?$/, url.pathname) : null
    },
  },
  spotify: {
    name: 'Spotify',
    kind: 'audio',
    ref: new RegExp(`^(?:${SPOTIFY_TYPES})/[A-Za-z0-9]{22}$`),
    size: { width: 560, height: 152 },
    player: (ref) => `https://open.spotify.com/embed/${ref}`,
    page: (ref) => `https://open.spotify.com/${ref}`,
    fromPlayer: (url) =>
      url.hostname === 'open.spotify.com'
        ? match(new RegExp(`^/embed/((?:${SPOTIFY_TYPES})/[^/]+)$`), url.pathname)
        : null,
    fromLink: (url, host) =>
      host === 'open.spotify.com'
        ? match(
            new RegExp(`^(?:/intl-[a-z]{2}(?:-[a-z]{2})?)?/((?:${SPOTIFY_TYPES})/[^/]+)/?$`, 'i'),
            url.pathname,
          )
        : null,
  },
  maps: {
    name: 'Google Maps',
    kind: 'map',
    // the opaque "pb" parameter of an embed link, kept exactly as given (URL-safe characters only)
    // never markup characters, even percent-encoded (a map's data has no use for them)
    ref: /^(?!.*%(?:3c|3e|22|27|60))![A-Za-z0-9!._~%-]{9,3999}$/i,
    size: { width: 600, height: 450 },
    player: (pb) => `https://www.google.com/maps/embed?pb=${pb}`,
    page: (pb) => `https://www.google.com/maps/embed?pb=${pb}`,
    fromPlayer: (url) =>
      url.hostname === 'www.google.com' && url.pathname === '/maps/embed'
        ? match(/^\?pb=([^&#]+)$/, url.search)
        : null,
  },
}

export const isEmbedProvider = (v: unknown): v is EmbedProvider =>
  typeof v === 'string' && (EMBED_PROVIDERS as readonly string[]).includes(v)

/** Whether `ref` is a valid reference for `provider`. */
export function isEmbedRef(provider: EmbedProvider, ref: unknown): ref is string {
  return typeof ref === 'string' && PROVIDERS[provider].ref.test(ref)
}

/** Whether `ref` is valid for some service (the node attribute check). */
export const isAnyEmbedRef = (ref: unknown): ref is string =>
  EMBED_PROVIDERS.some((p) => isEmbedRef(p, ref))

export const providerName = (provider: EmbedProvider): string => PROVIDERS[provider].name
export const providerKind = (provider: EmbedProvider): EmbedKind => PROVIDERS[provider].kind
export const defaultSize = (provider: EmbedProvider) => PROVIDERS[provider].size

/** The address of the player (the only `src` an embed ever gets). */
export function playerUrl({ provider, ref }: EmbedRef): string {
  return PROVIDERS[provider].player(ref)
}

/** The public page of the content (plain-text, Markdown and Word exports). */
export function pageUrl({ provider, ref }: EmbedRef): string {
  return PROVIDERS[provider].page(ref)
}

function parse(address: string): URL | null {
  try {
    const url = new URL(address.trim())
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null
  } catch {
    return null
  }
}

function checked(provider: EmbedProvider, ref: string | null): EmbedRef | null {
  return ref !== null && isEmbedRef(provider, ref) ? { provider, ref } : null
}

/**
 * The `src` of an iframe in HTML (pasted, loaded, sent to the server): only
 * the exact player addresses of the approved services. Anything else is not
 * an embed.
 */
export function embedFromPlayerUrl(src: string): EmbedRef | null {
  const url = parse(src)
  if (!url) return null
  for (const provider of EMBED_PROVIDERS) {
    const found = checked(provider, PROVIDERS[provider].fromPlayer(url))
    if (found) return found
  }
  return null
}

/**
 * What is typed or pasted in the dialog: a usual link to the content
 * (youtube.com/watch?v=…, youtu.be/…, vimeo.com/…, dai.ly/…, open.spotify.com/…),
 * a player address, or the service's whole embed code (`<iframe src="…">`).
 */
export function embedFromAddress(input: string): EmbedRef | null {
  const text = input.trim()
  // an embed code: only its src is read, as text (the markup is never parsed or kept)
  const src = /<iframe\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(text)?.[1]
  const address = (src ?? text).replace(/&amp;/g, '&')
  const player = embedFromPlayerUrl(address)
  if (player) return player
  const url = parse(/^[a-z][\w+.-]*:/i.test(address) ? address : `https://${address}`)
  if (!url) return null
  const host = url.hostname.replace(/^(www|m)\./, '')
  for (const provider of EMBED_PROVIDERS) {
    const found = checked(provider, PROVIDERS[provider].fromLink?.(url, host) ?? null)
    if (found) return found
  }
  return null
}
