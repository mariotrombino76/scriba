import type { Command, CommandView } from './commands/base.js'
import { Plugin } from './state/plugin.js'
import type { EditorState } from './state/state.js'
import { isAnnotationOnly } from './state/annotation.js'
import type { Transaction } from './state/transaction.js'

/** The parts of a keyboard event a keymap needs (a DOM `KeyboardEvent` fits). */
export interface KeyInput {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export type KeyBindings = Record<string, Command>

export interface KeymapOptions {
  /** Higher runs first. Default 0; ties keep plugin order. */
  priority?: number
  /** Whether `Mod` means Cmd (mac) or Ctrl. Detected from `navigator` when omitted. */
  mac?: boolean
  /**
   * Also active when the editor is read-only (find, full screen…). Only for
   * bindings that never change the document: in read-only mode transactions
   * changing it are dropped anyway.
   */
  readOnly?: boolean
}

export interface KeymapProps {
  keymapPriority: number
  keymapReadOnly?: boolean
  handleKey(
    state: EditorState,
    dispatch: ((tr: Transaction) => void) | undefined,
    input: KeyInput,
    view?: CommandView,
  ): boolean
}

function detectMac(): boolean {
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
  return !!nav && /Mac|iP(hone|[oa]d)/.test(nav.platform ?? nav.userAgent ?? '')
}

/**
 * Canonical form of a binding: modifiers in the order Alt-Ctrl-Meta-Shift,
 * then the key. `Mod` becomes `Meta` on mac and `Ctrl` elsewhere.
 * Example: `"Shift-Mod-z"` → `"Ctrl-Shift-z"` (not mac).
 */
export function normalizeKeyName(name: string, mac: boolean): string {
  const parts = name.split(/-(?!$)/)
  let key = parts.pop()!
  if (key === 'Space') key = ' '
  const mods = new Set<string>()
  for (const raw of parts) {
    const mod = /^(cmd|meta|m)$/i.test(raw)
      ? 'Meta'
      : /^a(lt)?$/i.test(raw)
        ? 'Alt'
        : /^(c|ctrl|control)$/i.test(raw)
          ? 'Ctrl'
          : /^s(hift)?$/i.test(raw)
            ? 'Shift'
            : /^mod$/i.test(raw)
              ? mac
                ? 'Meta'
                : 'Ctrl'
              : null
    if (!mod) throw new RangeError(`Unrecognized modifier "${raw}" in key binding "${name}"`)
    mods.add(mod)
  }
  return keyWithMods(key.length === 1 ? key.toLowerCase() : key, mods)
}

function keyWithMods(key: string, mods: Set<string>): string {
  return (
    ['Alt', 'Ctrl', 'Meta', 'Shift']
      .filter((m) => mods.has(m))
      .map((m) => m + '-')
      .join('') + key
  )
}

/** Canonical name of a key event, matching `normalizeKeyName`. */
export function keyInputName(input: KeyInput): string {
  const mods = new Set<string>()
  if (input.altKey) mods.add('Alt')
  if (input.ctrlKey) mods.add('Ctrl')
  if (input.metaKey) mods.add('Meta')
  if (input.shiftKey) mods.add('Shift')
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key
  return keyWithMods(key, mods)
}

/** A plugin that runs commands for key bindings like `"Mod-b"`, `"Shift-Enter"`, `"Backspace"`. */
export function keymap(bindings: KeyBindings, options: KeymapOptions = {}): Plugin {
  const mac = options.mac ?? detectMac()
  const map = new Map<string, Command>()
  for (const [name, cmd] of Object.entries(bindings)) map.set(normalizeKeyName(name, mac), cmd)
  const props: KeymapProps = {
    keymapPriority: options.priority ?? 0,
    keymapReadOnly: options.readOnly ?? false,
    handleKey: (state, dispatch, input, view) => {
      const cmd = map.get(keyInputName(input))
      return !!cmd && cmd(state, dispatch, view)
    },
  }
  return new Plugin({ props: { ...props } })
}

export interface RunKeymapsOptions {
  /**
   * The editor is read-only: only keymaps created with `readOnly: true` run,
   * and transactions changing the document are dropped.
   */
  readOnly?: boolean
  /** Read-only but allowed to comment: annotation-only transactions go through. */
  canAnnotate?: boolean
}

/** Runs the keymaps of all plugins, highest priority first. Returns true if one handled the key. */
export function runKeymaps(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  input: KeyInput,
  view?: CommandView,
  options: RunKeymapsOptions = {},
): boolean {
  const readOnly = !!options.readOnly
  const keymaps = state.plugins
    .map((p, i) => ({ props: p.props as Partial<KeymapProps>, i }))
    .filter((k) => typeof k.props.handleKey === 'function')
    .filter((k) => !readOnly || k.props.keymapReadOnly === true)
    .sort((a, b) => (b.props.keymapPriority ?? 0) - (a.props.keymapPriority ?? 0) || a.i - b.i)
  const allowed = (tr: Transaction) =>
    !tr.docChanged || (!!options.canAnnotate && isAnnotationOnly(tr))
  const send =
    readOnly && dispatch ? (tr: Transaction) => void (allowed(tr) && dispatch(tr)) : dispatch
  return keymaps.some((k) => k.props.handleKey!(state, send, input, view))
}
