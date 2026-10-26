import type { MessageKey, Translate } from '@scriba/i18n'
import { openDialog } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import { insertEmbed, insertMediaFile, selectedMedia } from './commands.js'
import { MEDIA_TYPES, mediaKindOf, mediaKindOfType, safeMediaUrl, type MediaKind } from './media.js'
import {
  cleanEmbedTitle,
  MAX_EMBED_HEIGHT,
  MAX_EMBED_TITLE,
  MAX_EMBED_WIDTH,
  MIN_EMBED_HEIGHT,
  MIN_EMBED_WIDTH,
} from './nodes.js'
import { defaultSize, embedFromAddress, pageUrl, type EmbedProvider } from './providers.js'

export interface MediaOptions {
  /**
   * Uploads a video or audio file and returns its URL (https or relative).
   * Without it, files can only be linked by address. The editor never uploads
   * by itself; your server must check the real type, the size and the content.
   */
  upload?: (file: File) => Promise<string>
  /** Largest file offered for upload, in bytes (a help for the user). Default 100 MB. */
  maxSize?: number
}

export const DEFAULT_MEDIA_MAX_SIZE = 100 * 1024 * 1024

/**
 * The Media dialog (TinyMCE's media): an address (a link of an approved
 * service becomes an embedded player, the address of a video or audio file a
 * player of that file), or a file to upload. Also changes the selected media.
 */
export function openMediaDialog(view: EditorView, t: Translate, options: MediaOptions = {}): void {
  const editing = selectedMedia(view.state)
  const attrs = editing?.node.attrs
  const isEmbed = editing?.node.type.name === 'embed'
  openDialog(view.document, {
    title: t(editing ? 'embed.editTitle' : 'embed.insertTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const doc = view.document
      const field = (key: MessageKey, input: HTMLInputElement) => {
        const label = doc.createElement('label')
        label.append(t(key), input)
        return label
      }
      const input = (type: 'text' | 'number', value: string) => {
        const el = doc.createElement('input')
        el.type = type
        el.value = value
        el.setAttribute('autocomplete', 'off')
        return el
      }
      const address = input(
        'text',
        !attrs
          ? ''
          : isEmbed
            ? pageUrl({ provider: attrs['provider'] as EmbedProvider, ref: attrs['ref'] as string })
            : (attrs['src'] as string),
      )
      address.spellcheck = false
      address.placeholder = 'https://www.youtube.com/watch?v=…'
      const title = input('text', (isEmbed && (attrs?.['title'] as string)) || '')
      title.maxLength = MAX_EMBED_TITLE
      // empty: the service's usual size (a map is larger than a video, a song lower)
      const width = input('number', isEmbed ? String(attrs!['width']) : '')
      width.min = String(MIN_EMBED_WIDTH)
      width.max = String(MAX_EMBED_WIDTH)
      const height = input('number', isEmbed ? String(attrs!['height']) : '')
      height.min = String(MIN_EMBED_HEIGHT)
      height.max = String(MAX_EMBED_HEIGHT)
      const hint = doc.createElement('p')
      hint.className = 'scriba-dialog-hint'
      hint.textContent = t('embed.hint')
      const error = doc.createElement('p')
      error.className = 'scriba-dialog-error'
      error.setAttribute('role', 'alert')
      const status = doc.createElement('p')
      status.className = 'scriba-dialog-hint'
      status.setAttribute('role', 'status')

      // title and size belong to embedded players only (a file is shown as it is)
      const playerFields = doc.createElement('div')
      const sizes = doc.createElement('div')
      sizes.className = 'scriba-dialog-row'
      sizes.append(field('embed.width', width), field('embed.height', height))
      playerFields.append(field('embed.name', title), sizes)
      const syncFields = () => {
        playerFields.hidden = !!mediaKindOf(address.value.trim())
      }
      address.addEventListener('input', syncFields)
      syncFields()

      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const button = (key: MessageKey, type: 'button' | 'submit') => {
        const b = doc.createElement('button')
        b.type = type
        b.textContent = t(key)
        return b
      }
      const cancel = button('embed.cancel', 'button')
      cancel.addEventListener('click', () => handle.close())
      const save = button(editing ? 'embed.save' : 'embed.insert', 'submit')
      actions.append(cancel, save)

      const fail = (key: MessageKey, el?: HTMLElement) => {
        status.textContent = ''
        error.textContent = t(key)
        el?.setAttribute('aria-invalid', 'true')
        el?.focus()
      }
      const clamp = (el: HTMLInputElement, min: number, max: number, fallback: number) => {
        const n = Math.round(Number(el.value))
        return Number.isFinite(n) && el.value.trim() ? Math.min(max, Math.max(min, n)) : fallback
      }
      const insertFile = (kind: MediaKind, src: string) =>
        insertMediaFile(kind, src)(view.state, (tr) => view.dispatch(tr), view)

      form.addEventListener('submit', (e) => {
        e.preventDefault()
        for (const el of [address, width, height]) el.removeAttribute('aria-invalid')
        const value = address.value.trim()
        const embed = embedFromAddress(value)
        if (embed) {
          const size = defaultSize(embed.provider)
          const ok = insertEmbed({
            provider: embed.provider,
            ref: embed.ref,
            title: cleanEmbedTitle(title.value),
            width: clamp(width, MIN_EMBED_WIDTH, MAX_EMBED_WIDTH, size.width),
            height: clamp(height, MIN_EMBED_HEIGHT, MAX_EMBED_HEIGHT, size.height),
          })(view.state, (tr) => view.dispatch(tr), view)
          if (!ok) return fail('embed.invalid', address)
          return handle.close()
        }
        const kind = mediaKindOf(value)
        const src = kind && safeMediaUrl(value)
        if (!kind || !src || !insertFile(kind, src)) return fail('embed.invalid', address)
        handle.close()
      })

      const parts: HTMLElement[] = [field('embed.address', address), hint]
      if (options.upload) {
        const upload = options.upload
        const fileInput = doc.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = [...MEDIA_TYPES.video, ...MEDIA_TYPES.audio].join(',')
        fileInput.className = 'scriba-visually-hidden'
        fileInput.tabIndex = -1
        fileInput.setAttribute('aria-hidden', 'true')
        const choose = button('media.upload', 'button')
        choose.className = 'scriba-file-button'
        choose.addEventListener('click', () => fileInput.click())
        fileInput.addEventListener('change', () => {
          const file = fileInput.files?.[0]
          if (!file) return
          const kind = mediaKindOfType(file.type)
          if (!kind) return fail('media.error.type', choose)
          if (file.size > (options.maxSize ?? DEFAULT_MEDIA_MAX_SIZE))
            return fail('media.error.size', choose)
          error.textContent = ''
          status.textContent = t('media.uploading', { name: file.name })
          for (const b of [choose, save]) b.disabled = true
          upload(file)
            .then((url) => {
              const src = safeMediaUrl(url)
              if (!src || !insertFile(kind, src)) throw new Error('unsafe or refused address')
              handle.close()
            })
            .catch(() => fail('media.error.upload', choose))
            .finally(() => {
              for (const b of [choose, save]) b.disabled = false
            })
        })
        parts.push(choose, fileInput)
      }
      form.append(...parts, playerFields, status, error, actions)
      address.focus()
    },
  })
}
