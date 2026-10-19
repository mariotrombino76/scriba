import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(source: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
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
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

/** Selects the whole first paragraph and opens the AI menu. */
async function selectAndAsk(page: Page, text: string) {
  await setHTML(page, `<p>${text}</p>`)
  await editor(page).getByText(text).click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.press('Control+j')
  await expect(menu(page)).toBeVisible()
}

test('Estrai le attività: tasks appear one by one, Accept, one undo step', async ({ page }) => {
  await selectAndAsk(page, 'Chiamare Anna, inviare il report e prenotare la sala')
  await menu(page).getByRole('button', { name: 'Estrai le attività' }).click()
  await expect(bar(page).getByRole('status')).toHaveText('Risposta pronta: accettala o scartala')
  // drawn by the task component (Vue node view), after the selection
  await expect(editor(page).getByRole('checkbox')).toHaveCount(3)
  await bar(page).getByRole('button', { name: 'Accetta' }).click()
  expect(await html(page)).toBe(
    '<p>Chiamare Anna, inviare il report e prenotare la sala</p>' +
      '<div class="scriba-task" data-task="" data-done="false">Chiamare Anna</div>' +
      '<div class="scriba-task" data-task="" data-done="false">inviare il report</div>' +
      '<div class="scriba-task" data-task="" data-done="false">prenotare la sala</div>',
  )
  await editor(page).focus()
  await page.keyboard.press('Control+z')
  await expect
    .poll(() => html(page))
    .toBe('<p>Chiamare Anna, inviare il report e prenotare la sala</p>')
})

test('Crea una tabella: a real table with header row; Discard puts things back', async ({
  page,
}) => {
  await selectAndAsk(page, 'latte, pane, uova')
  await menu(page).getByRole('button', { name: 'Crea una tabella' }).click()
  await expect(bar(page).getByRole('status')).toHaveText('Risposta pronta: accettala o scartala')
  const table = editor(page).getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText(['N.', 'Voce'])
  await expect(table.getByRole('row')).toHaveCount(4)
  await bar(page).getByRole('button', { name: 'Scarta' }).click()
  expect(await html(page)).toBe('<p>latte, pane, uova</p>')
})

test('Metti in un riquadro replaces the selection with a callout', async ({ page }) => {
  await selectAndAsk(page, 'Attenzione alla scadenza')
  await menu(page).getByRole('button', { name: 'Metti in un riquadro' }).click()
  await expect(bar(page).getByRole('status')).toHaveText('Risposta pronta: accettala o scartala')
  await bar(page).getByRole('button', { name: 'Accetta' }).click()
  await expect
    .poll(() => html(page))
    .toMatch(/^<aside[^>]*data-callout="info"[^>]*><p>Attenzione alla scadenza<\/p><\/aside>/)
})

test('hostile blocks: image, handlers and unknown types never reach the document', async ({
  page,
}) => {
  await selectAndAsk(page, 'ATTACCO, uno')
  await menu(page).getByRole('button', { name: 'Estrai le attività' }).click()
  await expect(bar(page).getByRole('status')).toHaveText('Risposta pronta: accettala o scartala')
  const out = await html(page)
  expect(out).not.toMatch(/<img|<script|onclick|evil\.example/)
  expect(out).toContain('data-task="" data-done="false">uno</div>')
})
