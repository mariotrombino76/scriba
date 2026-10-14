import type { Node } from '../model/node.js'
import type { Schema } from '../model/schema.js'
import { ReplaceError } from '../model/replace.js'
import type { Slice } from '../model/slice.js'
import { StepMap, type Mappable } from './map.js'

/** JSON form of a step. `stepType` selects the class. */
export interface StepJSON {
  stepType: string
  [key: string]: unknown
}

/** Outcome of applying a step: a new document, or a failure message. */
export class StepResult {
  private constructor(
    readonly doc: Node | null,
    readonly failed: string | null,
  ) {}

  static ok(doc: Node): StepResult {
    return new StepResult(doc, null)
  }

  static fail(message: string): StepResult {
    return new StepResult(null, message)
  }

  /** Runs a replace and converts schema violations into a failed result. */
  static fromReplace(doc: Node, from: number, to: number, slice: Slice): StepResult {
    try {
      return StepResult.ok(doc.replace(from, to, slice))
    } catch (e) {
      if (e instanceof ReplaceError) return StepResult.fail(e.message)
      throw e
    }
  }
}

type StepFromJSON = (schema: Schema, json: StepJSON) => Step
const registry = new Map<string, StepFromJSON>()

/**
 * An atomic, invertible document change. Steps are the unit of undo/redo
 * and of collaboration: they can be serialized, inverted and rebased.
 */
export abstract class Step {
  /** Applies the step. Never throws for schema violations: returns a failed result. */
  abstract apply(doc: Node): StepResult
  /** How positions move through this step. */
  abstract getMap(): StepMap
  /** The step that undoes this one, given the document before it. */
  abstract invert(doc: Node): Step
  /** This step adjusted to a changed document; null when its target was deleted. */
  abstract map(mapping: Mappable): Step | null
  abstract toJSON(): StepJSON

  /** Merges with a following step into one (used to group typing). */
  merge(_other: Step): Step | null {
    return null
  }

  /** Registers a step class for `Step.fromJSON`. */
  static register(stepType: string, fromJSON: StepFromJSON): void {
    if (registry.has(stepType)) throw new RangeError(`Duplicate step type "${stepType}"`)
    registry.set(stepType, fromJSON)
  }

  /** Deserializes a step. JSON is untrusted: shapes are validated. */
  static fromJSON(schema: Schema, json: StepJSON): Step {
    if (!json || typeof json !== 'object' || typeof json.stepType !== 'string') {
      throw new RangeError('Invalid step JSON')
    }
    const read = registry.get(json.stepType)
    if (!read) throw new RangeError(`Unknown step type "${json.stepType}"`)
    return read(schema, json)
  }
}

/** Validates a non-negative integer field of step JSON. */
export function posField(json: StepJSON, name: string): number {
  const value = json[name]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid "${name}" in step JSON`)
  }
  return value
}
