/**
 * Trusted Types support (CLAUDE.md §5.7).
 *
 * Pages with `require-trusted-types-for 'script'` only accept `TrustedHTML` in
 * HTML sinks, including `DOMParser.parseFromString`. Scriba uses one policy,
 * named `scriba`, for a single purpose: parsing untrusted HTML into an *inert*
 * document whose content is then rebuilt by the schema parser (scripts never run,
 * nothing is copied from it into the page). If your CSP has a `trusted-types`
 * directive, add `scriba` to it.
 */

interface TrustedTypePolicyLike {
  createHTML(input: string): unknown
}

interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createHTML(input: string): string }): TrustedTypePolicyLike
}

export const TRUSTED_TYPES_POLICY = 'scriba'

let policy: TrustedTypePolicyLike | null | undefined

function getPolicy(): TrustedTypePolicyLike | null {
  if (policy !== undefined) return policy
  const factory = (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes
  try {
    // security-reviewed: identity policy, used only for DOMParser on an inert document (see above).
    policy = factory
      ? factory.createPolicy(TRUSTED_TYPES_POLICY, { createHTML: (input) => input })
      : null
  } catch {
    policy = null // policy name not allowed by the page's CSP: parsing will be refused, callers fall back to text
  }
  return policy
}

/** Parses HTML into an inert document (scripts disabled, nothing attached to the page). */
export function parseInertHTML(html: string): Document {
  const p = getPolicy()
  const input = (p ? p.createHTML(html) : html) as string
  return new DOMParser().parseFromString(input, 'text/html')
}
