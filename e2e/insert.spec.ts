import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(source: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

async function insertMenu(page: Page, ...path: string[]) {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Inserisci' })
    .click()
  let menu = page.getByRole('menu', { name: 'Inserisci' })
  for (const [i, name] of path.entries()) {
    await menu.getByRole('menuitem', { name, exact: true }).click()
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

test('Inserisci ▸ Linea orizzontale splits the paragraph; typing goes on below', async ({
  page,
}) => {
  await page.keyboard.type('abcd')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await insertMenu(page, 'Linea orizzontale')
  await page.keyboard.type('X')
  await expect.poll(() => html(page)).toBe('<p>ab</p><hr><p>Xcd</p>')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toBe('<p>abcd</p>')
})

test('page break: named for screen readers, a new page when printed', async ({ page }) => {
  await page.keyboard.type('pagina uno')
  await insertMenu(page, 'Interruzione di pagina')
  await page.keyboard.type('pagina due')
  await expect
    .poll(() => html(page))
    .toBe('<p>pagina uno</p><hr class="scriba-page-break"><p>pagina due</p>')
  await expect(
    editor(page).getByRole('separator', { name: 'Interruzione di pagina' }),
  ).toBeVisible()
  // print: the browser dialog is replaced by a probe reading the print copy
  await page.evaluate(() => {
    const w = window as unknown as { breakAfter?: string }
    window.print = () => {
      const hr = document.querySelector('.scriba-print hr.scriba-page-break')
      w.breakAfter = hr ? getComputedStyle(hr).breakAfter : 'none'
      window.dispatchEvent(new Event('afterprint'))
    }
  })
  await page.keyboard.press('Control+p')
  expect(await page.evaluate(() => (window as unknown as { breakAfter?: string }).breakAfter)).toBe(
    'page',
  )
})

test('--- and "/linea" make a line', async ({ page }) => {
  await page.keyboard.type('---')
  await page.keyboard.type('dopo')
  await expect.poll(() => html(page)).toBe('<hr><p>dopo</p>')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/linea')
  await page.getByRole('option', { name: 'Linea orizzontale' }).click()
  await expect.poll(() => html(page)).toBe('<hr><p>dopo</p><hr><p></p>')
})

test('Inserisci ▸ Data/ora: the current date and time, as text', async ({ page }) => {
  await setHTML(page, '<p>Oggi:</p>')
  await editor(page).getByText('Oggi:').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await page.clock.setFixedTime(new Date(2026, 9, 19, 9, 5, 7))
  await insertMenu(page, 'Data/ora', '2026-10-19')
  await expect.poll(() => html(page)).toBe('<p>Oggi: 2026-10-19</p>')
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Inserisci' })
    .click()
  await page
    .getByRole('menu', { name: 'Inserisci' })
    .getByRole('menuitem', { name: 'Data/ora' })
    .click()
  await expect(page.getByRole('menu', { name: 'Data/ora' }).getByRole('menuitem')).toHaveText([
    '09:05:07',
    '2026-10-19',
    '19 ottobre 2026',
    '19/10/26',
  ])
})
