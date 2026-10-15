import { expect, test, type Browser, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const panel = (page: Page) => page.getByRole('region', { name: 'Commenti' })

async function comment(page: Page, text: string) {
  await toolbar(page).getByRole('button', { name: 'Commenta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Commenta' })
  await dialog.getByLabel('Commento').fill(text)
  await dialog.getByRole('button', { name: 'Aggiungi commento' }).click()
  await expect(dialog).toBeHidden()
}

test.describe('one user', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await editor(page).click()
    await page.keyboard.type('Il preventivo va rivisto entro venerdì')
    // select "preventivo"
    await page.keyboard.press('Home')
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight')
  })

  test('comment, reply, resolve, reopen, delete; never in the exported HTML', async ({ page }) => {
    await comment(page, 'Controlla le cifre')
    await expect(editor(page).locator('.scriba-comment')).toHaveText('preventivo')
    const thread = panel(page).getByRole('article', { name: 'Commento di Tu' })
    await expect(thread.getByRole('button', { name: '“preventivo”' })).toBeVisible()
    await expect(thread.getByText('Controlla le cifre')).toBeVisible()
    expect(await html(page)).toBe('<p>Il preventivo va rivisto entro venerdì</p>')
    // reply
    await thread.getByRole('textbox', { name: 'Rispondi…' }).fill('Fatto, tutto ok')
    await thread.getByRole('button', { name: 'Rispondi', exact: true }).click()
    await expect(thread.getByText('Fatto, tutto ok')).toBeVisible()
    // resolve: the highlight goes, the thread hides
    await thread.getByRole('button', { name: 'Risolvi' }).click()
    await expect(editor(page).locator('.scriba-comment')).toHaveCount(0)
    await expect(panel(page).getByText('Nessun commento')).toBeVisible()
    await panel(page).getByLabel('Mostra risolti').check()
    await panel(page).getByRole('button', { name: 'Riapri' }).click()
    await expect(editor(page).locator('.scriba-comment')).toHaveText('preventivo')
    await panel(page).getByRole('button', { name: 'Elimina discussione' }).click()
    await expect(panel(page).getByText('Nessun commento')).toBeVisible()
    await expect(editor(page).locator('.scriba-comment-anchor')).toHaveCount(0)
  })

  test('clicking the quote selects the text; the cursor in the text activates the thread', async ({
    page,
  }) => {
    await comment(page, 'nota')
    await page.keyboard.press('End')
    await expect(panel(page).locator('.scriba-thread-active')).toHaveCount(0)
    await panel(page).getByRole('button', { name: '“preventivo”' }).click()
    await expect(editor(page)).toBeFocused()
    await expect(panel(page).locator('.scriba-thread-active')).toHaveCount(1)
    await page.keyboard.type('X') // the selection was the commented word
    expect(await html(page)).toBe('<p>Il X va rivisto entro venerdì</p>')
  })

  test('Ctrl+Alt+M opens the dialog; an empty comment is refused', async ({ page }) => {
    await page.keyboard.press('Control+Alt+m')
    const dialog = page.getByRole('dialog', { name: 'Commenta' })
    await expect(dialog.getByLabel('Commento')).toBeFocused()
    await dialog.getByRole('button', { name: 'Aggiungi commento' }).click()
    await expect(dialog.getByText('Scrivi prima un commento')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(editor(page)).toBeFocused()
  })
})

async function join(browser: Browser, doc: string, token: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await page.goto(`/?collab=${doc}&token=${token}`)
  await expect(page.locator('.scriba-collab-status')).toHaveText('Online')
  return { page, context }
}

test('two users: the author is set by the server, replies arrive live', async ({
  browser,
  browserName,
}) => {
  const doc = `comments-${browserName}-${Date.now()}`
  const anna = await join(browser, doc, 'tok-anna')
  const bruno = await join(browser, doc, 'tok-bruno')
  await editor(anna.page).click()
  await anna.page.keyboard.type('testo condiviso')
  await anna.page.keyboard.press('Shift+Home')
  await comment(anna.page, 'Va bene?')
  const thread = panel(bruno.page).getByRole('article', { name: 'Commento di Anna' })
  await expect(thread.getByText('Va bene?')).toBeVisible()
  await expect(editor(bruno.page).locator('.scriba-comment')).toHaveText('testo condiviso')
  await thread.getByRole('textbox', { name: 'Rispondi…' }).fill('Sì')
  await thread.getByRole('button', { name: 'Rispondi', exact: true }).click()
  await expect(panel(anna.page).getByText('Sì', { exact: true })).toBeVisible()
  await expect(panel(anna.page).locator('strong', { hasText: 'Bruno' })).toBeVisible()
  await anna.context.close()
  await bruno.context.close()
})
