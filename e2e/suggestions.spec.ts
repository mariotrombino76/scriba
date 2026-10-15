import { expect, test, type Browser, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const panel = (page: Page) => page.getByRole('region', { name: 'Commenti' })
const toggle = (page: Page) => toolbar(page).getByRole('button', { name: 'Proponi modifiche' })

test('suggest: insert, strike, replace; structural edits refused; accept and reject', async ({
  page,
}) => {
  await page.goto('/')
  await editor(page).click()
  await page.keyboard.type('Il gatto dorme')
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  await editor(page).focus()
  // proposed insertion
  await page.keyboard.type(' sul divano')
  await expect(editor(page).locator('ins.scriba-suggest-insert')).toHaveText(' sul divano')
  // Backspace on existing text strikes it (it stays)
  await page.keyboard.press('Home')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight') // "gatto"
  await page.keyboard.type('cane')
  await expect(editor(page).locator('del.scriba-suggest-delete')).toHaveText('gatto')
  await expect(editor(page).locator('ins.scriba-suggest-insert').first()).toHaveText('cane')
  // Enter (a new paragraph) is refused while suggesting, with a message
  await page.keyboard.press('Enter')
  await expect(
    page.getByText('In modalità revisione si può modificare solo il testo'),
  ).toBeAttached()
  // the panel lists the proposals with their author
  const list = panel(page).locator('.scriba-suggestion')
  await expect(list).toHaveCount(2)
  await expect(list.nth(0)).toContainText('Sostituire «gatto» con «cane»')
  await expect(list.nth(0)).toContainText('Tu')
  await expect(list.nth(1)).toContainText('Inserire « sul divano»')
  // the exported HTML has no suggestion markup
  expect(await html(page)).toBe('<p>Il gattocane dorme sul divano</p>')
  await list.nth(0).getByRole('button', { name: 'Accetta' }).click()
  await list.nth(0).getByRole('button', { name: 'Rifiuta' }).click()
  await expect(list).toHaveCount(0)
  expect(await html(page)).toBe('<p>Il cane dorme</p>')
  // Ctrl+Z brings the proposal back
  await page.keyboard.press('Control+z')
  await expect(editor(page).locator('ins.scriba-suggest-insert')).toHaveText(' sul divano')
})

test('accept all / reject all; turning the mode off edits normally again', async ({ page }) => {
  await page.goto('/')
  await editor(page).click()
  await page.keyboard.type('uno')
  await toggle(page).click()
  await editor(page).focus()
  await page.keyboard.type(' due')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Home')
  await page.keyboard.press('Delete') // strikes "u"
  await panel(page).getByRole('button', { name: 'Rifiuta tutte' }).click()
  expect(await html(page)).toBe('<p>uno</p>')
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  await editor(page).focus()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('normale')
  expect(await html(page)).toBe('<p>uno</p><p>normale</p>')
  await expect(editor(page).locator('ins, del')).toHaveCount(0)
})

async function join(browser: Browser, doc: string, token: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await page.goto(`/?collab=${doc}&token=${token}`)
  await expect(page.locator('.scriba-collab-status')).toHaveText('Online')
  return { page, context }
}

test('two users: Anna suggests, Bruno sees her name and accepts', async ({
  browser,
  browserName,
}) => {
  const doc = `suggest-${browserName}-${Date.now()}`
  const anna = await join(browser, doc, 'tok-anna')
  const bruno = await join(browser, doc, 'tok-bruno')
  await editor(anna.page).click()
  await anna.page.keyboard.type('base')
  await expect.poll(() => html(bruno.page)).toBe('<p>base</p>')
  await toggle(anna.page).click()
  await editor(anna.page).focus()
  await anna.page.keyboard.press('End')
  await anna.page.keyboard.type(' nuova')
  const item = panel(bruno.page).locator('.scriba-suggestion')
  await expect(item).toContainText('Inserire « nuova»')
  await expect(item.locator('strong')).toHaveText('Anna')
  await item.getByRole('button', { name: 'Accetta' }).click()
  await expect(editor(anna.page).locator('ins')).toHaveCount(0)
  await expect.poll(() => html(anna.page)).toBe('<p>base nuova</p>')
  await anna.context.close()
  await bruno.context.close()
})
