import {
  NodeSelection,
  Plugin,
  PluginKey,
  sanitizeUrl,
  type EditorState,
  type NodeType,
} from '@scriba/core'
import type { MessageKey, Translate } from '@scriba/i18n'
import type { EditorView } from '@scriba/view'

/** What the integrator's upload returns: the public URL, optionally with an alt text. */
export type UploadResult = string | { src: string; alt?: string }

export interface ImageUploadOptions {
  /**
   * Uploads a file and returns its URL. The editor never uploads by itself
   * (§5.6). The server must validate the real type (magic bytes), size and, if
   * needed, scan it: the checks done here only help the user.
   */
  upload?: (file: File) => Promise<UploadResult>
  /** Accepted MIME types (default PNG, JPEG, GIF, WebP; SVG is refused unless you add it, §5.6). */
  accept?: readonly string[]
  /** Maximum size in bytes (default 10 MB). */
  maxSize?: number
}

export const DEFAULT_ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export const DEFAULT_MAX_SIZE = 10 * 1024 * 1024

/** Client-side check (a help for the user, not a protection). Returns an error message key, or null. */
export function validateImageFile(file: File, options: ImageUploadOptions): MessageKey | null {
  const accept = options.accept ?? DEFAULT_ACCEPT
  if (!accept.includes(file.type)) return 'image.error.type'
  if (file.size > (options.maxSize ?? DEFAULT_MAX_SIZE)) return 'image.error.size'
  return null
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/** Pending uploads: their insertion positions follow the edits made meanwhile. */
interface Pending {
  readonly positions: ReadonlyMap<number, number>
}

export const uploadKey = new PluginKey<Pending>('imageUploads')
let uploadIds = 0

/** Plugin state tracking where each pending upload will be inserted. */
export function uploadTracker(): Plugin<Pending> {
  return new Plugin<Pending>({
    key: uploadKey,
    state: {
      init: () => ({ positions: new Map() }),
      apply(tr, value) {
        const meta = tr.getMeta<{ add?: [number, number]; remove?: number }>(uploadKey)
        if (!tr.docChanged && !meta) return value
        const positions = new Map<number, number>()
        for (const [id, pos] of value.positions) positions.set(id, tr.mapping.map(pos))
        if (meta?.add) positions.set(meta.add[0], meta.add[1])
        if (meta?.remove !== undefined) positions.delete(meta.remove)
        return { positions }
      },
    },
  })
}

function imageType(state: EditorState): NodeType {
  const type = state.schema.nodes['image']
  if (!type) throw new RangeError('The schema has no "image" node (add imageNodes)')
  return type
}

/** Screen reader announcements ("Uploading image…", errors) through a polite live region. */
const announcers = new WeakMap<EditorView, HTMLElement>()

export function announce(view: EditorView, message: string): void {
  let region = announcers.get(view)
  if (!region) {
    region = view.document.createElement('div')
    region.className = 'scriba-visually-hidden'
    region.setAttribute('role', 'status')
    region.setAttribute('aria-live', 'polite')
    view.dom.after(region)
    announcers.set(view, region)
  }
  region.textContent = message
}

/**
 * Validates, uploads and inserts images at `pos` (mapped through the edits
 * made while uploading). Returns false when nothing could be uploaded.
 */
export function uploadImages(
  view: EditorView,
  files: readonly File[],
  pos: number,
  options: ImageUploadOptions,
  t: Translate,
): boolean {
  const upload = options.upload
  if (!upload) return false
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) return false
  for (const file of images) {
    const error = validateImageFile(file, options)
    if (error) {
      announce(view, t(error, { max: formatSize(options.maxSize ?? DEFAULT_MAX_SIZE) }))
      continue
    }
    const id = ++uploadIds
    view.dispatch(view.state.tr.setMeta(uploadKey, { add: [id, pos] }))
    announce(view, t('image.uploading'))
    upload(file).then(
      (result) => finishUpload(view, id, result, t),
      () => {
        view.dispatch(view.state.tr.setMeta(uploadKey, { remove: id }))
        announce(view, t('image.error.upload'))
      },
    )
  }
  return true
}

function finishUpload(view: EditorView, id: number, result: UploadResult, t: Translate): void {
  const state = view.state
  const at = uploadKey.getState(state)?.positions.get(id)
  const tr = state.tr.setMeta(uploadKey, { remove: id })
  const src = sanitizeUrl(typeof result === 'string' ? result : result.src, { kind: 'image' })
  if (at === undefined || !src) {
    view.dispatch(tr)
    announce(view, t('image.error.upload'))
    return
  }
  // without a text the image stays "to describe" (no `alt`): the accessibility checker asks for it
  const alt = typeof result === 'string' ? null : result.alt?.trim() || null
  const node = imageType(state).create({ src, alt })
  const pos = Math.min(at, tr.doc.content.size)
  if (!tr.doc.resolve(pos).parent.type.canContain(node.type)) {
    view.dispatch(tr)
    announce(view, t('image.error.upload'))
    return
  }
  tr.insert(pos, node)
  tr.setSelection(NodeSelection.create(tr.doc, pos))
  view.dispatch(tr)
  announce(view, t('image.uploaded'))
}
