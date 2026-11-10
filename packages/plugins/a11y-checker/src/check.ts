import { normalizeColor, type Node } from '@scriba-editor/core'
import type { ResolvedOptions, Rule } from './rule.js'
import { embedRules, defaultGenericLinkTexts, imageRules, linkRules } from './rules-content.js'
import { headingRules, listRules, tableRules } from './rules-structure.js'
import { visualRules } from './rules-visual.js'
import type { A11yIssue, A11yOptions, A11yTarget } from './types.js'
import { withinLevel } from './util.js'

/** All checks, in the order their issues are listed at the same position. */
const RULES: readonly Rule[] = [
  ...imageRules,
  ...linkRules,
  ...headingRules,
  ...listRules,
  ...tableRules,
  ...embedRules,
  ...visualRules,
]

export function resolveOptions(options: A11yOptions = {}): ResolvedOptions {
  const color = (value: string | undefined, fallback: string) => {
    const normalized = value === undefined ? fallback : normalizeColor(value)
    if (!normalized) throw new RangeError(`Not a color: ${value}`)
    return normalized
  }
  const maxAltLength = options.maxAltLength ?? 150
  if (!Number.isInteger(maxAltLength) || maxAltLength < 1)
    throw new RangeError('maxAltLength must be a positive integer')
  return {
    level: options.level ?? 'AA',
    background: color(options.background, '#ffffff'),
    color: color(options.color, '#000000'),
    genericLinkTexts: defaultGenericLinkTexts(options.genericLinkTexts),
    maxAltLength,
  }
}

/** Where an issue starts (its position in the document). */
export const targetStart = (target: A11yTarget) =>
  target.kind === 'node' ? target.pos : target.from

/**
 * Checks a document (TinyMCE's accessibility checker): returns the issues in
 * document order. Pure, without DOM: usable on the server, or to stop saving
 * a document with errors.
 */
export function checkAccessibility(doc: Node, options: A11yOptions = {}): A11yIssue[] {
  const resolved = resolveOptions(options)
  const issues: { issue: A11yIssue; order: number }[] = []
  RULES.forEach((rule, order) => {
    if (options.rules?.[rule.id] === false) return
    rule.run({
      doc,
      options: resolved,
      report: (issue) => {
        if (withinLevel(issue.criterion, resolved.level)) issues.push({ issue, order })
      },
    })
  })
  return issues
    .sort((a, b) => targetStart(a.issue.target) - targetStart(b.issue.target) || a.order - b.order)
    .map((i) => i.issue)
}
