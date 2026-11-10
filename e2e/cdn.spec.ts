import { expect, test } from '@playwright/test'

/** @scriba-editor/browser: the classic script (global `Scriba`) on a plain page, under the strict CSP. */
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('dialog', (d) => errors.push(`dialog: ${d.message()}`)) // an alert() would mean XSS
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/cdn.html')
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { scribaCdn: { cspViolations: string[] } }).scribaCdn.cspViolations,
    ),
  ).toEqual([])
})

test('createEditor: toolbar, typing, onChange; setContent goes through the schema', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: 'Editor CDN' })
  const toolbar = page.getByRole('toolbar', { name: 'Formattazione' })
  await expect(toolbar.getByRole('button', { name: 'Inserisci tabella' })).toBeVisible()
  await editor.getByText('mondo').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect(page.getByTestId('value')).toHaveText('<p>Ciao <strong>mondo!</strong></p>')
  // Markdown shortcut and a toolbar button (full preset)
  await page.keyboard.press('Enter')
  await page.keyboard.type('- uno')
  await expect(page.getByTestId('value')).toContainText('<ul><li><p>uno</p></li></ul>')
  await page.keyboard.press('Shift+Home')
  await toolbar.getByRole('button', { name: 'Grassetto' }).click()
  await expect(page.getByTestId('value')).toContainText('<strong>uno</strong>')
  // Chromium logs a CSP report as soon as an inert DOMParser document contains an on*
  // attribute, although nothing runs (see file.spec); the dialog listener proves it.
  const errors = (page as unknown as { errors: string[] }).errors
  page.on('console', () => {
    for (let i = errors.length - 1; i >= 0; i--)
      if (/^Executing inline event handler violates/.test(errors[i]!)) errors.splice(i, 1)
  })
  await page.getByRole('button', { name: 'Carica' }).click()
  await expect(editor.getByRole('heading', { name: 'Da fuori' })).toBeVisible()
  await expect(editor.locator('img[onerror]')).toHaveCount(0)
  await page.evaluate(() => {
    const list = (window as unknown as { scribaCdn: { cspViolations: string[] } }).scribaCdn
      .cspViolations
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i] === 'script-src-attr: inline') list.splice(i, 1)
  })
})
