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

async function editMenu(page: Page, entry: string) {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Modifica' })
    .click()
  await page
    .getByRole('menu', { name: 'Modifica' })
    .getByRole('menuitem', { name: entry, exact: true })
    .click()
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

test('Modifica menu like TinyMCE; read-only: only copy', async ({ page }) => {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Modifica' })
    .click()
  const menu = page.getByRole('menu', { name: 'Modifica' })
  await expect(menu.getByRole('menuitem')).toHaveText([
    'AnnullaCtrl+Z',
    'RipetiCtrl+Y',
    'TagliaCtrl+X',
    'CopiaCtrl+C',
    'IncollaCtrl+V',
    'Incolla come testoCtrl+Maiusc+V',
    'Seleziona tuttoCtrl+A',
    /^Trova e sostituisci/,
  ])
  await page.keyboard.press('Escape')
  await setHTML(page, '<p>abc</p>')
  await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.setReadOnly(true))
  // select "abc" (no keyboard editing read-only): a DOM range, as a mouse drag would
  await editor(page).evaluate((el) => {
    el.focus()
    getSelection()!.selectAllChildren(el.querySelector('p')!)
  })
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Modifica' })
    .click()
  for (const [name, disabled] of [
    ['Taglia', 'true'],
    ['Copia', 'false'],
    ['Incolla', 'true'],
  ] as const)
    await expect(menu.getByRole('menuitem', { name, exact: true })).toHaveAttribute(
      'aria-disabled',
      disabled,
    )
})

test('the browser refuses to read the clipboard: a message says to use Ctrl+V', async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: () => Promise.reject(new DOMException('no', 'NotAllowedError')) },
    })
  })
  await editMenu(page, 'Incolla')
  const dialog = page.getByRole('dialog', { name: 'Appunti' })
  await expect(dialog).toContainText('Usa Ctrl+V.')
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(editor(page)).toBeFocused()
})

test('copy and cut from the menu: the editor fills the copy event from the serializer', async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as unknown as { copied: string[] }
    w.copied = []
    for (const type of ['copy', 'cut'])
      window.addEventListener(type, (e) => {
        const data = (e as ClipboardEvent).clipboardData!
        w.copied.push(`${type}|${data.getData('text/html')}|${data.getData('text/plain')}`)
      })
  })
  await setHTML(page, '<p>uno <strong>due</strong></p>')
  await editor(page).getByText('due').dblclick()
  await editMenu(page, 'Copia')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await editMenu(page, 'Taglia')
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
    'copy|<strong>due</strong>|due', // inside one paragraph: inline content
    'cut|uno|uno',
  ])
  await expect.poll(() => html(page)).toBe('<p> <strong>due</strong></p>')
})

test('paste from the menu: hostile clipboard HTML is sanitized, nothing runs', async ({ page }) => {
  // Chromium logs a CSP report as soon as an inert DOMParser document contains an on*
  // attribute, although nothing runs (see file.spec); the alert probe proves it.
  const errors = (page as unknown as { errors: string[] }).errors
  page.on('console', () => {
    for (let i = errors.length - 1; i >= 0; i--)
      if (/^Executing inline event handler violates/.test(errors[i]!)) errors.splice(i, 1)
  })
  // the clipboard as the browser hands it over (after its permission prompt)
  await page.evaluate(() => {
    const w = window as unknown as { alerts: number }
    w.alerts = 0
    window.alert = () => void w.alerts++
    const data: Record<string, string> = {
      'text/html':
        '<p>ok<img src=x onerror="alert(1)"><a href="javascript:alert(1)">l</a><script>alert(1)</script></p>',
      'text/plain': 'ok l',
    }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => [
          {
            types: Object.keys(data),
            getType: async (type: string) => new Blob([data[type]!], { type }),
          },
        ],
      },
    })
  })
  await setHTML(page, '<p>x</p>')
  await editor(page).getByText('x').click()
  await page.keyboard.press('End')
  await editMenu(page, 'Incolla')
  await expect.poll(() => html(page)).toBe('<p>xok<img src="x" alt="">l</p>')
  expect(await page.evaluate(() => (window as unknown as { alerts: number }).alerts)).toBe(0)
  // as text: only the plain text
  await editMenu(page, 'Incolla come testo')
  await expect.poll(() => html(page)).toBe('<p>xok<img src="x" alt="">lok l</p>')
  await page.evaluate(() => {
    const list = (window as unknown as { scriba: Scriba }).scriba.cspViolations
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i] === 'script-src-attr: inline') list.splice(i, 1)
  })
})
