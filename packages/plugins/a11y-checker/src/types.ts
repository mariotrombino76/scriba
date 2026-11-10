import type { Command } from '@scriba-editor/core'

/** How serious an issue is: errors fail WCAG, warnings probably do, hints are advice. */
export type A11ySeverity = 'error' | 'warning' | 'info'

/** WCAG conformance level the document is checked against (TinyMCE's `a11ychecker_level`). */
export type A11yLevel = 'A' | 'AA' | 'AAA'

export const A11Y_RULES = [
  'image-alt',
  'image-alt-filename',
  'image-alt-long',
  'link-no-text',
  'link-text',
  'adjacent-links',
  'heading-empty',
  'heading-order',
  'paragraph-as-heading',
  'fake-list',
  'table-headers',
  'table-header-empty',
  'table-caption',
  'embed-title',
  'contrast',
  'justified-text',
] as const

/** The checks; each has its title and explanation in the translations (`a11y.rule.<id>.*`). */
export type A11yRuleId = (typeof A11Y_RULES)[number]

/** Slugs of the "Understanding WCAG 2.2" pages of the criteria the checks refer to. */
export type WcagSlug =
  | 'non-text-content'
  | 'info-and-relationships'
  | 'contrast-minimum'
  | 'contrast-enhanced'
  | 'visual-presentation'
  | 'link-purpose-in-context'
  | 'headings-and-labels'
  | 'name-role-value'

/** A WCAG 2.2 success criterion (its name is translated: `a11y.criterion.<slug>`). */
export interface WcagCriterion {
  readonly id: string
  readonly level: A11yLevel
  readonly slug: WcagSlug
}

/** Fields a "write it" repair asks for (label: `a11y.field.<field>`). */
export type A11yField = 'alt' | 'linkText' | 'caption' | 'title'

/** One-click repairs (label: `a11y.action.<id>`, which may use `{color}`). */
export type A11yActionId =
  | 'headerRow'
  | 'headerColumn'
  | 'toBulletList'
  | 'toOrderedList'
  | 'mergeLinks'
  | 'toParagraph'
  | 'suggestedColor'
  | 'removeColor'
  | 'alignLeft'

export interface A11yAction {
  readonly id: A11yActionId
  /** Values for the label (e.g. the suggested color). */
  readonly params?: Readonly<Record<string, string>>
  readonly command: Command
}

/**
 * What the dialog offers to fix an issue. Commands only work on the document
 * the issue was found in (check again after a change).
 */
export type A11yRepair =
  | {
      readonly kind: 'text'
      readonly field: A11yField
      /** Current value, as a starting point. */
      readonly value: string
      /** Images: offer "decorative" (the command then receives null). */
      readonly decorative?: boolean
      /** Longest accepted value. */
      readonly maxLength: number
      readonly apply: (value: string | null) => Command
    }
  | {
      readonly kind: 'heading'
      /** Levels that fix the issue; the first is the suggested one. */
      readonly levels: readonly number[]
      readonly apply: (level: number) => Command
    }
  | { readonly kind: 'actions'; readonly actions: readonly A11yAction[] }

/** Where the issue is: a node (image, table, embed…) or a range of text. */
export type A11yTarget =
  | { readonly kind: 'node'; readonly pos: number }
  | { readonly kind: 'text'; readonly from: number; readonly to: number }

export interface A11yIssue {
  readonly rule: A11yRuleId
  readonly severity: A11ySeverity
  readonly criterion: WcagCriterion
  readonly target: A11yTarget
  /** Values for the explanation (`a11y.rule.<id>.description`). */
  readonly params: Readonly<Record<string, string | number>>
  readonly repair: A11yRepair | null
}

export interface A11yOptions {
  /** Level to check against (default `'AA'`): `'A'` skips contrast, `'AAA'` is stricter. */
  level?: A11yLevel
  /** Turn single checks off, e.g. `{ 'table-caption': false }`. */
  rules?: Partial<Record<A11yRuleId, boolean>>
  /**
   * Background the saved text is shown on, for the contrast check when the
   * text has no background color of its own (default `#ffffff`).
   */
  background?: string
  /** Color of text without a color of its own (default `#000000`). */
  color?: string
  /** Link texts that say nothing about the destination (default: common Italian and English ones). */
  genericLinkTexts?: readonly string[]
  /** Alternative texts longer than this get a hint (default 150). */
  maxAltLength?: number
}
