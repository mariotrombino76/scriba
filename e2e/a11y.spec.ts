import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Automatic WCAG 2.2 AA check (axe-core) of the whole interface: the editor,
 * every menu of the menu bar, every dialog they open, the context menu, the
 * bubble menu, the dark theme and the other pages (inline, classic script,
 * React). It does not replace a check with a screen reader, it catches
 * regressions: names, roles, contrast, target sizes, focusable scrolling areas.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
// About the test pages, not the editor: they have no <h1> and no landmarks, and
// their own small buttons (load, read-only) stand for the integrator's page.
const PAGE_RULES = ['region', 'page-has-heading-one', 'landmark-one-main']
const PAGE_BUTTONS = ['#load', '#app > div > button']

type Found = { state: string; rule: string; nodes: string[] }

async function audit(page: Page, state: string, found: Found[]) {
  let builder = new AxeBuilder({ page }).withTags(TAGS).disableRules(PAGE_RULES)
  for (const selector of PAGE_BUTTONS) builder = builder.exclude(selector)
  const result = await builder.analyze()
  for (const v of result.violations)
    found.push({ state, rule: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })
}

const CONTENT =
  '<h2>Titolo</h2><p>Testo <a href="https://example.com">link</a> e altro testo da selezionare.</p>' +
  '<ul><li><p>uno</p></li></ul><table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr>' +
  '<tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table><blockquote><p>cit</p></blockquote>' +
  '<pre><code>let x = 1</code></pre>'

// entries that need a file, leave or replace the page
const SKIP = /Apri|Nuovo|Stampa|Esporta|Importa|Schermo intero|Salva/

const setContent = (page: Page) =>
  page.evaluate(
    (html) => (window as unknown as { scriba: { setHTML(s: string): void } }).scriba.setHTML(html),
    CONTENT,
  )

test('the editor, its menus and dialogs, light and dark', async ({ page }) => {
  test.setTimeout(180_000)
  const found: Found[] = []
  await page.goto('/')
  const editor = page.getByRole('textbox', { name: 'Editor di prova' })
  await setContent(page)
  const text = editor.getByText('Testo')
  await text.click()
  await audit(page, 'editor', found)
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  await expect(page.getByRole('toolbar', { name: 'Formattazione della selezione' })).toBeVisible()
  await audit(page, 'bubble menu', found)
  await text.click({ button: 'right' })
  await expect(page.getByRole('menu', { name: 'Menu contestuale' })).toBeVisible()
  await audit(page, 'context menu', found)
  await page.keyboard.press('Escape')

  const menubar = page.getByRole('menubar', { name: 'Menu' })
  const tops = await menubar.getByRole('menuitem').allTextContents()
  expect(tops.length).toBeGreaterThan(5)
  let dialogs = 0
  for (const top of tops) {
    await text.click()
    await menubar.getByRole('menuitem', { name: top }).click()
    const menu = page.getByRole('menu', { name: top })
    await expect(menu).toBeVisible()
    await audit(page, `menu ${top}`, found)
    const names = await menu.getByRole('menuitem').evaluateAll((els) =>
      els
        .filter((e) => e.getAttribute('aria-disabled') !== 'true')
        .map(
          (e) =>
            e.getAttribute('aria-label') ??
            e.querySelector('.scriba-toolbar-menu-text')?.textContent ??
            '',
        )
        .filter((name, i, all) => name && all.indexOf(name) === i),
    )
    const hasPopup = await menu
      .locator('[aria-haspopup]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent ?? ''))
    await page.keyboard.press('Escape')
    // every entry that opens a dialog (the others run and the content is put back)
    for (const name of names.filter(
      (n) => !SKIP.test(n) && !hasPopup.some((h) => h.startsWith(n)),
    )) {
      await text.click()
      await menubar.getByRole('menuitem', { name: top }).click()
      await page
        .getByRole('menu', { name: top })
        .getByRole('menuitem', { name, exact: true })
        .click()
      const dialog = page.locator('dialog[open]')
      try {
        await dialog.waitFor({ timeout: 500 })
      } catch {
        await page.keyboard.press('Escape')
        await setContent(page)
        continue
      }
      await audit(page, `${top} ▸ ${name}`, found)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await setContent(page)
      dialogs++
    }
  }
  expect(dialogs).toBeGreaterThan(10)

  await page.emulateMedia({ colorScheme: 'dark' })
  await text.click()
  await audit(page, 'dark theme', found)
  expect(found).toEqual([])
})

for (const url of ['/inline.html', '/cdn.html', '/react.html'])
  test(`page ${url}`, async ({ page }) => {
    const found: Found[] = []
    await page.goto(url)
    await page.getByRole('textbox').first().click()
    await audit(page, url, found)
    expect(found).toEqual([])
  })
