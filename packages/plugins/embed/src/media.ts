import { sanitizeUrl, type DOMLike, type DOMLikeElement, type NodeSpec } from '@scriba/core'

/**
 * Video and audio files (approved 2026-10-26): `<video controls src>` and
 * `<audio controls src>`, nothing else. The address is https or relative only
 * (never `data:`, `blob:`, `javascript:`…); `controls` is always set, autoplay,
 * loop, muted, poster and any other attribute are dropped. A `<source>` child
 * is only read for its address, never written.
 */
export type MediaKind = 'video' | 'audio'

/** File types offered for upload and recognized by extension in an address. */
export const MEDIA_TYPES: Readonly<Record<MediaKind, readonly string[]>> = {
  video: ['video/mp4', 'video/webm', 'video/ogg'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/aac'],
}
const EXTENSIONS: Readonly<Record<MediaKind, RegExp>> = {
  video: /\.(?:mp4|m4v|webm|ogv)$/i,
  audio: /\.(?:mp3|m4a|aac|oga|ogg|opus|wav|weba)$/i,
}

/** The address, normalized, if it may be a media file's (https or relative), else null. */
export function safeMediaUrl(value: unknown): string | null {
  return sanitizeUrl(value, { kind: 'media' })
}

/** Video or audio, from an address's file extension (query and fragment ignored). */
export function mediaKindOf(address: string): MediaKind | null {
  const path = address.split(/[?#]/, 1)[0]!
  return EXTENSIONS.video.test(path) ? 'video' : EXTENSIONS.audio.test(path) ? 'audio' : null
}

/** Video or audio, from a file's MIME type (a help for the user: the server checks the real type). */
export function mediaKindOfType(type: string): MediaKind | null {
  return MEDIA_TYPES.video.includes(type)
    ? 'video'
    : MEDIA_TYPES.audio.includes(type)
      ? 'audio'
      : null
}

/** The address of a `<video>`/`<audio>`: its `src`, or its first `<source>` with a valid one. */
function sourceOf(el: DOMLikeElement): string | null {
  const own = safeMediaUrl(el.getAttribute('src'))
  if (own) return own
  const children = el.childNodes
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as DOMLike & Partial<DOMLikeElement>
    if (child.nodeType !== 1 || child.nodeName.toLowerCase() !== 'source') continue
    const src = safeMediaUrl(child.getAttribute?.('src'))
    if (src) return src
  }
  return null
}

function mediaSpec(tag: MediaKind): NodeSpec {
  return {
    group: 'block',
    atom: true,
    attrs: { src: { validate: (v) => safeMediaUrl(v) === v } },
    leafText: (node) => node.attrs['src'] as string,
    parseHTML: [
      {
        tag,
        getAttrs: (el) => {
          const src = sourceOf(el)
          return src ? { src } : false
        },
      },
    ],
    toHTML: (node) => [tag, { src: node.attrs['src'] as string, controls: true }],
  }
}

export const mediaNodes = {
  video_file: mediaSpec('video'),
  audio_file: mediaSpec('audio'),
} satisfies Record<string, NodeSpec>
