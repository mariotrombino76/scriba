import type { Attrs } from '../model/attrs.js'
import { Fragment } from '../model/fragment.js'
import type { Node } from '../model/node.js'
import type { NodeType } from '../model/schema.js'
import { Slice } from '../model/slice.js'
import { StepMap, type Mappable } from './map.js'
import { posField, Step, StepResult, type StepJSON } from './step.js'

/** Replaces the node at `pos` with the same content under new markup. Positions inside are kept. */
function changeMarkup(doc: Node, pos: number, make: (node: Node) => Node): StepResult {
  const node = pos < doc.content.size ? doc.nodeAt(pos) : null
  if (!node || node.isText) return StepResult.fail(`No node at position ${pos}`)
  let updated: Node
  try {
    updated = make(node)
  } catch (e) {
    return StepResult.fail(e instanceof Error ? e.message : String(e))
  }
  return StepResult.fromReplace(
    doc,
    pos,
    pos + node.nodeSize,
    new Slice(Fragment.from(updated), 0, 0),
  )
}

function mapPos(mapping: Mappable, pos: number): number | null {
  const r = mapping.mapResult(pos, 1)
  return r.deletedAfter ? null : r.pos
}

/** Sets all attributes of the node at `pos` (validated against its type). */
export class SetAttrsStep extends Step {
  constructor(
    readonly pos: number,
    readonly attrs: Attrs,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    return changeMarkup(doc, this.pos, (node) =>
      node.type.create(this.attrs, node.content, node.marks),
    )
  }

  getMap(): StepMap {
    return StepMap.empty
  }

  invert(doc: Node): Step {
    return new SetAttrsStep(this.pos, doc.nodeAt(this.pos)!.attrs)
  }

  map(mapping: Mappable): Step | null {
    const pos = mapPos(mapping, this.pos)
    return pos === null ? null : new SetAttrsStep(pos, this.attrs)
  }

  toJSON(): StepJSON {
    return { stepType: 'setAttrs', pos: this.pos, attrs: { ...this.attrs } }
  }
}

/**
 * Changes the type (and attributes) of the block at `pos`, keeping its content,
 * e.g. paragraph → heading. Fails if the content is not valid for the new type.
 */
export class SetNodeTypeStep extends Step {
  constructor(
    readonly pos: number,
    readonly type: NodeType,
    readonly attrs: Attrs | null,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    return changeMarkup(doc, this.pos, (node) =>
      this.type.createChecked(this.attrs, node.content, node.marks),
    )
  }

  getMap(): StepMap {
    return StepMap.empty
  }

  invert(doc: Node): Step {
    const node = doc.nodeAt(this.pos)!
    return new SetNodeTypeStep(this.pos, node.type, node.attrs)
  }

  map(mapping: Mappable): Step | null {
    const pos = mapPos(mapping, this.pos)
    return pos === null ? null : new SetNodeTypeStep(pos, this.type, this.attrs)
  }

  toJSON(): StepJSON {
    const json: StepJSON = { stepType: 'setNodeType', pos: this.pos, type: this.type.name }
    if (this.attrs) json['attrs'] = { ...this.attrs }
    return json
  }
}

function readAttrs(json: StepJSON): Record<string, unknown> | null {
  const attrs = json['attrs']
  if (attrs === undefined) return null
  if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) {
    throw new RangeError('Invalid attrs in step JSON')
  }
  return attrs as Record<string, unknown>
}

Step.register(
  'setAttrs',
  (_schema, json) => new SetAttrsStep(posField(json, 'pos'), readAttrs(json) ?? {}),
)

Step.register('setNodeType', (schema, json) => {
  if (typeof json['type'] !== 'string') throw new RangeError('Invalid type in step JSON')
  return new SetNodeTypeStep(posField(json, 'pos'), schema.nodeType(json['type']), readAttrs(json))
})
