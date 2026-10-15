import { expect, test, type Browser, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const status = (page: Page) => page.locator('.scriba-collab-status')

/** One user in their own browser context (separate storage, separate connection). */
async function join(browser: Browser, doc: string, token: string) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/?collab=${doc}&token=${token}`)
  return { page, context, errors }
}

let doc = ''
test.beforeEach(({ browserName }) => {
  doc = `e2e-${browserName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
})

test('two people edit the same document and see each other', async ({ browser }) => {
  const anna = await join(browser, doc, 'tok-anna')
  const bruno = await join(browser, doc, 'tok-bruno')
  await expect(status(anna.page)).toHaveText('Online')
  await expect(status(bruno.page)).toHaveText('Online')
  await editor(anna.page).click()
  await anna.page.keyboard.type('Ciao da Anna')
  await expect.poll(() => html(bruno.page)).toBe('<p>Ciao da Anna</p>')
  await editor(bruno.page).click()
  await bruno.page.keyboard.press('End')
  await bruno.page.keyboard.type(' e da Bruno')
  await expect.poll(() => html(anna.page)).toBe('<p>Ciao da Anna e da Bruno</p>')
  // formatting travels too
  await anna.page.keyboard.press('Control+a')
  await anna.page.keyboard.press('Control+b')
  await expect.poll(() => html(bruno.page)).toBe('<p><strong>Ciao da Anna e da Bruno</strong></p>')
  // each one sees the other's cursor with the name given by the server
  await expect(bruno.page.locator('.scriba-collab-name', { hasText: 'Anna' })).toBeVisible()
  await expect(anna.page.locator('.scriba-collab-name', { hasText: 'Bruno' })).toBeVisible()
  expect([...anna.errors, ...bruno.errors]).toEqual([])
  await anna.context.close()
  await bruno.context.close()
})

test('undo only takes back your own changes', async ({ browser }) => {
  const anna = await join(browser, doc, 'tok-anna')
  const bruno = await join(browser, doc, 'tok-bruno')
  await expect(status(anna.page)).toHaveText('Online')
  await expect(status(bruno.page)).toHaveText('Online')
  await editor(anna.page).click()
  await anna.page.keyboard.type('AAA')
  await expect.poll(() => html(bruno.page)).toBe('<p>AAA</p>')
  await editor(bruno.page).click()
  await bruno.page.keyboard.press('End')
  await bruno.page.keyboard.type('BBB')
  await expect.poll(() => html(anna.page)).toBe('<p>AAABBB</p>')
  await anna.page.keyboard.press('Control+z')
  await expect.poll(() => html(anna.page)).toBe('<p>BBB</p>')
  await expect.poll(() => html(bruno.page)).toBe('<p>BBB</p>')
  await anna.context.close()
  await bruno.context.close()
})

test('read-only users follow along but cannot type', async ({ browser }) => {
  const anna = await join(browser, doc, 'tok-anna')
  const guest = await join(browser, doc, 'tok-ospite')
  await expect(status(guest.page)).toHaveText('Sola lettura')
  await expect(editor(guest.page)).toHaveAttribute('contenteditable', 'false')
  await editor(anna.page).click()
  await anna.page.keyboard.type('notizia')
  await expect.poll(() => html(guest.page)).toBe('<p>notizia</p>')
  await editor(guest.page).click()
  await guest.page.keyboard.type('XXX')
  await anna.page.waitForTimeout(300)
  expect(await html(anna.page)).toBe('<p>notizia</p>')
  await anna.context.close()
  await guest.context.close()
})

test('a wrong token: access denied, nothing editable', async ({ browser }) => {
  const intruder = await join(browser, doc, 'tok-falso')
  await expect(status(intruder.page)).toHaveText('Accesso negato')
  await expect(editor(intruder.page)).toHaveAttribute('contenteditable', 'false')
  await intruder.context.close()
})
