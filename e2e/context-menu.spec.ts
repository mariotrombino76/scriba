import { expect, test, type Page } from '@playwright/test'

type Scriba = {
  html(): string
  setHTML(source: string): void
  setReadOnly(on: boolean): void
  cspViolations: string[]
}
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const contextMenu = (page: Page) => page.getByRole('menu', { name: 'Menu contestuale' })

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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

test('plain text: the browser menu, not ours', async ({ page }) => {
  await page.keyboard.type('testo semplice')
  await editor(page).getByText('testo semplice').click({ button: 'right' })
  await expect(contextMenu(page)).toHaveCount(0)
})

test('on a link: edit, remove, open; Escape goes back to the editor', async ({ page }) => {
  await setHTML(page, '<p>vai al <a href="https://example.com/">sito</a> ora</p>')
  await editor(page).getByText('sito').click({ button: 'right' })
  const menu = contextMenu(page)
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem')).toHaveText(['LinkCtrl+K', 'Rimuovi link', 'Apri link'])
  await expect(menu.getByRole('menuitem', { name: 'Link', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(editor(page)).toBeFocused()
  // "Open link": a new tab, without access to this page
  await page.evaluate(() => {
    const w = window as unknown as { opened: unknown[] }
    w.opened = []
    window.open = (...a: unknown[]) => (w.opened.push(a), null)
  })
  await editor(page).getByText('sito').click({ button: 'right' })
  await menu.getByRole('menuitem', { name: 'Apri link' }).click()
  expect(await page.evaluate(() => (window as unknown as { opened: unknown[] }).opened)).toEqual([
    ['https://example.com/', '_blank', 'noopener,noreferrer'],
  ])
  await editor(page).getByText('sito').click({ button: 'right' })
  await menu.getByRole('menuitem', { name: 'Rimuovi link' }).click()
  await expect.poll(() => html(page)).toBe('<p>vai al sito ora</p>')
})

test('Ctrl+right click keeps the browser menu', async ({ page }) => {
  await setHTML(page, '<p><a href="https://example.com/">sito</a></p>')
  await editor(page)
    .getByText('sito')
    .click({ button: 'right', modifiers: ['Control'] })
  await expect(contextMenu(page)).toHaveCount(0)
})

test('in a table: the cell clicked gets the cursor, Row ▸ Insert row below', async ({ page }) => {
  await setHTML(
    page,
    '<p>prima</p><table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>',
  )
  await editor(page).getByText('prima').click() // cursor outside the table
  await editor(page).getByRole('cell', { name: 'a' }).click({ button: 'right' })
  const menu = contextMenu(page)
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Cella',
    'Riga',
    'Colonna',
    'Proprietà tabella…',
    'Elimina tabella',
  ])
  await menu.getByRole('menuitem', { name: 'Riga' }).click()
  const rows = page.getByRole('menu', { name: 'Riga' })
  await expect(rows).toBeVisible()
  // Left goes back to the main menu, Right opens the sub-menu again
  await page.keyboard.press('ArrowLeft')
  await expect(menu).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await rows.getByRole('menuitem', { name: 'Inserisci riga sotto' }).click()
  await expect
    .poll(() => html(page))
    .toBe(
      '<p>prima</p><table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p></p></td><td><p></p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table><p></p>',
    )
})

test('on an image: it gets selected, "Immagine" edits it', async ({ page }) => {
  await setHTML(page, `<p>x</p><p><img src="${PNG}" alt="punto" width="40"></p>`)
  await editor(page).getByRole('img', { name: 'punto' }).click({ button: 'right' })
  await contextMenu(page).getByRole('menuitem', { name: 'Immagine' }).click()
  await expect(page.getByRole('dialog', { name: 'Modifica immagine' })).toBeVisible()
})

test('read-only: opening a link works, editing entries are disabled', async ({ page }) => {
  await setHTML(page, '<p><a href="https://example.com/">sito</a></p>')
  await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.setReadOnly(true))
  await editor(page).getByText('sito').click({ button: 'right' })
  const menu = contextMenu(page)
  await expect(menu.getByRole('menuitem', { name: 'Rimuovi link' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(menu.getByRole('menuitem', { name: 'Apri link' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
})
