import type { Command, CommandView, KeyBindings } from '@scriba/core'
import type { ToolbarButton } from '@scriba/ui'

export const FULLSCREEN_META = 'fullscreen'

interface FocusableView extends CommandView {
  focus?(): void
}

/**
 * Fullscreen mode for an editor container (toolbar + editing area + status
 * bar): the container covers the window and the page behind stops scrolling.
 * Pure CSS classes (`scriba-fullscreen` on the container,
 * `scriba-fullscreen-open` on <html>), so it works under a strict CSP and
 * without the browser Fullscreen API (no permission prompts, works in iframes).
 */
export class Fullscreen {
  private on = false
  private scrollY = 0

  constructor(readonly target: HTMLElement) {}

  get active(): boolean {
    return this.on
  }

  /** Switches fullscreen (or sets it); the editor keeps focus. */
  toggle(view: FocusableView, on = !this.on): void {
    if (on === this.on) return
    const doc = this.target.ownerDocument
    const win = doc.defaultView
    if (on) this.scrollY = win?.scrollY ?? 0
    this.on = on
    this.target.classList.toggle('scriba-fullscreen', on)
    doc.documentElement.classList.toggle('scriba-fullscreen-open', on)
    if (!on) win?.scrollTo(0, this.scrollY)
    // an empty transaction refreshes the toolbar (pressed state)
    view.dispatch(view.state.tr.setMeta(FULLSCREEN_META, on))
    view.focus?.()
  }
}

/** Ctrl/Cmd+Shift+F switches fullscreen; Escape leaves it. */
export function fullscreenKeymap(fs: Fullscreen): KeyBindings {
  const toggle: Command = (_state, dispatch, view) => {
    if (!view) return false
    if (dispatch) fs.toggle(view)
    return true
  }
  const leave: Command = (_state, dispatch, view) => {
    if (!view || !fs.active) return false
    if (dispatch) fs.toggle(view, false)
    return true
  }
  return { 'Mod-Shift-f': toggle, Escape: leave }
}

/** Toggle button (`aria-pressed`). */
export function fullscreenToolbarItem(fs: Fullscreen): ToolbarButton {
  return {
    type: 'button',
    id: 'fullscreen',
    icon: 'fullscreen',
    label: (t) => t('fullscreen.label'),
    shortcut: 'Mod-Shift-f',
    command: () => true,
    isActive: () => fs.active,
    run: (view) => fs.toggle(view),
  }
}
