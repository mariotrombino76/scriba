import { expect, test } from '@playwright/test'

/** The React wrapper (`@scriba-editor/react`) in a real browser, under the strict CSP. */
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('dialog', (d) => errors.push(`dialog: ${d.message()}`)) // an alert() would mean XSS
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/react.html')
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { scribaReact: { cspViolations: string[] } }).scribaReact
          .cspViolations,
    ),
  ).toEqual([])
})

test('typing updates the React state; content from outside goes through the schema', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: 'Editor React' })
  await expect(page.getByRole('toolbar', { name: 'Formattazione' })).toBeVisible()
  await editor.getByText('React').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect(page.getByTestId('value')).toHaveText('<p>Ciao <strong>React!</strong></p>')
  // the toolbar works on the React editor
  await page.keyboard.press('Shift+Home')
  await page
    .getByRole('toolbar', { name: 'Formattazione' })
    .getByRole('button', { name: 'Corsivo' })
    .click()
  await expect(page.getByTestId('value')).toHaveText(
    '<p><em>Ciao </em><strong><em>React!</em></strong></p>',
  )
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
  await editor.getByText('fine').click()
  await page.keyboard.press('End')
  await page.keyboard.type('.')
  await expect(page.getByTestId('value')).toContainText('<p>fine.</p>')
  await page.evaluate(() => {
    const list = (window as unknown as { scribaReact: { cspViolations: string[] } }).scribaReact
      .cspViolations
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i] === 'script-src-attr: inline') list.splice(i, 1)
  })
})

test('read-only can be switched by the React app', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Editor React' })
  await page.getByRole('button', { name: 'Sola lettura' }).click()
  await expect(editor).toHaveAttribute('aria-readonly', 'true')
  await page.getByRole('button', { name: 'Sola lettura' }).click()
  await expect(editor).toHaveAttribute('aria-readonly', 'false')
})
