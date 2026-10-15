import { expect, test, type Page } from '@playwright/test'

// Whole-editor scenario: text, a table, more text; then Backspace/Delete
// from every border. Text must never end up inside the table (or out of it).

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

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
})

const TABLE =
  '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr>' +
  '<tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>'

/** "Prima" / 2×2 table a b c d / "Dopo", built by typing. */
async function build(page: Page) {
  await page.keyboard.type('Prima')
  await page.keyboard.press('Enter')
  await toolbar(page).getByRole('button', { name: 'Inserisci tabella', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Tabella 2 × 2', exact: true }).click()
  // the size picker makes a header row: turn it off for plain cells
  await toolbar(page).getByRole('button', { name: 'Tabella', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Riga di intestazione' }).click()
  for (const [i, text] of ['a', 'b', 'c', 'd'].entries()) {
    if (i) await page.keyboard.press('Tab')
    await page.keyboard.type(text)
  }
  // leave the table downwards and type below it
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('Dopo')
  expect(await html(page)).toBe(`<p>Prima</p>${TABLE}<p>Dopo</p>`)
}

/** Puts the cursor at `offset` in the paragraph / cell whose text is `text`. */
async function caretIn(page: Page, text: string, offset: number) {
  await page.evaluate(
    ({ text, offset }) => {
      // minimal typed view of the editor objects (the page has no type imports)
      interface PMNode {
        isTextblock: boolean
        textContent: string
        descendants(f: (node: PMNode, pos: number) => boolean): void
        resolve(pos: number): unknown
      }
      interface View {
        state: {
          doc: PMNode
          selection: { constructor: { near(pos: unknown): unknown } }
          tr: { setSelection(sel: unknown): unknown }
        }
        dispatch(tr: unknown): void
        focus(): void
      }
      const view = (window as unknown as { scriba: { view: View } }).scriba.view
      let pos = -1
      view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.isTextblock && node.textContent === text) pos = p + 1 + offset
        return pos < 0
      })
      // Selection.near is static on every selection class
      const near = view.state.selection.constructor.near(view.state.doc.resolve(pos))
      view.dispatch(view.state.tr.setSelection(near))
      view.focus()
    },
    { text, offset },
  )
}

test('build the document by typing', async ({ page }) => {
  await build(page)
})

test('Backspace at the start of the text after the table: the text stays outside', async ({
  page,
}) => {
  await build(page)
  await caretIn(page, 'Dopo', 0)
  await page.keyboard.press('Backspace') // selects the table
  expect(await html(page)).toBe(`<p>Prima</p>${TABLE}<p>Dopo</p>`)
  await page.keyboard.press('ArrowDown') // leave the table selection
  await caretIn(page, 'Dopo', 0)
  await page.keyboard.type('X')
  expect(await html(page)).toBe(`<p>Prima</p>${TABLE}<p>XDopo</p>`)
})

test('Delete at the end of the text before the table: the table stays put', async ({ page }) => {
  await build(page)
  await caretIn(page, 'Prima', 5)
  await page.keyboard.press('Delete') // selects the table
  expect(await html(page)).toBe(`<p>Prima</p>${TABLE}<p>Dopo</p>`)
  await caretIn(page, 'Prima', 5)
  await page.keyboard.type('!')
  expect(await html(page)).toBe(`<p>Prima!</p>${TABLE}<p>Dopo</p>`)
})

test('Delete at the end of the last cell and Backspace at the start of the first: nothing moves', async ({
  page,
}) => {
  await build(page)
  await caretIn(page, 'd', 1)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Delete')
  expect(await html(page)).toBe(`<p>Prima</p>${TABLE}<p>Dopo</p>`)
  await caretIn(page, 'a', 0)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace')
  expect(await html(page)).toBe(`<p>Prima</p>${TABLE}<p>Dopo</p>`)
  // Backspace inside a cell still edits its text
  await caretIn(page, 'b', 1)
  await page.keyboard.press('Backspace')
  await page.keyboard.type('B')
  expect(await html(page)).toContain('<td><p>B</p></td>')
})

test('empty lines next to the table are removed by Backspace/Delete', async ({ page }) => {
  await build(page)
  await caretIn(page, 'Dopo', 0)
  await page.keyboard.press('Enter') // empty line between table and "Dopo"
  await caretIn(page, '', 0)
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe(`<p>Prima</p>${TABLE}<p>Dopo</p>`)
  await caretIn(page, 'Prima', 5)
  await page.keyboard.press('Enter') // empty line between "Prima" and table
  await page.keyboard.press('Delete')
  expect(await html(page)).toBe(`<p>Prima</p>${TABLE}<p>Dopo</p>`)
})

test('second Backspace deletes the table, the texts join normally afterwards', async ({ page }) => {
  await build(page)
  await caretIn(page, 'Dopo', 0)
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe('<p>Prima</p><p>Dopo</p>')
  await page.keyboard.press('Backspace') // now a plain join of two paragraphs
  expect(await html(page)).toBe('<p>PrimaDopo</p>')
})

test('a selection from the text into the table, then Delete: nothing jumps in or out', async ({
  page,
}) => {
  await build(page)
  await caretIn(page, 'Prima', 2)
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Delete')
  const out = await html(page)
  // the table is intact or gone as a whole; "Pri" never lands inside a cell
  expect(out).not.toMatch(/<td><p>Pr/)
  expect(out).not.toMatch(/<p>Pri[a-d]/)
  expect(out.match(/<td>/g)?.length ?? 4).toBe(4)
})

test('select all and Delete empties the document', async ({ page }) => {
  await build(page)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  expect(await html(page)).toBe('<p></p>')
  await page.keyboard.type('nuovo')
  expect(await html(page)).toBe('<p>nuovo</p>')
})
