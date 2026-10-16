import { AddMarkStep, RemoveMarkStep } from '../transform/mark-step.js'
import type { Transaction } from './transaction.js'

/**
 * Whether a transaction only adds or removes annotation marks (marks with
 * `annotation: true`, e.g. comment anchors): the content stays the same.
 * Such changes are allowed to people who may comment but not edit.
 */
export function isAnnotationOnly(tr: Transaction): boolean {
  if (!tr.docChanged) return false
  return tr.steps.every(
    (step) =>
      (step instanceof AddMarkStep || step instanceof RemoveMarkStep) &&
      step.mark.type.spec.annotation === true,
  )
}
