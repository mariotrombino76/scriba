import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setReadOnly(on: boolean): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const box = (page: Page) => editor(page).getByRole('note')

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await editor(page).click()
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

test('"/riquadro" wraps the line in a callout; typing, Enter and lists work inside', async ({
  page,
}) => {
  await page.keyboard.type('Nota')
  await page.keyboard.press('Home')
  await page.keyboard.type('/riquadro')
  await page.keyboard.press('Enter')
  await expect(box(page)).toHaveAccessibleName('Riquadro: Informazione')
  await page.keyboard.press('End')
  await page.keyboard.type(' importante')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- punto')
  expect(await html(page)).toBe(
    '<aside class="scriba-callout" data-callout="info"><p>Nota importante</p><ul><li><p>punto</p></li></ul></aside>',
  )
  // Enter on empty lines leaves the list, then the callout (like a quote)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('fuori')
  expect(await html(page)).toContain('</ul></aside><p>fuori</p>')
  // and arrows go back in (the caret keeps its horizontal place: End to the line end)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  expect(await html(page)).toContain('<p>punto!</p>')
})

test('the kind is chosen in the Vue header (mouse and keyboard), undoable', async ({ page }) => {
  await page.keyboard.type('/riquadro')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Testo')
  await box(page).getByRole('radio', { name: 'Avviso' }).click()
  await expect(box(page)).toHaveAccessibleName('Riquadro: Avviso')
  await page.keyboard.press('ArrowRight')
  await expect(box(page).getByRole('radio', { name: 'Pericolo' })).toBeFocused()
  await expect(box(page).getByRole('radio', { name: 'Pericolo' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape') // back to the text
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe(
    '<aside class="scriba-callout" data-callout="danger"><p>Testo</p></aside>',
  )
  await page.keyboard.press('Control+z')
  await expect(box(page)).toHaveAccessibleName('Riquadro: Avviso')
  // the header text is not editable: clicking it and typing changes nothing in it
  await box(page)
    .getByRole('radiogroup')
    .click({ position: { x: 1, y: 1 } })
  await expect(box(page).getByRole('radio', { name: 'Avviso' })).toHaveText('Avviso')
})

test('read-only: header disabled, content not editable', async ({ page }) => {
  await page.keyboard.type('/riquadro')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Fisso')
  await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.setReadOnly(true))
  await expect(box(page).getByRole('radio', { name: 'Pericolo' })).toBeDisabled()
  await box(page).getByText('Fisso').click()
  await page.keyboard.type('x')
  expect(await html(page)).toContain('<p>Fisso</p>')
})
