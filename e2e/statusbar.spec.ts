import { expect, test, type Page } from '@playwright/test'

type Scriba = {
  html(): string
  setHTML(source: string): void
  saved: string[]
  cspViolations: string[]
}
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const saved = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.saved)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const path = (page: Page) => page.getByRole('navigation', { name: "Percorso dell'elemento" })

async function menu(page: Page, top: string, ...names: string[]) {
  await page.getByRole('menubar', { name: 'Menu' }).getByRole('menuitem', { name: top }).click()
  let current = page.getByRole('menu', { name: top })
  for (const [i, name] of names.entries()) {
    await current.getByRole('menuitem', { name, exact: true }).click()
    if (i < names.length - 1) current = page.getByRole('menu', { name })
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

test('element path shows where the cursor is; a block button selects it', async ({ page }) => {
  await setHTML(page, '<ul><li><p>uno <strong>due</strong></p></li></ul><p>dopo</p>')
  await editor(page).getByText('due').click()
  await expect(path(page).getByRole('listitem')).toHaveText(['ul', 'li', 'p', 'strong'])
  await expect(path(page).getByRole('button', { name: 'li' })).toBeVisible()
  await path(page).getByRole('button', { name: 'ul' }).click()
  // the whole list is selected: typing replaces it
  await page.keyboard.type('x')
  await expect.poll(() => html(page)).toBe('<p>x</p><p>dopo</p>')
  await expect(path(page).getByRole('listitem')).toHaveText(['p'])
})

test('resize handle: arrows change the height, the editor scrolls inside', async ({ page }) => {
  const handle = page.getByRole('button', { name: /Ridimensiona l'editor/ })
  const height = () => editor(page).evaluate((e) => Math.round(e.getBoundingClientRect().height))
  const before = await height()
  await handle.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  expect(await height()).toBe(before + 100)
  await page.keyboard.press('Escape')
  expect(await height()).toBe(before)
  // drag with the mouse (upwards, so the pointer stays inside the window)
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 4 })
  await page.mouse.up()
  expect(Math.abs((await height()) - (before + 40))).toBeLessThanOrEqual(2)
  expect(await editor(page).evaluate((e) => getComputedStyle(e).overflowY)).toBe('auto')
})

test('Ctrl+S saves with your function; File ▸ Salva only when something changed', async ({
  page,
}) => {
  await page.keyboard.type('ciao')
  await page.keyboard.press('Control+s')
  await expect.poll(() => saved(page)).toEqual(['<p>ciao</p>'])
  // nothing new: Ctrl+S does nothing (and no browser dialog), the menu entry is disabled
  await page.keyboard.press('Control+s')
  await page.getByRole('menubar', { name: 'Menu' }).getByRole('menuitem', { name: 'File' }).click()
  await expect(
    page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Salva' }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await menu(page, 'File', 'Salva')
  await expect.poll(() => saved(page)).toEqual(['<p>ciao</p>', '<p>ciao!</p>'])
})

test('Formato ▸ Maiuscole e minuscole changes the selected text', async ({ page }) => {
  await setHTML(page, '<p>il gatto <strong>nero</strong> dorme. poi si sveglia</p>')
  await editor(page).click()
  await page.keyboard.press('Control+a')
  await menu(page, 'Formato', 'Maiuscole e minuscole', 'Iniziali Maiuscole')
  await expect
    .poll(() => html(page))
    .toBe('<p>Il Gatto <strong>Nero</strong> Dorme. Poi Si Sveglia</p>')
  await menu(page, 'Formato', 'Maiuscole e minuscole', 'Maiuscola a inizio frase')
  await expect
    .poll(() => html(page))
    .toBe('<p>Il gatto <strong>nero</strong> dorme. Poi si sveglia</p>')
  await menu(page, 'Formato', 'Maiuscole e minuscole', 'MAIUSCOLO')
  await expect
    .poll(() => html(page))
    .toBe('<p>IL GATTO <strong>NERO</strong> DORME. POI SI SVEGLIA</p>')
  // one undo step each
  await page.keyboard.press('Control+z')
  await expect
    .poll(() => html(page))
    .toBe('<p>Il gatto <strong>nero</strong> dorme. Poi si sveglia</p>')
})
