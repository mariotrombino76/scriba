import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const bubble = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione della selezione' })

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

test('appears over the selected text and formats it', async ({ page }) => {
  await page.keyboard.type('una parola qui')
  await expect(bubble(page)).toBeHidden()
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft') // "parola"
  await expect(bubble(page)).toBeVisible()
  // above the text
  const text = (await editor(page).locator('p').boundingBox())!
  const box = (await bubble(page).boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(text.y + 2)
  await bubble(page).getByRole('button', { name: 'Grassetto' }).click()
  expect(await html(page)).toBe('<p>una <strong>parola</strong> qui</p>')
  await expect(bubble(page).getByRole('button', { name: 'Grassetto' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(editor(page)).toBeFocused() // the click keeps the selection in the text
  // collapsing the selection hides it
  await page.keyboard.press('ArrowRight')
  await expect(bubble(page)).toBeHidden()
})

test('keyboard: Alt+F10 enters the bubble, Escape goes back to the text', async ({ page }) => {
  await page.keyboard.type('testo')
  await page.keyboard.press('Shift+Home')
  await expect(bubble(page)).toBeVisible()
  await page.keyboard.press('Alt+F10')
  await expect(bubble(page).getByRole('button', { name: 'Grassetto' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(bubble(page).getByRole('button', { name: 'Corsivo' })).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await html(page)).toBe('<p><em>testo</em></p>')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toBeFocused()
  await expect(bubble(page)).toBeVisible() // the selection is still there
  await page.keyboard.press('Escape') // a second Escape in the text closes it
  await expect(bubble(page)).toBeHidden()
})

test('not while the mouse is still selecting; shown on release', async ({ page }) => {
  await page.keyboard.type('trascina sopra questo testo')
  const p = (await editor(page).locator('p').boundingBox())!
  await page.mouse.move(p.x + 4, p.y + p.height / 2)
  await page.mouse.down()
  await page.mouse.move(p.x + 120, p.y + p.height / 2, { steps: 5 })
  await expect(bubble(page)).toBeHidden()
  await page.mouse.up()
  await expect(bubble(page)).toBeVisible()
})

test('not in code blocks', async ({ page }) => {
  await page.keyboard.type('```js ')
  await page.keyboard.type('codice')
  await page.keyboard.press('Shift+Home')
  await expect(bubble(page)).toBeHidden()
})
