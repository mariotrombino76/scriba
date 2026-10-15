import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const menu = (page: Page) => page.getByRole('dialog', { name: 'Assistente AI' })
const bar = (page: Page) => page.getByRole('group', { name: 'Assistente AI' })

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('dialog', (d) => errors.push(`dialog: ${d.message()}`)) // an alert() would mean XSS
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

test('improve the selection: streaming, edits blocked meanwhile, Accept, one undo step', async ({
  page,
}) => {
  await page.keyboard.type('testo da sistemare')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('Control+j')
  await expect(menu(page)).toBeVisible()
  await expect(menu(page).getByRole('textbox', { name: 'Chiedi all’AI…' })).toBeFocused()
  await expect(menu(page).getByText('viene inviato al servizio di AI')).toBeVisible()
  await menu(page).getByRole('button', { name: 'Migliora il testo' }).click()
  await expect(menu(page)).toBeHidden()
  await expect(bar(page).getByRole('status')).toHaveText('L’AI sta scrivendo…')
  await expect(bar(page).getByRole('button', { name: 'Stop' })).toBeFocused()
  await expect(editor(page).locator('.scriba-ai-pending')).toBeVisible()
  await expect(bar(page).getByRole('status')).toHaveText('Risposta pronta: accettala o scartala')
  await expect(bar(page).getByRole('button', { name: 'Accetta' })).toBeFocused()
  expect(await html(page)).toBe('<p>Un testo più chiaro e scorrevole</p>')
  await page.keyboard.press('Enter') // Accept
  await expect(bar(page)).toBeHidden()
  await expect(editor(page)).toBeFocused()
  await expect(editor(page).locator('.scriba-ai-pending')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  expect(await html(page)).toBe('<p>testo da sistemare</p>')
})

test('continue at the cursor with formatting; Ctrl+Enter accepts', async ({ page }) => {
  await page.keyboard.type('C’era una volta')
  await page.keyboard.press('Control+j')
  // actions needing a selection are disabled without one
  await expect(menu(page).getByRole('button', { name: 'Migliora il testo' })).toBeDisabled()
  await menu(page).getByRole('button', { name: 'Continua a scrivere' }).click()
  await expect(bar(page).getByRole('status')).toHaveText('Risposta pronta: accettala o scartala')
  await editor(page).focus()
  await page.keyboard.press('Control+Enter')
  expect(await html(page)).toBe(
    '<p>C’era una volta e vissero tutti <strong>felici</strong> e contenti.</p>',
  )
})

test('typing is refused while the AI writes; Escape stops, Escape again discards', async ({
  page,
}) => {
  await page.keyboard.type('base ')
  await page.keyboard.press('Control+j')
  await menu(page).getByRole('textbox', { name: 'Chiedi all’AI…' }).fill('lento')
  await page.keyboard.press('Enter')
  await expect(bar(page).getByRole('status')).toHaveText('L’AI sta scrivendo…')
  await editor(page).focus()
  await page.keyboard.type('XYZ')
  await page.keyboard.press('Escape') // stop
  await expect(bar(page).getByRole('status')).toHaveText(
    'Interrotta: accetta quanto scritto o scartalo',
  )
  expect(await html(page)).not.toContain('XYZ')
  await editor(page).focus()
  await page.keyboard.press('Escape') // discard
  await expect(bar(page)).toBeHidden()
  expect(await html(page)).toBe('<p>base </p>')
})

test('a hostile answer is cleaned like a paste and never runs', async ({ page }) => {
  await page.keyboard.press('Control+j')
  await menu(page).getByRole('textbox', { name: 'Chiedi all’AI…' }).fill('attacco')
  await page.keyboard.press('Enter')
  await expect(bar(page).getByRole('status')).toHaveText('Risposta pronta: accettala o scartala')
  await bar(page).getByRole('button', { name: 'Accetta' }).click()
  const out = await html(page)
  expect(out).toContain('<strong>fatto</strong>')
  expect(out).not.toMatch(/<script|<img|href="javascript/)
  await page.waitForTimeout(200)
})

test('errors: message, Try again focused; Discard leaves the document as it was', async ({
  page,
}) => {
  await page.keyboard.type('intatto')
  await page.keyboard.press('Control+j')
  await menu(page).getByRole('textbox', { name: 'Chiedi all’AI…' }).fill('errore')
  await page.keyboard.press('Enter')
  await expect(bar(page).getByRole('status')).toHaveText(
    'L’AI non ha potuto rispondere. Riprova più tardi.',
  )
  await expect(bar(page).getByRole('button', { name: 'Riprova' })).toBeFocused()
  await expect(bar(page).getByRole('button', { name: 'Accetta' })).toBeHidden()
  await bar(page).getByRole('button', { name: 'Scarta' }).click()
  expect(await html(page)).toBe('<p>intatto</p>')
})

test('the menu closes with Escape and gives the focus back', async ({ page }) => {
  await page.keyboard.press('Control+j')
  await expect(menu(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  await expect(editor(page)).toBeFocused()
})
