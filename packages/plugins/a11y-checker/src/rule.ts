import type { Node } from '@scriba-editor/core'
import type { A11yIssue, A11yLevel, A11yRuleId } from './types.js'

/** Options with their defaults filled in. */
export interface ResolvedOptions {
  readonly level: A11yLevel
  readonly background: string
  readonly color: string
  readonly genericLinkTexts: ReadonlySet<string>
  readonly maxAltLength: number
}

export interface RuleContext {
  readonly doc: Node
  readonly options: ResolvedOptions
  readonly report: (issue: A11yIssue) => void
}

/** A check: walks the document and reports what it finds. */
export interface Rule {
  readonly id: A11yRuleId
  readonly run: (ctx: RuleContext) => void
}
