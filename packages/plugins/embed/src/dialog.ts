import type { MessageKey, Translate } from '@scriba/i18n'
import { openDialog } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import { insertEmbed, selectedEmbed } from './commands.js'
import {
  cleanEmbedTitle,
  MAX_EMBED_HEIGHT,
  MAX_EMBED_TITLE,
  MAX_EMBED_WIDTH,
  MIN_EMBED_HEIGHT,
  MIN_EMBED_WIDTH,
} from './nodes.js'
import { pageUrl, videoFromAddress, type EmbedProvider } from './providers.js'

/** Dialog to insert a video, or change the selected one: address, title, size. */
export function openEmbedDialog(view: EditorView, t: Translate): void {
  const editing = selectedEmbed(view.state)
  const attrs = editing?.node.attrs
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
        attrs
          ? pageUrl({
              provider: attrs['provider'] as EmbedProvider,
              id: attrs['videoId'] as string,
            })
          : '',
      )
      address.spellcheck = false
      address.placeholder = 'https://www.youtube.com/watch?v=…'
      const title = input('text', (attrs?.['title'] as string | undefined) ?? '')
      title.maxLength = MAX_EMBED_TITLE
      const width = input('number', String(attrs?.['width'] ?? 560))
      width.min = String(MIN_EMBED_WIDTH)
      width.max = String(MAX_EMBED_WIDTH)
      const height = input('number', String(attrs?.['height'] ?? 315))
      height.min = String(MIN_EMBED_HEIGHT)
      height.max = String(MAX_EMBED_HEIGHT)
      const hint = doc.createElement('p')
      hint.className = 'scriba-dialog-hint'
      hint.textContent = t('embed.hint')
      const error = doc.createElement('p')
      error.className = 'scriba-dialog-error'
      error.setAttribute('role', 'alert')
      const sizes = doc.createElement('div')
      sizes.className = 'scriba-dialog-row'
      sizes.append(field('embed.width', width), field('embed.height', height))

      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const cancel = doc.createElement('button')
      cancel.type = 'button'
      cancel.textContent = t('embed.cancel')
      cancel.addEventListener('click', () => handle.close())
      const save = doc.createElement('button')
      save.type = 'submit'
      save.textContent = t(editing ? 'embed.save' : 'embed.insert')
      actions.append(cancel, save)

      const fail = (key: MessageKey, el: HTMLInputElement) => {
        error.textContent = t(key)
        el.setAttribute('aria-invalid', 'true')
        el.focus()
      }
      const clamp = (el: HTMLInputElement, min: number, max: number, fallback: number) => {
        const n = Math.round(Number(el.value))
        return Number.isFinite(n) && el.value.trim() ? Math.min(max, Math.max(min, n)) : fallback
      }
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        for (const el of [address, width, height]) el.removeAttribute('aria-invalid')
        const video = videoFromAddress(address.value)
        if (!video) return fail('embed.invalid', address)
        const ok = insertEmbed({
          provider: video.provider,
          videoId: video.id,
          title: cleanEmbedTitle(title.value),
          width: clamp(width, MIN_EMBED_WIDTH, MAX_EMBED_WIDTH, 560),
          height: clamp(height, MIN_EMBED_HEIGHT, MAX_EMBED_HEIGHT, 315),
        })(view.state, (tr) => view.dispatch(tr))
        if (!ok) return fail('embed.invalid', address)
        handle.close()
      })
      form.append(
        field('embed.address', address),
        hint,
        field('embed.name', title),
        sizes,
        error,
        actions,
      )
      address.focus()
    },
  })
}
