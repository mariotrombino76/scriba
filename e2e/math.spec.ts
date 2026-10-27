import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(source: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((data) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (t: string) => data[t] ?? '' },
    })
    document.querySelector('[role=textbox]')!.dispatchEvent(event)
  }, data)
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

test('Inserisci ▸ Formula: LaTeX with a live preview, MathML in the editor and the HTML', async ({
  page,
}) => {
  await setHTML(page, '<p>Area: </p>')
  await editor(page).getByText('Area:').click()
  await page.keyboard.press('End')
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Inserisci' })
    .click()
  await page
    .getByRole('menu', { name: 'Inserisci' })
    .getByRole('menuitem', { name: 'Formula' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Inserisci formula' })
  const source = dialog.getByRole('textbox', { name: 'Formula in LaTeX' })
  await expect(source).toBeFocused()
  await source.fill('\\pi r^2')
  await expect(dialog.locator('.scriba-math-preview math msup')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  await expect(dialog).toHaveCount(0)
  const formula = editor(page).getByRole('math', { name: 'Formula: \\pi r^2' })
  await expect(formula).toBeVisible()
  expect(await formula.locator('math').evaluate((m) => m.namespaceURI)).toBe(
    'http://www.w3.org/1998/Math/MathML',
  )
  await expect
    .poll(() => html(page))
    .toMatch(
      /^<p>Area:<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"><semantics>.*<annotation encoding="application\/x-tex">\\pi r\^2<\/annotation><\/semantics><\/math><\/p>$/,
    )

  // double-click: edit, and put it on its own line
  await formula.dblclick()
  const edit = page.getByRole('dialog', { name: 'Modifica formula' })
  await expect(edit.getByRole('textbox', { name: 'Formula in LaTeX' })).toHaveValue('\\pi r^2')
  await edit.getByRole('textbox', { name: 'Formula in LaTeX' }).fill('A = \\pi r^2')
  await edit.getByRole('checkbox', { name: 'Su una riga a sé' }).check()
  await edit.getByRole('button', { name: 'Salva' }).click()
  await expect.poll(() => html(page)).toContain('display="block"')
  await expect
    .poll(() => html(page))
    .toContain('<annotation encoding="application/x-tex">A = \\pi r^2</annotation>')
})

test('a formula pasted from a web page keeps its LaTeX; its own MathML is not kept', async ({
  page,
}) => {
  // Chromium logs a CSP report for on* in the inert parsing document; nothing runs (__xss)
  const errors = (page as unknown as { errors: string[] }).errors
  page.on('console', () => {
    for (let i = errors.length - 1; i >= 0; i--)
      if (/^Executing inline event handler violates/.test(errors[i]!)) errors.splice(i, 1)
  })
  await paste(page, {
    'text/html':
      '<p>Energia: <math><semantics><mrow><mi onclick="window.__xss=1">FALSO</mi></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math></p>',
  })
  await expect
    .poll(() => html(page))
    .toContain('<annotation encoding="application/x-tex">E = mc^2</annotation>')
  expect(await html(page)).not.toContain('FALSO')
  await expect(editor(page).getByRole('math', { name: 'Formula: E = mc^2' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await page.evaluate(() => {
    const list = (window as unknown as { scriba: Scriba }).scriba.cspViolations
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i] === 'script-src-attr: inline') list.splice(i, 1)
  })
})
