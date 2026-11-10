import type { Translate } from '@scriba-editor/i18n'

/** True on Apple platforms, where `Mod` is ⌘. */
export function isMac(): boolean {
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
  return !!nav && /Mac|iP(hone|[oa]d)/.test(nav.platform ?? nav.userAgent ?? '')
}

/**
 * Human-readable form of a key binding for tooltips:
 * `"Shift-Mod-z"` → `"Ctrl+Maiusc+Z"` (it) or `"⇧⌘Z"` (mac).
 */
export function formatShortcut(binding: string, t: Translate, mac = isMac()): string {
  const parts = binding.split(/-(?!$)/)
  const key = parts.pop()!
  const names: string[] = []
  // Windows/Linux convention: Ctrl+Alt+Shift+key; macOS: ⌥⇧⌘key.
  const order = mac ? ['Alt', 'Shift', 'Mod'] : ['Mod', 'Alt', 'Shift']
  const mods = parts.map((p) =>
    /^(cmd|meta|mod)$/i.test(p) ? 'Mod' : p[0]!.toUpperCase() + p.slice(1).toLowerCase(),
  )
  for (const mod of order.filter((m) => mods.includes(m))) {
    if (mod === 'Mod') names.push(t(mac ? 'key.modMac' : 'key.mod'))
    if (mod === 'Alt') names.push(t(mac ? 'key.altMac' : 'key.alt'))
    if (mod === 'Shift') names.push(t(mac ? 'key.shiftMac' : 'key.shift'))
  }
  names.push(
    key === 'Enter'
      ? t('key.enter')
      : key === ' '
        ? t('key.space')
        : key.length === 1
          ? key.toUpperCase()
          : key,
  )
  return names.join(mac ? '' : '+')
}

/** A key binding (`Mod-Shift-z`) in the `aria-keyshortcuts` format (`Control+Shift+Z`). */
export function ariaShortcut(binding: string, mac: boolean): string {
  const parts = binding.split(/-(?!$)/)
  const key = parts.pop()!
  const mods = parts.map((p) => (/^mod$/i.test(p) ? (mac ? 'Meta' : 'Control') : p))
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+')
}
