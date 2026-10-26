/**
 * The video services that may be embedded (approved 2026-10-19) and how their
 * addresses are read. Only a provider and a checked video id are stored: the
 * iframe address is always rebuilt from them, never copied from the input.
 */
export const EMBED_PROVIDERS = ['youtube', 'vimeo'] as const
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number]

export interface VideoRef {
  readonly provider: EmbedProvider
  readonly id: string
}

const ID: Record<EmbedProvider, RegExp> = {
  youtube: /^[A-Za-z0-9_-]{11}$/,
  vimeo: /^[1-9]\d{0,11}$/,
}

export const isEmbedProvider = (v: unknown): v is EmbedProvider =>
  typeof v === 'string' && (EMBED_PROVIDERS as readonly string[]).includes(v)

export function isVideoId(provider: EmbedProvider, id: unknown): id is string {
  return typeof id === 'string' && ID[provider].test(id)
}

/** The address of the player (the only `src` an embed ever gets). */
export function playerUrl({ provider, id }: VideoRef): string {
  return provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : `https://player.vimeo.com/video/${id}`
}

/** The public page of the video (plain-text, Markdown and Word exports). */
export function pageUrl({ provider, id }: VideoRef): string {
  return provider === 'youtube'
    ? `https://www.youtube.com/watch?v=${id}`
    : `https://vimeo.com/${id}`
}

function parse(address: string): URL | null {
  try {
    const url = new URL(address.trim())
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null
  } catch {
    return null
  }
}

function ref(provider: EmbedProvider, id: string | null | undefined): VideoRef | null {
  return isVideoId(provider, id) ? { provider, id } : null
}

/**
 * The `src` of an iframe in HTML (pasted, loaded, sent to the server): only
 * the two player addresses, exactly. Anything else is not an embed.
 */
export function videoFromPlayerUrl(src: string): VideoRef | null {
  const url = parse(src)
  if (!url) return null
  const path = url.pathname
  if (url.hostname === 'www.youtube-nocookie.com' || url.hostname === 'youtube-nocookie.com')
    return ref('youtube', /^\/embed\/([^/]+)$/.exec(path)?.[1])
  if (url.hostname === 'player.vimeo.com') return ref('vimeo', /^\/video\/(\d+)$/.exec(path)?.[1])
  return null
}

/**
 * An address typed or pasted in the dialog: the usual links to a video
 * (youtube.com/watch?v=…, youtu.be/…, /shorts/…, vimeo.com/…) or a player
 * address. The result is always the privacy-enhanced player.
 */
export function videoFromAddress(address: string): VideoRef | null {
  const player = videoFromPlayerUrl(address)
  if (player) return player
  const url = parse(/^[a-z][\w+.-]*:/i.test(address.trim()) ? address : `https://${address.trim()}`)
  if (!url) return null
  const host = url.hostname.replace(/^(www|m)\./, '')
  const path = url.pathname
  if (host === 'youtube.com') {
    if (path === '/watch') return ref('youtube', url.searchParams.get('v'))
    return ref('youtube', /^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(path)?.[1])
  }
  if (host === 'youtu.be') return ref('youtube', /^\/([^/]+)$/.exec(path)?.[1])
  if (host === 'vimeo.com') return ref('vimeo', /^\/(\d+)\/?$/.exec(path)?.[1])
  return null
}
