import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(source: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })

/** Formato ▸ … ▸ entry (entries may be plain items, checkboxes or radios). */
async function formatMenu(page: Page, ...path: string[]) {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Formato' })
    .click()
  let menu = page.getByRole('menu', { name: 'Formato' })
  for (const [i, name] of path.entries()) {
    await menu.locator('[role^=menuitem]').getByText(name, { exact: true }).click()
    if (i < path.length - 1) menu = page.getByRole('menu', { name })
  }
}

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

test('superscript and subscript: keys and the toolbar', async ({ page }) => {
  await page.keyboard.type('x2 H2O')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Control+.')
  await expect(toolbar(page).getByRole('button', { name: 'Apice' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Control+,')
  await expect.poll(() => html(page)).toBe('<p>x<sup>2</sup> H<sub>2</sub>O</p>')
})

test('line height, right-to-left, numbering from the menus', async ({ page }) => {
  await page.keyboard.type('riga')
  await formatMenu(page, 'Interlinea', '1,5')
  await expect.poll(() => html(page)).toBe('<p style="line-height: 1.5">riga</p>')
  await formatMenu(page, 'Da destra a sinistra')
  await expect.poll(() => html(page)).toBe('<p dir="rtl" style="line-height: 1.5">riga</p>')
  await expect(editor(page).locator('p[dir=rtl]')).toBeVisible()
  await formatMenu(page, 'Da sinistra a destra')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('voce')
  await formatMenu(page, 'Numerazione', 'i, ii, iii')
  await expect
    .poll(() => html(page))
    .toBe('<p style="line-height: 1.5">riga</p><ol type="i"><li><p>voce</p></li></ol>')
  await expect(editor(page).locator('ol[type=i]')).toBeVisible()
})

test('non-breaking space: Ctrl+Shift+Space', async ({ page }) => {
  await page.keyboard.type('10')
  await page.keyboard.press('Control+Shift+Space')
  await page.keyboard.type('km')
  await expect.poll(() => html(page)).toBe('<p>10 km</p>')
})

test('addresses typed become links (space or Enter); Ctrl+Z keeps the text', async ({ page }) => {
  await page.keyboard.type('vedi www.example.com ')
  await expect
    .poll(() => html(page))
    .toBe('<p>vedi <a href="https://www.example.com">www.example.com</a> </p>')
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toBe('<p>vedi www.example.com </p>')
  await page.keyboard.type('scrivi a anna@example.it')
  await page.keyboard.press('Enter')
  await expect
    .poll(() => html(page))
    .toBe(
      '<p>vedi www.example.com scrivi a <a href="mailto:anna@example.it">anna@example.it</a></p><p></p>',
    )
})
