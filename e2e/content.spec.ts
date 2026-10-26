import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(source: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

/** Opens a menu bar menu and walks submenus; the last name is clicked (any menu item role). */
async function menu(page: Page, top: string, ...names: string[]) {
  await page.getByRole('menubar', { name: 'Menu' }).getByRole('menuitem', { name: top }).click()
  let current = page.getByRole('menu', { name: top })
  for (const [i, name] of names.entries()) {
    await current.locator('[role^=menuitem]').getByText(name, { exact: true }).click()
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

test('Formato ▸ Stili: a block class and a text class from the site list', async ({ page }) => {
  await setHTML(page, '<p>uno due</p>')
  await editor(page).getByText('uno due').click()
  await menu(page, 'Formato', 'Stili', 'Avviso')
  await expect.poll(() => html(page)).toBe('<p class="avviso">uno due</p>')
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await menu(page, 'Formato', 'Stili', 'Evidenza')
  await expect
    .poll(() => html(page))
    .toBe('<p class="avviso">uno <span class="evidenza">due</span></p>')
  // the same entry again removes it
  await menu(page, 'Formato', 'Stili', 'Avviso')
  await expect.poll(() => html(page)).toBe('<p>uno <span class="evidenza">due</span></p>')
})

test('footnotes: insert, write the note, numbers follow the order', async ({ page }) => {
  await setHTML(page, '<p>Primo secondo</p>')
  await editor(page).getByText('Primo secondo').click()
  await page.keyboard.press('End')
  await menu(page, 'Inserisci', 'Nota a piè di pagina')
  await page.keyboard.type('Nota B')
  await expect
    .poll(() => html(page))
    .toBe(
      '<p>Primo secondo<sup><a href="#fn-1" id="fnref-1">1</a></sup></p><ol class="scriba-footnotes"><li id="fn-1"><p>Nota B</p></li></ol>',
    )
  // a new footnote earlier in the text becomes 1 (Ctrl+Alt+F)
  await editor(page).getByText('Primo secondo').click()
  await page.keyboard.press('Home')
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Control+Alt+f')
  await page.keyboard.type('Nota A')
  await expect
    .poll(() => html(page))
    .toBe(
      '<p>Primo<sup><a href="#fn-1" id="fnref-1">1</a></sup> secondo<sup><a href="#fn-2" id="fnref-2">2</a></sup></p>' +
        '<ol class="scriba-footnotes"><li id="fn-1"><p>Nota A</p></li><li id="fn-2"><p>Nota B</p></li></ol>',
    )
  // from the note back to its reference: deleting the reference removes its note too
  await menu(page, 'Inserisci', 'Vai alla nota o al testo')
  await page.keyboard.press('Delete')
  await expect
    .poll(() => html(page))
    .toBe(
      '<p>Primo secondo<sup><a href="#fn-1" id="fnref-1">1</a></sup></p><ol class="scriba-footnotes"><li id="fn-1"><p>Nota B</p></li></ol>',
    )
})

test('merge tags: "{{" suggests the site tags; the menu inserts them too', async ({ page }) => {
  await setHTML(page, '<p>Gentile </p>')
  await editor(page).getByText('Gentile').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' {{cli')
  const list = page.getByRole('listbox', { name: 'Campi di unione' })
  await expect(list.getByRole('option')).toHaveText([
    'Cliente › Nome{{cliente.nome}}',
    'Cliente › E-mail{{cliente.email}}',
  ])
  await expect(editor(page)).toHaveAttribute('aria-controls', /.+/)
  await page.keyboard.press('Enter')
  await expect(list).toBeHidden()
  await page.keyboard.type(',')
  await expect
    .poll(() => html(page))
    .toBe('<p>Gentile <span data-merge-tag="cliente.nome">{{cliente.nome}}</span>,</p>')
  await menu(page, 'Inserisci', 'Campo di unione', 'Data di oggi')
  await expect
    .poll(() => html(page))
    .toBe(
      '<p>Gentile <span data-merge-tag="cliente.nome">{{cliente.nome}}</span>,<span data-merge-tag="data_oggi">{{data_oggi}}</span></p>',
    )
})

test('table of contents: lists the headings and follows their changes', async ({ page }) => {
  await setHTML(page, '<p></p><h2>Introduzione</h2><p>testo</p><h3>Dettagli</h3>')
  await editor(page).locator('p').first().click()
  await menu(page, 'Inserisci', 'Indice dei contenuti')
  const toc = editor(page).locator('ol.scriba-toc')
  await expect(toc.getByRole('link')).toHaveText(['Introduzione', 'Dettagli'])
  await editor(page).getByRole('heading', { name: 'Dettagli' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' tecnici')
  await expect(toc.getByRole('link')).toHaveText(['Introduzione', 'Dettagli tecnici'])
  expect(await html(page)).toContain('<h3 id="anchor-dettagli">Dettagli tecnici</h3>')
})
