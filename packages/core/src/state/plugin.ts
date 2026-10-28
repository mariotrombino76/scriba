import type { EditorState, EditorStateConfig } from './state.js'
import type { Transaction } from './transaction.js'

/**
 * Props a plugin can provide. Other packages (view, ui) extend this interface
 * with declaration merging to add their own props.
 */
export interface PluginProps {
  [prop: string]: unknown
}

/** State slot owned by a plugin, updated on every transaction. */
export interface StateField<T> {
  init(config: EditorStateConfig, state: EditorState): T
  apply(tr: Transaction, value: T, oldState: EditorState, newState: EditorState): T
  toJSON?(value: T): unknown
  fromJSON?(config: EditorStateConfig, json: unknown, state: EditorState): T
}

export interface PluginSpec<T = unknown> {
  key?: PluginKey<T>
  state?: StateField<T>
  props?: PluginProps
  /**
   * Before filtering: may return a transaction to apply instead of `tr`, built
   * from `state.tr` and doing what the user asked as far as allowed (e.g. a mark
   * applied around protected blocks). It inherits `tr`'s metadata and time, and
   * still goes through every `filterTransaction`. Return null to keep `tr`.
   * Only for transactions dispatched from outside (not appended ones).
   */
  rewriteTransaction?(tr: Transaction, state: EditorState): Transaction | null | undefined
  /** Return false to cancel a transaction. */
  filterTransaction?(tr: Transaction, state: EditorState): boolean
  /**
   * Called after transactions are applied; may return a follow-up transaction
   * (e.g. to normalize the document). It is applied right away.
   */
  appendTransaction?(
    transactions: readonly Transaction[],
    oldState: EditorState,
    newState: EditorState,
  ): Transaction | null | undefined
}

const keyCounts = new Map<string, number>()

function createKey(name: string): string {
  const count = keyCounts.get(name) ?? 0
  keyCounts.set(name, count + 1)
  return `${name}$${count || ''}`
}

/** Unique key to find a plugin and read its state. */
export class PluginKey<T = unknown> {
  readonly key: string

  constructor(name = 'key') {
    this.key = createKey(name)
  }

  get(state: EditorState): Plugin<T> | undefined {
    return state.plugins.find((p) => p.key === this.key) as Plugin<T> | undefined
  }

  getState(state: EditorState): T | undefined {
    return state.field(this.key) as T | undefined
  }
}

/** An extension of the editor: state, props and transaction hooks. */
export class Plugin<T = unknown> {
  readonly key: string
  readonly props: PluginProps

  constructor(readonly spec: PluginSpec<T>) {
    this.key = spec.key ? spec.key.key : createKey('plugin')
    this.props = spec.props ?? {}
  }

  getState(state: EditorState): T | undefined {
    return state.field(this.key) as T | undefined
  }
}
