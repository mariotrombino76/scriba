import { expect, test, type Page } from '@playwright/test'

type Scriba = {
  html(): string
  setReadOnly(on: boolean): void
  setCanComment(on: boolean): void
  cspViolations: string[]
}
const scriba = (page: Page) =>
  page.evaluateHandle(() => (window as unknown as { scriba: Scriba }).scriba)
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const panel = (page: Page) => page.getByRole('region', { name: 'Commenti' })
const TEXT = '<p>Il preventivo va rivisto</p>'

async function become(page: Page, role: 'reader' | 'commenter') {
  const s = await scriba(page)
  await s.evaluate((x, r) => {
    x.setReadOnly(true)
    x.setCanComment(r === 'commenter')
  }, role)
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await editor(page).click()
  await page.keyboard.type('Il preventivo va rivisto')
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

test('a commenter selects with the keyboard and comments; the text stays as it is', async ({
  page,
}) => {
  await become(page, 'commenter')
  await expect(editor(page)).toHaveAttribute('aria-readonly', 'true')
  await editor(page).click()
  await page.keyboard.press('Home')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight')
  // typing over the selection does nothing
  await page.keyboard.type('x')
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe(TEXT)
  // the toolbar: commenting yes, formatting no
  await expect(toolbar(page).getByRole('button', { name: 'Grassetto' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(toolbar(page).getByRole('button', { name: 'Commenta' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
  await page.keyboard.press('Control+Alt+m')
  const dialog = page.getByRole('dialog', { name: 'Commenta' })
  await dialog.getByLabel('Commento').fill('Cifre da ricontrollare')
  await dialog.getByRole('button', { name: 'Aggiungi commento' }).click()
  const thread = panel(page).getByRole('article', { name: 'Commento di Tu' })
  await expect(thread.getByRole('button', { name: '“preventivo”' })).toBeVisible()
  await thread.getByRole('textbox', { name: 'Rispondi…' }).fill('Anche le date')
  await thread.getByRole('button', { name: 'Rispondi', exact: true }).click()
  await expect(thread.getByText('Anche le date')).toBeVisible()
  expect(await html(page)).toBe(TEXT) // anchors are not in the exported HTML
})

test('the selection menu shows commenting only', async ({ page }) => {
  await become(page, 'commenter')
  // double-click on a word (the middle of the line is past the end of the text)
  await editor(page)
    .locator('p')
    .dblclick({ position: { x: 40, y: 8 } })
  const bubble = page.getByRole('toolbar', { name: 'Formattazione della selezione' })
  await expect(bubble).toBeVisible()
  await expect(bubble.getByRole('button', { name: 'Commenta' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
  await expect(bubble.getByRole('button', { name: 'Grassetto' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('a reader cannot comment: shortcut, toolbar and replies are off', async ({ page }) => {
  // a comment made while editing, then the reader comes
  await editor(page).click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+Alt+m')
  const dialog = page.getByRole('dialog', { name: 'Commenta' })
  await dialog.getByLabel('Commento').fill('Prima')
  await dialog.getByRole('button', { name: 'Aggiungi commento' }).click()
  await become(page, 'reader')
  await editor(page).click()
  await page.keyboard.press('Control+Alt+m')
  await expect(page.getByRole('dialog', { name: 'Commenta' })).toHaveCount(0)
  await expect(toolbar(page).getByRole('button', { name: 'Commenta' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  const thread = panel(page).getByRole('article', { name: 'Commento di Tu' })
  await expect(thread.getByRole('textbox', { name: 'Rispondi…' })).toBeDisabled()
  await expect(thread.getByRole('button', { name: 'Elimina discussione' })).toBeDisabled()
})

test('commenters cannot accept or reject suggested changes', async ({ page }) => {
  await toolbar(page).getByRole('button', { name: 'Proponi modifiche' }).click()
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' subito')
  const accept = panel(page).getByRole('button', { name: 'Accetta', exact: true })
  await expect(accept).toBeEnabled()
  await become(page, 'commenter')
  await expect(accept).toBeDisabled()
  await expect(panel(page).getByRole('button', { name: 'Accetta tutte' })).toBeDisabled()
})
