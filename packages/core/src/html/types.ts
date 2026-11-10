import type { Attrs } from '../model/attrs.js'
import type { Mark } from '../model/mark.js'
import type { Node } from '../model/node.js'
import type { StyleDecls } from './css.js'

/**
 * The minimal DOM shape the parser reads. A browser `Node` from an inert
 * document (`DOMParser`, `<template>`) fits as is; on the server an adapter
 * wraps `parse5` nodes (see `@scriba-editor/sanitize-server`).
 */
export interface DOMLike {
  /** 1 = element, 3 = text, 9 = document, 11 = fragment; others are ignored. */
  readonly nodeType: number
  /** Tag name (any case) for elements, e.g. `"P"` or `"p"`. */
  readonly nodeName: string
  /** Text of text nodes. */
  readonly nodeValue: string | null
  readonly childNodes: ArrayLike<DOMLike>
  /** Attribute value (elements only). */
  getAttribute?(name: string): string | null
}

/** Element view passed to parse rules. */
export interface DOMLikeElement extends DOMLike {
  getAttribute(name: string): string | null
}

/** Maps an HTML element to a node or mark type. */
export interface ParseRule {
  /** Lowercase tag name, e.g. `"strong"`. */
  tag: string
  /**
   * Attributes for the node/mark, `null` for none, or `false` when this element
   * does not match after all (e.g. `<b style="font-weight:normal">`).
   */
  getAttrs?: (element: DOMLikeElement) => Record<string, unknown> | null | false
  /** Higher priority rules are tried first. Default 50. */
  priority?: number
}

/**
 * Output description: `[tag, attrs?, ...children]`. A child `0` marks the hole
 * where the node content (or marked text) goes. Strings are escaped text.
 */
export type HTMLSpec = string | readonly [string, ...(HTMLAttrs | HTMLSpec | 0)[]]

/**
 * Output attributes. `style` is never a string: it is an object of typed
 * declarations, validated against the style whitelist (see `css.ts`).
 */
export type HTMLAttrs = Readonly<
  Record<string, string | number | boolean | null | undefined | StyleDecls>
>

export type NodeToHTML = (node: Node) => HTMLSpec
export type MarkToHTML = (mark: Mark) => HTMLSpec

/** Helper type for spec authors. */
export type AttrsFromElement = (element: DOMLikeElement) => Attrs | null | false
