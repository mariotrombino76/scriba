import type { Mark } from '../model/mark.js'
import type { Node, NodeJSON } from '../model/node.js'
import type { Schema } from '../model/schema.js'
import type { Plugin } from './plugin.js'
import { Selection, type SelectionJSON } from './selection.js'
import { Transaction } from './transaction.js'

export interface EditorStateConfig {
  /** Required when `doc` is not given. */
  schema?: Schema
  doc?: Node
  selection?: Selection
  storedMarks?: readonly Mark[] | null
  plugins?: readonly Plugin[]
}

/** Maximum rounds of `appendTransaction`, to stop plugins from looping forever. */
const MAX_APPEND_ROUNDS = 50

/**
 * An immutable snapshot of the editor: document, selection, stored marks and
 * plugin state. Every change goes through `state.apply(tr)` and returns a new state.
 */
export class EditorState {
  private fields = new Map<string, unknown>()

  private constructor(
    readonly schema: Schema,
    readonly doc: Node,
    readonly selection: Selection,
    readonly storedMarks: readonly Mark[] | null,
    readonly plugins: readonly Plugin[],
  ) {}

  static create(config: EditorStateConfig): EditorState {
    const schema = config.doc ? config.doc.type.schema : config.schema
    if (!schema) throw new RangeError('EditorState.create needs a schema or a doc')
    const doc = config.doc ?? schema.topNodeType.createAndFill()
    if (!doc) throw new RangeError('Cannot create an empty document for this schema')
    const plugins = config.plugins ?? []
    const seen = new Set<string>()
    for (const p of plugins) {
      if (seen.has(p.key)) throw new RangeError(`Duplicate plugin key "${p.key}"`)
      seen.add(p.key)
    }
    const state = new EditorState(
      schema,
      doc,
      config.selection ?? Selection.atStart(doc),
      config.storedMarks ?? null,
      plugins,
    )
    for (const p of plugins) {
      if (p.spec.state) state.fields.set(p.key, p.spec.state.init(config, state))
    }
    return state
  }

  /** A new transaction starting from this state. */
  get tr(): Transaction {
    return new Transaction(this)
  }

  /** State value of a plugin, by key. */
  field(key: string): unknown {
    return this.fields.get(key)
  }

  /** Applies a transaction; plugins may filter it or append follow-ups. */
  apply(tr: Transaction): EditorState {
    return this.applyTransaction(tr).state
  }

  applyTransaction(root: Transaction): { state: EditorState; transactions: Transaction[] } {
    root = this.rewrite(root)
    if (!this.filter(root)) return { state: this, transactions: [] }
    const trs = [root]
    let state = this.applyInner(root)
    // Each plugin sees the transactions it has not seen yet.
    const seen: { state: EditorState; n: number }[] = this.plugins.map(() => ({
      state: this,
      n: 0,
    }))
    for (let round = 0; round < MAX_APPEND_ROUNDS; round++) {
      let appended = false
      for (let i = 0; i < state.plugins.length; i++) {
        const plugin = state.plugins[i]!
        const hook = plugin.spec.appendTransaction
        const s = seen[i]!
        if (!hook) continue
        const extra =
          s.n < trs.length ? hook.call(plugin.spec, trs.slice(s.n), s.state, state) : null
        seen[i] = { state, n: trs.length }
        if (extra && state.filter(extra, i)) {
          extra.setMeta('appendedTransaction', root)
          trs.push(extra)
          state = state.applyInner(extra)
          appended = true
        }
      }
      if (!appended) return { state, transactions: trs }
    }
    throw new RangeError('appendTransaction did not settle (plugins keep appending)')
  }

  /** Lets plugins replace a transaction before it is filtered (`rewriteTransaction`). */
  private rewrite(tr: Transaction): Transaction {
    for (const p of this.plugins) {
      const replaced = p.spec.rewriteTransaction?.(tr, this)
      if (!replaced || replaced === tr) continue
      if (replaced.before !== this.doc)
        throw new RangeError('rewriteTransaction must build on the current state')
      tr = replaced.inherit(tr)
    }
    return tr
  }

  private filter(tr: Transaction, ignore = -1): boolean {
    return this.plugins.every(
      (p, i) => i === ignore || !p.spec.filterTransaction || p.spec.filterTransaction(tr, this),
    )
  }

  private applyInner(tr: Transaction): EditorState {
    if (tr.before !== this.doc) throw new RangeError('Applying a mismatched transaction')
    const next = new EditorState(this.schema, tr.doc, tr.selection, tr.storedMarks, this.plugins)
    for (const p of this.plugins) {
      const field = p.spec.state
      if (field) next.fields.set(p.key, field.apply(tr, this.fields.get(p.key), this, next))
    }
    return next
  }

  /** New state with a different plugin set; plugins present in both keep their state. */
  reconfigure(config: { plugins?: readonly Plugin[] }): EditorState {
    const plugins = config.plugins ?? []
    const next = new EditorState(this.schema, this.doc, this.selection, this.storedMarks, plugins)
    for (const p of plugins) {
      if (this.fields.has(p.key)) next.fields.set(p.key, this.fields.get(p.key))
      else if (p.spec.state)
        next.fields.set(p.key, p.spec.state.init({ ...config, schema: this.schema }, next))
    }
    return next
  }

  toJSON(): { doc: NodeJSON; selection: SelectionJSON } {
    return { doc: this.doc.toJSON(), selection: this.selection.toJSON() }
  }

  /** Restores a state from JSON (untrusted: validated against the schema). */
  static fromJSON(
    config: EditorStateConfig & { schema: Schema },
    json: { doc: NodeJSON; selection?: SelectionJSON },
  ): EditorState {
    const doc = config.schema.nodeFromJSON(json.doc)
    const selection = json.selection ? Selection.fromJSON(doc, json.selection) : undefined
    return EditorState.create({ ...config, doc, ...(selection ? { selection } : {}) })
  }
}
