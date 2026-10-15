import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione' })
const button = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name, exact: true })

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Editor di prova' }).click()
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
})

test('toolbar buttons format the selection and show their state', async ({ page }) => {
  await page.keyboard.type('ciao')
  await page.keyboard.press('Shift+Home')
  await button(page, 'Grassetto').click()
  expect(await html(page)).toBe('<p><strong>ciao</strong></p>')
  await expect(button(page, 'Grassetto')).toHaveAttribute('aria-pressed', 'true')
  await toolbar(page)
    .getByRole('button', { name: /^Stile paragrafo/ })
    .click()
  await page.getByRole('menuitemradio', { name: 'Titolo 2' }).click()
  expect(await html(page)).toBe('<h2><strong>ciao</strong></h2>')
  await expect(
    toolbar(page).getByRole('button', { name: 'Stile paragrafo: Titolo 2' }),
  ).toBeVisible()
  // the editor keeps the selection: typing replaces it
  await page.keyboard.type('X')
  expect(await html(page)).toBe('<h2><strong>X</strong></h2>')
  await button(page, 'Annulla').click()
  expect(await html(page)).toBe('<h2><strong>ciao</strong></h2>')
})

test('toolbar is keyboard accessible (one tab stop, arrows, Escape)', async ({ page }) => {
  await page.keyboard.type('ab')
  await page.keyboard.press('Shift+ArrowLeft')
  // Shift+Tab from the editor reaches the toolbar's single tab stop
  await page.keyboard.press('Shift+Tab')
  await expect(button(page, 'Annulla')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(button(page, 'Ripeti')).toBeFocused()
  await page.keyboard.press('End')
  // the last control (contextual menus like the code language are hidden, so skipped)
  await expect(button(page, 'Schermo intero')).toBeFocused()
  await page.keyboard.press('Home')
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect(button(page, 'Corsivo')).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await html(page)).toBe('<p>a<em>b</em></p>')
  await expect(button(page, 'Corsivo')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: 'Editor di prova' })).toBeFocused()
  await page.keyboard.type('c')
  expect(await html(page)).toBe('<p>a<em>c</em></p>')
})

test('controls are grouped and named', async ({ page }) => {
  const groups = await toolbar(page)
    .getByRole('group')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  expect(groups).toEqual([
    'Cronologia',
    'Stile del testo',
    'Formattazione carattere',
    'Colori',
    'Inserisci',
    'Elenchi e rientro',
    'Blocchi',
    'Visualizzazione',
  ])
  await expect(toolbar(page).getByRole('button', { name: 'Altre opzioni' })).toBeHidden()
})

test('narrow toolbar: trailing groups move into "More options"', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 800 })
  await page.getByRole('textbox', { name: 'Editor di prova' }).click()
  await page.keyboard.type('testo')
  const more = toolbar(page).getByRole('button', { name: 'Altre opzioni' })
  await expect(more).toBeVisible()
  await expect(button(page, 'Citazione')).toBeHidden()
  // the toolbar stays on one line
  const height = await toolbar(page).evaluate((el) => el.getBoundingClientRect().height)
  expect(height).toBeLessThan(70)
  await more.click()
  const menu = page.getByRole('menu', { name: 'Altre opzioni' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Citazione' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await menu.getByRole('menuitemcheckbox', { name: 'Citazione' }).click()
  expect(await html(page)).toBe('<blockquote><p>testo</p></blockquote>')
  // a menu inside "More options" opens as a sub-menu
  await page.keyboard.press('Shift+Home')
  await more.click()
  await menu.getByRole('menuitem', { name: 'Colore testo' }).click()
  await page
    .getByRole('menu', { name: 'Colore testo' })
    .getByRole('menuitemradio', { name: 'Blu' })
    .click()
  expect(await html(page)).toBe(
    '<blockquote><p><span style="color: #1d4ed8">testo</span></p></blockquote>',
  )
})

test('tooltips show the shortcut', async ({ page }) => {
  await expect(button(page, 'Grassetto')).toHaveAttribute('title', 'Grassetto (Ctrl+B)')
  await expect(button(page, 'Link')).toHaveAttribute('title', 'Link (Ctrl+K)')
})

test('every toolbar control has a unique accessible name', async ({ page }) => {
  const names = await toolbar(page)
    .locator(':scope > [role=group] > button')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  expect(names.length).toBeGreaterThan(10)
  expect(new Set(names).size).toBe(names.length)
})

/** Every entry of an open menu is really visible and clickable (not clipped, not covered). */
async function expectMenuFullyUsable(page: Page, name: string) {
  const menu = page.getByRole('menu', { name })
  await expect(menu).toBeVisible()
  const ok = await menu.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('[role^=menuitem]')].map((item) => {
      const r = item.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { label: item.getAttribute('aria-label'), ok: !!hit && item.contains(hit) }
    }),
  )
  expect(ok.filter((i) => !i.ok)).toEqual([])
  // the toolbar itself did not scroll away
  expect(await toolbar(page).evaluate((el) => el.scrollTop)).toBe(0)
}

test('select-like menus open fully visible and usable', async ({ page }) => {
  await toolbar(page)
    .getByRole('button', { name: /^Stile paragrafo/ })
    .click()
  await expectMenuFullyUsable(page, 'Stile paragrafo')
  await page.keyboard.press('Escape')
  await toolbar(page)
    .getByRole('button', { name: /^Carattere/ })
    .click()
  await expectMenuFullyUsable(page, 'Carattere')
  await page.keyboard.press('Escape')
  await toolbar(page)
    .getByRole('button', { name: /^Dimensione carattere/ })
    .click()
  await expectMenuFullyUsable(page, 'Dimensione carattere')
  await page.getByRole('menuitemradio', { name: '24pt' }).click()
  await page.keyboard.type('grande')
  expect(await html(page)).toBe('<p><span style="font-size: 24pt">grande</span></p>')
  await expect(
    toolbar(page).getByRole('button', { name: 'Dimensione carattere: 24pt' }),
  ).toBeVisible()
})
