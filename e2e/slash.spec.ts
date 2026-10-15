import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const menu = (page: Page) => page.getByRole('listbox', { name: 'Comandi' })

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
    await page.evaluate(
      () => (window as unknown as { scriba: { cspViolations: string[] } }).scriba.cspViolations,
    ),
  ).toEqual([])
})

test('"/" opens the menu under the cursor; typing filters; Enter applies', async ({ page }) => {
  await page.keyboard.type('/')
  await expect(menu(page)).toBeVisible()
  await expect(menu(page).getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  // positioned right under the "/"
  const caret = (await editor(page).locator('p').boundingBox())!
  const box = (await menu(page).boundingBox())!
  expect(box.y).toBeGreaterThan(caret.y)
  expect(box.y - (caret.y + caret.height)).toBeLessThan(30)
  await page.keyboard.type('elenco num')
  await expect(menu(page).getByRole('option')).toHaveText(['Elenco numerato'])
  await page.keyboard.press('Enter')
  await expect(menu(page)).toBeHidden()
  await page.keyboard.type('primo')
  expect(await html(page)).toBe('<ol><li><p>primo</p></li></ol>')
})

test('arrows move, the editor points to the highlighted option (screen readers)', async ({
  page,
}) => {
  await page.keyboard.type('/tit')
  await page.keyboard.press('ArrowDown')
  const active = await editor(page).getAttribute('aria-activedescendant')
  await expect(page.locator(`#${active}`)).toHaveText('Titolo 2')
  await expect(editor(page)).toHaveAttribute('aria-controls', /scriba-slash/)
  await page.keyboard.press('Tab')
  await page.keyboard.type('Sezione')
  expect(await html(page)).toBe('<h2>Sezione</h2>')
  await expect(editor(page)).not.toHaveAttribute('aria-activedescendant', /./)
})

test('click on an entry; actions open their dialog', async ({ page }) => {
  await page.keyboard.type('testo ')
  await page.keyboard.type('/tab')
  await menu(page).getByRole('option', { name: 'Tabella' }).click()
  expect(await html(page)).toContain('<table>')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('/emoji')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Caratteri speciali ed emoji' })).toBeVisible()
})

test('Escape keeps the text; "/" in a word or in code does not open the menu', async ({ page }) => {
  await page.keyboard.type('/ti')
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  await page.keyboard.type(' e/o 1/2')
  await expect(menu(page)).toBeHidden()
  expect(await html(page)).toBe('<p>/ti e/o 1/2</p>')
  await page.keyboard.press('Enter')
  await page.keyboard.type('```js ')
  await page.keyboard.type('/x')
  await expect(menu(page)).toBeHidden()
})

test('no match: the next space closes the menu and typing goes on', async ({ page }) => {
  await page.keyboard.type('/zzz')
  await expect(menu(page).getByText('Nessun comando')).toBeVisible()
  await page.keyboard.type(' fine')
  await expect(menu(page)).toBeHidden()
  expect(await html(page)).toBe('<p>/zzz fine</p>')
})
