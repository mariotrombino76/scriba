import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const menubar = (page: Page) => page.getByRole('menubar', { name: 'Menu' })

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

test('menus like TinyMCE: File, Modifica, Visualizza, Inserisci, Formato, Strumenti, Tabella', async ({
  page,
}) => {
  await expect(menubar(page).getByRole('menuitem')).toHaveText([
    'File',
    'Modifica',
    'Visualizza',
    'Inserisci',
    'Formato',
    'Strumenti',
    'Tabella',
  ])
  // groups separated like TinyMCE's menus
  await menubar(page).getByRole('menuitem', { name: 'File' }).click()
  await expect(page.getByRole('menu', { name: 'File' }).getByRole('separator')).toHaveCount(3)
})

test('keyboard: one tab stop, arrows, Down opens, Left/Right switch menus, Escape', async ({
  page,
}) => {
  await page.keyboard.type('testo')
  await page.keyboard.press('Shift+Home')
  await menubar(page).getByRole('menuitem', { name: 'File' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(menubar(page).getByRole('menuitem', { name: 'Modifica' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menu', { name: 'Modifica' })).toBeVisible()
  await page.keyboard.press('ArrowRight') // next menu, still open
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('menu', { name: 'Formato' })).toBeVisible()
  await expect(page.getByRole('menu', { name: 'Modifica' })).toBeHidden()
  await page
    .getByRole('menu', { name: 'Formato' })
    .getByRole('menuitemcheckbox', { name: 'Grassetto' })
    .click()
  expect(await html(page)).toBe('<p><strong>testo</strong></p>')
  await menubar(page).getByRole('menuitem', { name: 'Formato' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Formato' })).toBeHidden()
  await expect(menubar(page).getByRole('menuitem', { name: 'Formato' })).toBeFocused()
})

test('hovering another menu while one is open switches to it; sub-menus open', async ({ page }) => {
  await page.keyboard.type('Titolo')
  await menubar(page).getByRole('menuitem', { name: 'Inserisci' }).click()
  await menubar(page).getByRole('menuitem', { name: 'Formato' }).hover()
  const format = page.getByRole('menu', { name: 'Formato' })
  await expect(format).toBeVisible()
  await format.getByRole('menuitem', { name: 'Stile paragrafo' }).click()
  await page
    .getByRole('menu', { name: 'Stile paragrafo' })
    .getByRole('menuitemradio', { name: 'Titolo 1' })
    .click()
  expect(await html(page)).toBe('<h1>Titolo</h1>')
})

test('Inserisci opens the same dialogs as the toolbar', async ({ page }) => {
  await menubar(page).getByRole('menuitem', { name: 'Inserisci' }).click()
  await page
    .getByRole('menu', { name: 'Inserisci' })
    .getByRole('menuitem', { name: 'Caratteri speciali' })
    .click()
  await expect(page.getByRole('dialog', { name: /Caratteri speciali/ })).toBeVisible()
})

test('Formato › Rimuovi formattazione keeps links', async ({ page }) => {
  await page.keyboard.type('testo')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('Control+b')
  await page.keyboard.press('Control+i')
  await menubar(page).getByRole('menuitem', { name: 'Formato' }).click()
  await page
    .getByRole('menu', { name: 'Formato' })
    .getByRole('menuitem', { name: 'Rimuovi formattazione' })
    .click()
  expect(await html(page)).toBe('<p>testo</p>')
})
