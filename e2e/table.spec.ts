import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione' })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const tableMenu = (page: Page) =>
  toolbar(page).getByRole('button', { name: 'Tabella', exact: true })

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

async function insertTable(page: Page, rows: string, cols: string, header = true) {
  await toolbar(page).getByRole('button', { name: 'Inserisci tabella…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Inserisci tabella' })
  await expect(dialog.getByLabel('Righe')).toBeFocused()
  await dialog.getByLabel('Righe').fill(rows)
  await dialog.getByLabel('Colonne').fill(cols)
  if (!header) await dialog.getByLabel('Prima riga come intestazione').uncheck()
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  await expect(dialog).toBeHidden()
}

/** Types a 2×2 table: a b / c d (Tab between cells). */
async function fill2x2(page: Page) {
  await insertTable(page, '2', '2', false)
  for (const [i, text] of ['a', 'b', 'c', 'd'].entries()) {
    if (i) await page.keyboard.press('Tab')
    await page.keyboard.type(text)
  }
}

const T = (body: string) => `<table><tbody>${body}</tbody></table>`

test('insert from the dialog, type, Tab between cells', async ({ page }) => {
  await insertTable(page, '2', '3')
  await page.keyboard.type('Nome')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Età')
  // Shift+Tab selects the previous cell's content: typing replaces it
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('Chi')
  expect(await html(page)).toBe(
    T(
      '<tr><th><p>Chi</p></th><th><p>Età</p></th><th><p></p></th></tr>' +
        '<tr><td><p></p></td><td><p></p></td><td><p></p></td></tr>',
    ),
  )
})

test('the dialog validates sizes', async ({ page }) => {
  await toolbar(page).getByRole('button', { name: 'Inserisci tabella…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Inserisci tabella' })
  await dialog.getByLabel('Colonne').fill('99')
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  await expect(dialog.getByText('Usa da 1 a 50 righe e da 1 a 20 colonne')).toBeVisible()
  await expect(dialog.getByLabel('Colonne')).toHaveAttribute('aria-invalid', 'true')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe('<p></p>')
})

test('the Table menu adds and deletes rows and columns', async ({ page }) => {
  await fill2x2(page)
  await expect(tableMenu(page)).toBeVisible()
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Inserisci riga sotto' }).click()
  await page.keyboard.type('e')
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Inserisci colonna a destra' }).click()
  expect(await html(page)).toBe(
    T(
      '<tr><td><p>a</p></td><td><p>b</p></td><td><p></p></td></tr>' +
        '<tr><td><p>c</p></td><td><p>d</p></td><td><p></p></td></tr>' +
        '<tr><td><p></p></td><td><p>e</p></td><td><p></p></td></tr>',
    ),
  )
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Elimina colonna' }).click()
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Elimina riga' }).click()
  expect(await html(page)).toBe(
    T('<tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr>'),
  )
})

test('the Table menu is only shown inside a table', async ({ page }) => {
  await expect(tableMenu(page)).toBeHidden()
  await fill2x2(page)
  await expect(tableMenu(page)).toBeVisible()
})

test('Shift+arrows select cells; merge, split, Delete empties cells', async ({ page }) => {
  await fill2x2(page)
  // cursor after "d": go to "a" and select a…b with the keyboard
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.scriba-selected-cell')).toHaveCount(2)
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Unisci celle' }).click()
  expect(await html(page)).toBe(
    T('<tr><td colspan="2"><p>a</p><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr>'),
  )
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Dividi cella' }).click()
  expect(await html(page)).toBe(
    T(
      '<tr><td><p>a</p><p>b</p></td><td><p></p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr>',
    ),
  )
  // select c…d and delete their content
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.scriba-selected-cell')).toHaveCount(2)
  await page.keyboard.press('Delete')
  expect(await html(page)).toBe(
    T(
      '<tr><td><p>a</p><p>b</p></td><td><p></p></td></tr><tr><td><p></p></td><td><p></p></td></tr>',
    ),
  )
})

test('dragging across cells selects them; typing replaces their content', async ({ page }) => {
  await fill2x2(page)
  const a = editor(page).locator('td').nth(0)
  const d = editor(page).locator('td').nth(3)
  const ba = (await a.boundingBox())!
  const bd = (await d.boundingBox())!
  await page.mouse.move(ba.x + 8, ba.y + ba.height / 2)
  await page.mouse.down()
  await page.mouse.move(bd.x + 8, bd.y + bd.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.scriba-selected-cell')).toHaveCount(4)
  await page.keyboard.type('x')
  expect(await html(page)).toBe(
    T('<tr><td><p>x</p></td><td><p></p></td></tr><tr><td><p></p></td><td><p></p></td></tr>'),
  )
})

test('header row and column toggles', async ({ page }) => {
  await fill2x2(page)
  await tableMenu(page).click()
  const item = page.getByRole('menuitemcheckbox', { name: 'Riga di intestazione' })
  await expect(item).toHaveAttribute('aria-checked', 'false')
  await item.click()
  expect(await html(page)).toContain('<tr><th><p>a</p></th><th><p>b</p></th></tr>')
  await tableMenu(page).click()
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Riga di intestazione' }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
})

test('drag a cell border to resize the column; keyboard widen', async ({ page }) => {
  await fill2x2(page)
  const cell = editor(page).locator('td').nth(0)
  const box = (await cell.boundingBox())!
  const x = box.x + box.width - 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await expect(editor(page)).toHaveClass(/scriba-column-resize/)
  await page.mouse.down()
  await page.mouse.move(x + 60, y, { steps: 4 })
  await expect(page.locator('.scriba-column-guide')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('.scriba-column-guide')).toBeHidden()
  const width = Math.round(box.width + 60)
  await expect.poll(() => html(page)).toMatch(/<td width="(\d+)"><p>a<\/p><\/td>/)
  const set = Number(/<td width="(\d+)"><p>a/.exec(await html(page))![1])
  expect(Math.abs(set - width)).toBeLessThanOrEqual(3)
  expect(await html(page)).toContain(`<td width="${set}"><p>c</p></td>`)
  // one undo step
  await editor(page).locator('td').nth(1).click()
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).not.toContain('width=')
  // keyboard alternative (menu)
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Allarga colonna' }).click()
  await expect.poll(() => html(page)).toMatch(/<td width="\d+"><p>b<\/p>/)
})

test('Backspace/Delete at the table border never merge text into the table', async ({ page }) => {
  await page.keyboard.type('dopo')
  await page.keyboard.press('Home')
  await insertTable(page, '1', '1', false)
  await page.keyboard.type('x')
  const before = T('<tr><td><p>x</p></td></tr>') + '<p>dopo</p>'
  expect(await html(page)).toBe(before)
  // Delete at the end of the cell
  await page.keyboard.press('Delete')
  expect(await html(page)).toBe(before)
  // Backspace at the start of the paragraph after the table
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe(before)
  await page.keyboard.type('!')
  expect(await html(page)).toBe(T('<tr><td><p>x</p></td></tr>') + '<p>!dopo</p>')
})
