/** Space between the toolbar and the text, in pixels. */
const GAP = 4

/** Where the inline toolbar ended up (for tests and custom styling). */
export type InlinePlacement = 'above' | 'below' | 'docked'

export interface InlineToolbarHandle {
  /** Recomputes the position (e.g. after the page layout changed). */
  update(): void
  destroy(): void
}

/**
 * Inline mode (TinyMCE's `inline: true`): the editing area takes the page's
 * own styles and the toolbar appears only while the editor has the focus,
 * floating above the area; below it when there is no room above; docked at
 * the top of the window when the area is taller than the visible part and
 * its top has scrolled away. "In sight" means the visual viewport: on phones
 * the on-screen keyboard and the zoom leave only part of the window visible.
 * `container` holds both the toolbar and the
 * editing area (the toolbar first, as in the page order).
 * Alt+F10 from the text moves the focus into the toolbar (as in TinyMCE);
 * Escape there goes back to the text. Positions are set through CSSOM (strict CSP).
 */
export function inlineToolbar(container: HTMLElement, toolbar: HTMLElement): InlineToolbarHandle {
  const doc = container.ownerDocument
  const win = doc.defaultView
  container.classList.add('scriba-inline')
  toolbar.classList.add('scriba-inline-toolbar')
  toolbar.hidden = true
  let frame = 0

  const place = () => {
    if (toolbar.hidden || !win) return
    const area = container.getBoundingClientRect()
    const height = toolbar.offsetHeight
    // the part of the window really in sight: on phones the on-screen keyboard
    // and the zoom shrink it (the visual viewport), fixed elements do not follow
    const visual = win.visualViewport
    const top = visual?.offsetTop ?? 0
    const bottom = visual ? visual.offsetTop + visual.height : win.innerHeight
    let placement: InlinePlacement
    if (area.top >= top + height + GAP) placement = 'above'
    else if (area.top >= top && bottom - area.bottom >= height + GAP) placement = 'below'
    else placement = 'docked'
    toolbar.dataset['placement'] = placement
    toolbar.style.width = `${Math.round(area.width)}px`
    if (placement === 'docked') {
      toolbar.style.position = 'fixed'
      toolbar.style.top = `${Math.round(top)}px`
      toolbar.style.left = `${Math.round(area.left)}px`
    } else {
      toolbar.style.position = 'absolute'
      toolbar.style.left = '0px'
      toolbar.style.top =
        placement === 'above' ? `${-height - GAP}px` : `${Math.round(area.height) + GAP}px`
    }
  }
  const schedule = () => {
    if (!frame && win) frame = win.requestAnimationFrame(() => ((frame = 0), place()))
  }

  const show = () => {
    if (!toolbar.hidden) return
    toolbar.hidden = false
    place()
  }
  const hide = () => {
    toolbar.hidden = true
  }
  // the focus may move to the toolbar, one of its menus or back to the text: wait for it to land
  const onFocusOut = () =>
    queueMicrotask(() => {
      const active = doc.activeElement
      if (!active || !container.contains(active)) hide()
    })

  const onKeyDown = (event: KeyboardEvent) => {
    // a bubble menu shown over the selection takes Alt+F10 first
    if (event.defaultPrevented || event.key !== 'F10' || !event.altKey) return
    if (toolbar.contains(event.target as globalThis.Node)) return
    const target =
      toolbar.querySelector<HTMLElement>('[tabindex="0"]') ??
      toolbar.querySelector<HTMLElement>('button:not([disabled])')
    if (!target) return
    event.preventDefault()
    show()
    target.focus()
  }

  container.addEventListener('keydown', onKeyDown)
  container.addEventListener('focusin', show)
  container.addEventListener('focusout', onFocusOut)
  win?.addEventListener('scroll', schedule, true)
  win?.addEventListener('resize', schedule)
  win?.visualViewport?.addEventListener('scroll', schedule)
  win?.visualViewport?.addEventListener('resize', schedule)
  const observer = win && 'ResizeObserver' in win ? new win.ResizeObserver(schedule) : null
  observer?.observe(container)
  if (container.contains(doc.activeElement)) show()

  return {
    update: place,
    destroy() {
      container.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('focusin', show)
      container.removeEventListener('focusout', onFocusOut)
      win?.removeEventListener('scroll', schedule, true)
      win?.removeEventListener('resize', schedule)
      win?.visualViewport?.removeEventListener('scroll', schedule)
      win?.visualViewport?.removeEventListener('resize', schedule)
      observer?.disconnect()
      if (frame) win?.cancelAnimationFrame(frame)
      container.classList.remove('scriba-inline')
      toolbar.classList.remove('scriba-inline-toolbar')
      toolbar.hidden = false
      for (const prop of ['position', 'top', 'left', 'width'] as const) toolbar.style[prop] = ''
    },
  }
}
