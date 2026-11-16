import { expect, type Page } from '@playwright/test'

/**
 * Pages whose test loads an on* attribute on purpose (pasted HTML, setContent, an opened
 * file…). Chromium reports `script-src-attr: inline` as soon as the INERT DOMParser
 * document holds such an attribute, although nothing runs there; the report is
 * asynchronous and may arrive after the test's last step. Whether anything ran is checked
 * by the tests themselves (dialog listener, `__xss`, no `[onerror]` in the editor).
 */
const inertHandlerReport = new WeakSet<Page>()

/** The test parses an on* attribute on purpose: its Chromium report is not a failure. */
export function allowInertHandlerReport(page: Page): void {
  inertHandlerReport.add(page)
}

/** No CSP violation on the page (`window[key].cspViolations`), see `allowInertHandlerReport`. */
export async function expectNoCspViolations(page: Page, key: string): Promise<void> {
  const list = await page.evaluate(
    (k) => (window as unknown as Record<string, { cspViolations: string[] }>)[k]!.cspViolations,
    key,
  )
  expect(
    inertHandlerReport.has(page) ? list.filter((v) => v !== 'script-src-attr: inline') : list,
  ).toEqual([])
}
