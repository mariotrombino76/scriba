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

async function openSizeDialog(page: Page) {
  await toolbar(page).getByRole('button', { name: 'Inserisci tabella', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Altre dimensioni…' }).click()
}

async function insertTable(page: Page, rows: string, cols: string, header = true) {
  await openSizeDialog(page)
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

const T0 = (body: string) => `<table><tbody>${body}</tbody></table>`
/** A table at the end of the document: a paragraph always follows it. */
const T = (body: string) => T0(body) + '<p></p>'

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
  await openSizeDialog(page)
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
  // each structural change is its own undo step (never merged with the typing before it)
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toContain('<p>e</p>')
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toContain('<td><p></p></td></tr></tbody>') // column back
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
  const before = T0('<tr><td><p>x</p></td></tr>') + '<p>dopo</p>'
  expect(await html(page)).toBe(before)
  // Delete at the end of the cell
  await page.keyboard.press('Delete')
  expect(await html(page)).toBe(before)
  // Backspace at the start of the paragraph after the table
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe(before)
  // (the table is now selected: see the next test)
  await expect(editor(page).locator('table.scriba-selected-node')).toHaveCount(1)
})

/** Synthetic copy: returns what the editor put on the clipboard. */
function copy(page: Page) {
  return page.evaluate(() => {
    const data: Record<string, string> = {}
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { setData: (t: string, v: string) => (data[t] = v), getData: () => '' },
    })
    document.querySelector('[role=textbox]')!.dispatchEvent(event)
    return data
  })
}

async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((data) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (t: string) => data[t] ?? '', files: [] },
    })
    document.querySelector('[role=textbox]')!.dispatchEvent(event)
  }, data)
}

test('Backspace after the table selects it, a second Backspace deletes it', async ({ page }) => {
  await page.keyboard.type('dopo')
  await page.keyboard.press('Home')
  await insertTable(page, '1', '2', false)
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await expect(editor(page).locator('table.scriba-selected-node')).toHaveCount(1)
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe('<p>dopo</p>')
})

test('selecting every cell and pressing Delete deletes the table', async ({ page }) => {
  await fill2x2(page)
  await page.keyboard.press('Shift+ArrowLeft') // a → over "d" text, then cells
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(page.locator('.scriba-selected-cell')).toHaveCount(4)
  await page.keyboard.press('Delete')
  expect(await html(page)).not.toContain('<table>')
})

test('arrows leave a table at the start or end of the document', async ({ page }) => {
  await insertTable(page, '1', '1', false)
  // the document never ends with a table: there is a paragraph below
  expect(await html(page)).toBe(T('<tr><td><p></p></td></tr>'))
  await page.keyboard.press('ArrowUp')
  await page.keyboard.type('sopra')
  expect(await html(page)).toBe('<p>sopra</p>' + T('<tr><td><p></p></td></tr>'))
})

test('copy cells and paste them into another place of the table', async ({ page }) => {
  await fill2x2(page)
  // select a…b
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.scriba-selected-cell')).toHaveCount(2)
  const data = await copy(page)
  expect(data['text/html']).toBe(
    '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
  )
  // paste into "d": fills d and a new column to its right
  await editor(page).locator('td').nth(3).click()
  await paste(page, data)
  expect(await html(page)).toBe(
    T(
      '<tr><td><p>a</p></td><td><p>b</p></td><td><p></p></td></tr>' +
        '<tr><td><p>c</p></td><td><p>a</p></td><td><p>b</p></td></tr>',
    ),
  )
})

test('size picker: hover highlights the area, click inserts; keyboard works too', async ({
  page,
}) => {
  await toolbar(page).getByRole('button', { name: 'Inserisci tabella', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Inserisci tabella' })
  await menu.getByRole('menuitem', { name: 'Tabella 2 × 3', exact: true }).hover()
  await expect(menu.locator('.scriba-size-on')).toHaveCount(6)
  await expect(menu.getByText('2 × 3')).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Tabella 2 × 3', exact: true }).click()
  expect(await html(page)).toBe(
    T(
      '<tr><th><p></p></th><th><p></p></th><th><p></p></th></tr>' +
        '<tr><td><p></p></td><td><p></p></td><td><p></p></td></tr>',
    ),
  )
  // keyboard: below the table, open the picker and choose 2 × 2 with the arrows
  await page.keyboard.press('Control+End')
  const button = toolbar(page).getByRole('button', { name: 'Inserisci tabella', exact: true })
  await button.focus()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Tabella 1 × 1', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Tabella 2 × 2', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(editor(page).locator('table')).toHaveCount(2)
})

test('cell properties: background, vertical alignment, border on the selected cells', async ({
  page,
}) => {
  await fill2x2(page)
  await page.keyboard.press('Shift+Tab') // c
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight') // c…d selected
  await expect(page.locator('.scriba-selected-cell')).toHaveCount(2)
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Proprietà cella…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Proprietà cella' })
  const bg = dialog.getByRole('group', { name: 'Colore di sfondo' })
  await expect(bg.getByRole('radio', { name: 'Nessuno' })).toBeChecked()
  await bg.getByRole('textbox', { name: 'Codice colore (#rrggbb)' }).fill('#ffee00')
  await expect(bg.getByRole('radio', { name: 'Personalizzato' })).toBeChecked()
  await dialog.getByRole('group', { name: 'Allineamento verticale' }).getByLabel('In basso').check()
  await dialog.getByLabel('Spessore (px)').fill('2')
  await dialog.getByRole('button', { name: 'Salva' }).click()
  await expect(dialog).toBeHidden()
  const cell =
    '<td style="background-color: #ffee00; vertical-align: bottom; border-width: 2px; border-style: solid">'
  expect(await html(page)).toBe(
    T(
      '<tr><td><p>a</p></td><td><p>b</p></td></tr>' +
        `<tr>${cell}<p>c</p></td>${cell}<p>d</p></td></tr>`,
    ),
  )
  // invalid width: error, nothing changes
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Proprietà cella…' }).click()
  await dialog.getByLabel('Spessore (px)').fill('50')
  await dialog.getByRole('button', { name: 'Salva' }).click()
  await expect(dialog.getByText('Usa uno spessore da 0 a 10 pixel')).toBeVisible()
  await dialog.getByLabel('Spessore (px)').fill('2')
  await bg.getByRole('textbox', { name: 'Codice colore (#rrggbb)' }).fill('url(x)')
  await dialog.getByRole('button', { name: 'Salva' }).click()
  await expect(dialog.getByText('Colore non valido: usa il formato #rrggbb')).toBeVisible()
  await bg.getByRole('radio', { name: 'Blu' }).check()
  await dialog.getByRole('button', { name: 'Salva' }).click()
  await expect(dialog).toBeHidden()
  expect(await html(page)).toContain('background-color: #dbeafe')
})

test('table properties: caption, alignment, border on table and cells', async ({ page }) => {
  await insertTable(page, '1', '2', false)
  await tableMenu(page).click()
  await page.getByRole('menuitem', { name: 'Proprietà tabella…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Proprietà tabella' })
  await expect(dialog.getByLabel('Didascalia')).toBeFocused()
  await dialog.getByLabel('Didascalia').fill('  Vendite <b>2026</b> ')
  await dialog
    .getByRole('group', { name: 'Allineamento', exact: true })
    .getByLabel('Centro')
    .check()
  await dialog.getByLabel('Spessore (px)').fill('1')
  await dialog.getByRole('group', { name: 'Stile' }).getByLabel('Tratteggiato').check()
  await dialog.getByRole('button', { name: 'Salva' }).click()
  const cell = '<td style="border-width: 1px; border-style: dashed"><p></p></td>'
  expect(await html(page)).toBe(
    '<table style="margin-left: auto; margin-right: auto; border-width: 1px; border-style: dashed">' +
      '<caption>Vendite &lt;b&gt;2026&lt;/b&gt;</caption>' +
      `<tbody><tr>${cell}${cell}</tr></tbody></table><p></p>`,
  )
  await expect(editor(page).locator('caption')).toHaveText('Vendite <b>2026</b>')
})
