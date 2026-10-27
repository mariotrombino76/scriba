// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import {
  EditorState,
  NodeSelection,
  Schema,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
  type Command,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { embedNodes } from '../../embed/src/index.js'
import { imageNodes } from '../../image/src/index.js'
import { linkMarks } from '../../link/src/index.js'
import { listNodes } from '../../list/src/index.js'
import { tableNodes } from '../../table/src/index.js'
import { textStyleMarks, withBlockStyles } from '../../text-style/src/index.js'
import {
  A11Y_CURRENT_CLASS,
  A11Y_RULES,
  a11yChecker,
  a11yCheckerItem,
  a11yIssues,
  checkAccessibility,
  clearIgnoredIssues,
  contrastRatio,
  ignoreIssue,
  isUnhelpfulAlt,
  openA11yDialog,
  suggestColor,
  type A11yIssue,
  type A11yOptions,
  type A11yRepair,
} from '../src/index.js'

const schema = new Schema({
  nodes: withBlockStyles({
    ...basicSchemaSpec.nodes,
    ...imageNodes,
    ...listNodes,
    ...tableNodes,
    ...embedNodes,
  }),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks, ...linkMarks },
})
const t = createTranslator('it')
const en = createTranslator('en')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (state: EditorState) => serializeHTML(state.doc)
const IMG = 'https://x.it/foto/tramonto.jpg'

const check = (source: string, options?: A11yOptions) => checkAccessibility(parse(source), options)
const rules = (source: string, options?: A11yOptions) => check(source, options).map((i) => i.rule)

function stateOf(source: string, options?: A11yOptions) {
  return EditorState.create({ doc: parse(source), plugins: [a11yChecker(options)] })
}

/** Runs a repair's command on a state; returns the new state. */
function exec(state: EditorState, command: Command): EditorState {
  let next: EditorState | null = null
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true)
  return next!
}

function only(source: string, rule: A11yIssue['rule'], options?: A11yOptions) {
  const state = stateOf(source, options)
  const found = a11yIssues(state).filter((i) => i.rule === rule)
  expect(found).toHaveLength(1)
  return { state, issue: found[0]! }
}

const repairOf = <K extends A11yRepair['kind']>(issue: A11yIssue, kind: K) => {
  expect(issue.repair?.kind).toBe(kind)
  return issue.repair as Extract<A11yRepair, { kind: K }>
}

describe('contrast', () => {
  it('computes the WCAG ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })

  it('suggests the closest color with enough contrast, keeping the hue', () => {
    const color = suggestColor('#ff8080', '#ffffff', 4.5)!
    expect(contrastRatio(color, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    // still a red: red channel well above the others
    expect(Number.parseInt(color.slice(1, 3), 16)).toBeGreaterThan(
      Number.parseInt(color.slice(3, 5), 16),
    )
    // light text on a dark background gets lighter
    const light = suggestColor('#555555', '#222222', 4.5)!
    expect(Number.parseInt(light.slice(1, 3), 16)).toBeGreaterThan(0x55)
    // impossible: 21:1 is the maximum
    expect(suggestColor('#777777', '#777777', 22)).toBeNull()
  })
})

describe('checkAccessibility', () => {
  it('finds nothing in a well-made document', () => {
    expect(
      check(
        `<h2>Programma</h2><p>Testo <a href="https://x.it/p">programma della giornata</a>.</p>
         <p><img src="${IMG}" alt="Tramonto sul mare"><img src="${IMG}" alt=""></p>
         <table><caption>Orari</caption><tbody><tr><th>Ora</th><th>Evento</th></tr><tr><td>9</td><td>Apertura</td></tr></tbody></table>`,
      ),
    ).toEqual([])
  })

  it('reports images without alternative text, but not decorative ones', () => {
    const issues = check(`<p><img src="${IMG}"> e <img src="${IMG}" alt=""></p>`)
    expect(issues.map((i) => i.rule)).toEqual(['image-alt'])
    expect(issues[0]).toMatchObject({
      severity: 'error',
      criterion: { id: '1.1.1', level: 'A' },
      target: { kind: 'node', pos: 1 },
    })
  })

  it('reports file names, camera names and generic words as alternative text', () => {
    expect(isUnhelpfulAlt('tramonto.jpg', IMG)).toBe(true)
    expect(isUnhelpfulAlt('IMG_2041', IMG)).toBe(true)
    expect(isUnhelpfulAlt('Immagine', IMG)).toBe(true)
    expect(isUnhelpfulAlt('tramonto', IMG)).toBe(true)
    expect(isUnhelpfulAlt('Tramonto sul mare di Cefalù', IMG)).toBe(false)
    expect(rules(`<p><img src="${IMG}" alt="tramonto.jpg"></p>`)).toEqual(['image-alt-filename'])
  })

  it('gives long alternative texts a hint (limit configurable)', () => {
    const long = 'Una descrizione '.repeat(12)
    const issues = check(`<p><img src="${IMG}" alt="${long}"></p>`)
    expect(issues.map((i) => [i.rule, i.severity])).toEqual([['image-alt-long', 'info']])
    expect(rules(`<p><img src="${IMG}" alt="${long}"></p>`, { maxAltLength: 500 })).toEqual([])
  })

  it('reports links without text, with generic text, and the same link twice', () => {
    expect(rules('<p><a href="https://x.it"><img src="a.png" alt=""></a></p>')).toEqual([
      'link-no-text',
    ])
    // an image still without alt is reported once, by image-alt (never as decorative)
    const issues = check('<p><a href="https://x.it"><img src="a.png"></a></p>')
    expect(issues.map((i) => i.rule)).toEqual(['image-alt'])
    expect(repairOf(issues[0]!, 'text').decorative).toBe(false)
    expect(rules('<p>Il programma: <a href="https://x.it">clicca qui!</a></p>')).toEqual([
      'link-text',
    ])
    expect(rules('<p><a href="https://x.it">Read more</a></p>')).toEqual(['link-text'])
    expect(rules('<p><a href="https://x.it">Il programma</a></p>')).toEqual([])
    expect(rules('<p><a href="https://x.it">Uno</a> <a href="https://x.it">due</a></p>')).toEqual([
      'adjacent-links',
    ])
    expect(rules('<p><a href="https://x.it">Uno</a> e <a href="https://x.it">due</a></p>')).toEqual(
      [],
    )
    expect(
      rules('<p>Vai <a href="https://x.it">qui</a></p>', { genericLinkTexts: ['vai'] }),
    ).toEqual([])
  })

  it('reports skipped heading levels and empty headings', () => {
    const issues = check(
      '<h3>Inizio</h3><h4>Uno</h4><h6>Salto</h6><h2></h2><h2>Due</h2><h4>Ancora</h4>',
    )
    expect(issues.map((i) => [i.rule, i.params])).toEqual([
      ['heading-order', { level: 6, previous: 4 }],
      ['heading-empty', {}],
      ['heading-order', { level: 4, previous: 2 }],
    ])
    expect(repairOf(issues[0]!, 'heading').levels).toEqual([5, 4, 3, 2, 1])
  })

  it('reports short bold paragraphs that look like headings', () => {
    expect(rules('<p><strong>Orari</strong></p><p>Dalle 9 alle 18.</p>')).toEqual([
      'paragraph-as-heading',
    ])
    // a sentence, a mixed paragraph, the last block, inside a table: not headings
    expect(rules('<p><strong>Orari.</strong></p><p>x</p>')).toEqual([])
    expect(rules('<p><strong>Orari</strong> e prezzi</p><p>x</p>')).toEqual([])
    expect(rules('<p>x</p><p><strong>Fine</strong></p>')).toEqual([])
    expect(
      rules(
        '<table><tr><th>A</th></tr><tr><td><p><strong>Nota</strong></p><p>x</p></td></tr></table>',
        {
          rules: { 'table-caption': false },
        },
      ),
    ).toEqual([])
  })

  it('reports paragraphs written as a list', () => {
    const issues = check('<p>- uno</p><p>- due</p><p>- tre</p><p>fine</p><p>1. a</p><p>2) b</p>')
    expect(issues.map((i) => [i.rule, i.params])).toEqual([
      ['fake-list', { count: 3 }],
      ['fake-list', { count: 2 }],
    ])
    expect(rules('<p>- solo uno</p><p>altro</p>')).toEqual([])
    expect(rules('<ul><li><p>- dentro</p></li><li><p>- un elenco</p></li></ul>')).toEqual([])
  })

  it('reports tables without headers, empty headers and missing captions', () => {
    expect(
      rules('<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>'),
    ).toEqual(['table-headers', 'table-caption'])
    expect(
      rules(
        '<table><caption>T</caption><tr><th></th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
      ),
    ).toEqual(['table-header-empty'])
  })

  it('reports embeds named only after their service', () => {
    const src = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    expect(rules(`<iframe src="${src}"></iframe>`)).toEqual(['embed-title'])
    expect(rules(`<iframe src="${src}" title="Presentazione del corso"></iframe>`)).toEqual([])
  })

  it('checks the contrast of colored text against its background', () => {
    const issues = check(
      '<p><span style="color: #aaaaaa">grigio</span> <span style="color: #595959">scuro</span></p>',
    )
    expect(issues.map((i) => [i.rule, i.params])).toEqual([
      ['contrast', { ratio: '2.32', required: '4.5', color: '#aaaaaa', background: '#ffffff' }],
    ])
    // large text needs 3:1 (#949494 is 3.03:1)
    expect(rules('<h1><span style="color: #949494">Titolo</span></h1>')).toEqual([])
    expect(rules('<p><span style="color: #949494">testo</span></p>')).toEqual(['contrast'])
    // background from a highlight, from a table cell, or from the options
    expect(rules('<p><span style="background-color: #000080">testo</span></p>')).toEqual([
      'contrast',
    ])
    expect(
      rules(
        '<table><caption>T</caption><tr><th style="background-color: #333333">A</th></tr></table>',
      ),
    ).toEqual(['contrast'])
    expect(
      rules('<p><span style="color: #ffffff">bianco</span></p>', {
        background: '#000000',
        color: '#ffffff',
      }),
    ).toEqual([])
    // text without colors of its own is the page's business
    expect(rules('<p>normale</p>', { background: '#ffffff', color: '#eeeeee' })).toEqual([])
  })

  it('follows the conformance level', () => {
    const grey = '<p style="text-align: justify"><span style="color: #767676">testo</span></p>'
    expect(rules(grey, { level: 'A' })).toEqual([])
    expect(rules(grey)).toEqual([])
    const aaa = check(grey, { level: 'AAA' })
    expect(aaa.map((i) => [i.rule, i.criterion.id])).toEqual([
      ['contrast', '1.4.6'],
      ['justified-text', '1.4.8'],
    ])
  })

  it('turns single checks off and validates the options', () => {
    expect(rules(`<p><img src="${IMG}"></p>`, { rules: { 'image-alt': false } })).toEqual([])
    expect(() => checkAccessibility(parse('<p>x</p>'), { background: 'url(x)' })).toThrow(
      RangeError,
    )
    expect(() => a11yChecker({ maxAltLength: 0 })).toThrow(RangeError)
  })

  it('lists the issues in document order', () => {
    const issues = check(
      `<p><a href="https://x.it">qui</a></p><p><img src="${IMG}"></p><h1>A</h1><h3>B</h3>`,
    )
    expect(issues.map((i) => i.rule)).toEqual(['link-text', 'image-alt', 'heading-order'])
  })

  it('has translations for every rule, in every language', () => {
    for (const rule of A11Y_RULES)
      for (const tr of [t, en]) {
        expect(tr(`a11y.rule.${rule}.title`)).not.toContain('a11y.')
        expect(tr(`a11y.rule.${rule}.description`)).not.toContain('a11y.')
      }
  })
})

describe('repairs', () => {
  it('writes the alternative text, or marks the image as decorative', () => {
    const { state, issue } = only(`<p><img src="${IMG}"></p>`, 'image-alt')
    const repair = repairOf(issue, 'text')
    expect(repair).toMatchObject({ field: 'alt', decorative: true })
    expect(html(exec(state, repair.apply('  Tramonto\nsul mare ')))).toBe(
      `<p><img src="${IMG}" alt="Tramonto sul mare"></p>`,
    )
    expect(html(exec(state, repair.apply(null)))).toBe(`<p><img src="${IMG}" alt=""></p>`)
    expect(repair.apply('   ')(state)).toBe(false)
  })

  it('fixes link texts and merges duplicate links', () => {
    let { state, issue } = only('<p>Vedi <a href="https://x.it"><em>qui</em></a>.</p>', 'link-text')
    state = exec(state, repairOf(issue, 'text').apply('il programma'))
    expect(html(state)).toBe('<p>Vedi <em><a href="https://x.it">il programma</a></em>.</p>')
    ;({ state, issue } = only(
      '<p><a href="https://x.it">Uno</a> <a href="https://x.it">due</a></p>',
      'adjacent-links',
    ))
    const [merge] = repairOf(issue, 'actions').actions
    expect(html(exec(state, merge!.command))).toBe('<p><a href="https://x.it">Uno due</a></p>')
  })

  it('changes the heading level, or turns a fake heading into a real one', () => {
    let { state, issue } = only('<h2>A</h2><h4>B</h4>', 'heading-order')
    expect(html(exec(state, repairOf(issue, 'heading').apply(3)))).toBe('<h2>A</h2><h3>B</h3>')
    expect(repairOf(issue, 'heading').apply(5)(state)).toBe(false)
    ;({ state, issue } = only(
      '<h2>A</h2><p style="text-align: center"><strong>Orari</strong></p><p>x</p>',
      'paragraph-as-heading',
    ))
    const repair = repairOf(issue, 'heading')
    expect(repair.levels[0]).toBe(3)
    expect(html(exec(state, repair.apply(3)))).toBe(
      '<h2>A</h2><h3 style="text-align: center">Orari</h3><p>x</p>',
    )
    ;({ state, issue } = only('<h2></h2><p>x</p>', 'heading-empty'))
    expect(html(exec(state, repairOf(issue, 'actions').actions[0]!.command))).toBe(
      '<p></p><p>x</p>',
    )
  })

  it('turns hand-written lists into real lists', () => {
    let { state, issue } = only('<p>- uno</p><p>• due</p><p>x</p>', 'fake-list')
    let [action] = repairOf(issue, 'actions').actions
    expect(action!.id).toBe('toBulletList')
    expect(html(exec(state, action!.command))).toBe(
      '<ul><li><p>uno</p></li><li><p>due</p></li></ul><p>x</p>',
    )
    ;({ state, issue } = only('<p>3. tre</p><p>4. quattro</p>', 'fake-list'))
    ;[action] = repairOf(issue, 'actions').actions
    expect(html(exec(state, action!.command))).toBe(
      '<ol start="3"><li><p>tre</p></li><li><p>quattro</p></li></ol>',
    )
  })

  it('adds table headers and captions', () => {
    const table = '<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>'
    let { state, issue } = only(table, 'table-headers')
    const [row, column] = repairOf(issue, 'actions').actions
    expect(html(exec(state, row!.command))).toContain(
      '<tr><th><p>a</p></th><th><p>b</p></th></tr><tr><td><p>1</p></td>',
    )
    expect(html(exec(state, column!.command))).toContain(
      '<tr><th><p>a</p></th><td><p>b</p></td></tr><tr><th><p>1</p></th>',
    )
    ;({ state, issue } = only(table, 'table-caption'))
    expect(html(exec(state, repairOf(issue, 'text').apply('Risultati')))).toContain(
      '<caption>Risultati</caption>',
    )
  })

  it('gives embeds a title', () => {
    const src = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    const { state, issue } = only(`<iframe src="${src}"></iframe>`, 'embed-title')
    expect(html(exec(state, repairOf(issue, 'text').apply('Il corso')))).toContain(
      'title="Il corso"',
    )
  })

  it('fixes contrast with the suggested color or by removing the colors', () => {
    const { state, issue } = only('<p>a <span style="color: #aaaaaa">grigio</span></p>', 'contrast')
    const [suggested, remove] = repairOf(issue, 'actions').actions
    expect(suggested!.id).toBe('suggestedColor')
    const color = suggested!.params!['color']!
    expect(contrastRatio(color, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(html(exec(state, suggested!.command))).toBe(
      `<p>a <span style="color: ${color}">grigio</span></p>`,
    )
    expect(remove!.id).toBe('removeColor')
    expect(html(exec(state, remove!.command))).toBe('<p>a grigio</p>')
  })

  it('aligns justified text to the left', () => {
    const { state, issue } = only('<p style="text-align: justify">x</p>', 'justified-text', {
      level: 'AAA',
    })
    expect(html(exec(state, repairOf(issue, 'actions').actions[0]!.command))).toBe('<p>x</p>')
  })

  it('refuses to run on a changed document', () => {
    const { state, issue } = only(`<p><img src="${IMG}"></p>`, 'image-alt')
    const changed = state.apply(state.tr.insertText('x', 1))
    expect(repairOf(issue, 'text').apply('Tramonto')(changed)).toBe(false)
  })
})

describe('plugin state', () => {
  it('ignores an issue until reload, following edits', () => {
    let state = stateOf(`<p><img src="${IMG}"></p><p><img src="${IMG}"></p>`)
    const [first] = a11yIssues(state)
    state = exec(state, ignoreIssue(first!))
    expect(a11yIssues(state)).toHaveLength(1)
    state = state.apply(state.tr.insertText('abc', 1))
    expect(a11yIssues(state)).toHaveLength(1)
    state = exec(state, clearIgnoredIssues)
    expect(a11yIssues(state)).toHaveLength(2)
    expect(clearIgnoredIssues(state)).toBe(false)
  })

  it('without the plugin: no issues, the toolbar item is disabled', () => {
    const state = EditorState.create({ doc: parse(`<p><img src="${IMG}"></p>`) })
    expect(a11yIssues(state)).toEqual([])
    const item = a11yCheckerItem(t)
    expect(item.command(state)).toBe(false)
    expect(item.command(stateOf('<p>x</p>'))).toBe(true)
    expect(item.readOnly).toBe(true)
  })
})

describe('dialog', () => {
  beforeAll(() => {
    // jsdom has no modal dialogs: enough of showModal/close for these tests
    const proto = HTMLDialogElement.prototype as unknown as {
      showModal(this: HTMLDialogElement): void
      close(this: HTMLDialogElement): void
    }
    proto.showModal ??= function () {
      this.open = true
    }
    proto.close ??= function () {
      this.open = false
    }
  })

  function mount(source: string, options?: A11yOptions) {
    const place = document.createElement('div')
    document.body.replaceChildren(place)
    const view = new EditorView(place, { state: stateOf(source, options) })
    const handle = openA11yDialog(view, t)
    const dialog = handle.dialog
    const button = (name: string) =>
      [...dialog.querySelectorAll('button')].find((b) => b.textContent === name)!
    return { view, handle, dialog, button }
  }

  it('shows one issue at a time and selects it in the text', () => {
    const { view, dialog, button } = mount(
      `<p><img src="${IMG}"></p><p>Vedi <a href="https://x.it">qui</a></p>`,
    )
    expect(dialog.querySelector('[role="status"]')!.textContent).toBe('Problema 1 di 2.')
    expect(dialog.querySelector('h3')!.textContent).toBe('Immagine senza testo alternativo')
    expect(dialog.querySelector('.scriba-a11y-severity')!.textContent).toBe('Errore')
    const link = dialog.querySelector<HTMLAnchorElement>('.scriba-a11y-wcag a')!
    expect(link.href).toBe('https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html')
    expect(link.rel).toBe('noopener noreferrer')
    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect(button('Precedente').disabled).toBe(true)

    button('Successivo').click()
    expect(dialog.querySelector('[role="status"]')!.textContent).toBe('Problema 2 di 2.')
    expect(view.state.selection.from).toBe(9)
    expect(view.dom.querySelector(`.${A11Y_CURRENT_CLASS}`)!.textContent).toBe('qui')
    expect(button('Successivo').disabled).toBe(true)
  })

  it('repairs from the form and moves on to the next issue', () => {
    const { view, dialog, button } = mount(`<p><img src="${IMG}"></p><p><img src="${IMG}"></p>`)
    const input = dialog.querySelector<HTMLInputElement>('input[type="text"]')!
    expect(input.labels![0]!.textContent).toContain('Testo alternativo')
    // empty: refused with a message
    button('Correggi').click()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(dialog.querySelector('[role="alert"]')!.textContent).toBe('Scrivi un testo.')
    input.value = 'Sole sul mare'
    dialog.querySelector('form')!.requestSubmit()
    expect(html(view.state)).toBe(
      `<p><img src="${IMG}" alt="Sole sul mare"></p><p><img src="${IMG}"></p>`,
    )
    expect(dialog.querySelector('[role="status"]')!.textContent).toBe('Corretto. Problema 1 di 1.')
    // decorative
    const check = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    check.click()
    expect(dialog.querySelector<HTMLInputElement>('input[type="text"]')!.disabled).toBe(true)
    button('Correggi').click()
    expect(html(view.state)).toContain(`<img src="${IMG}" alt="">`)
    expect(dialog.querySelector('.scriba-a11y-none')!.textContent).toBe(
      'Nessun problema di accessibilità trovato.',
    )
    expect(button('Ignora').hidden).toBe(true)
    expect(document.activeElement).toBe(button('Chiudi'))
  })

  it('ignores issues, and gives focus back to the editor on close', () => {
    const { view, dialog, button, handle } = mount('<h2>A</h2><h4>B</h4>')
    const levels = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(levels.map((r) => [r.value, r.checked])).toEqual([
      ['3', true],
      ['2', false],
      ['1', false],
    ])
    expect(document.activeElement).toBe(levels[0])
    button('Ignora').click()
    expect(dialog.querySelector('[role="status"]')!.textContent).toBe(
      'Ignorato. Nessun problema di accessibilità trovato.',
    )
    handle.close()
    expect(view.dom.querySelector(`.${A11Y_CURRENT_CLASS}`)).toBeNull()
    expect(document.activeElement).toBe(view.dom)
  })

  it('hides the repairs when the editor is read-only', () => {
    const place = document.createElement('div')
    document.body.replaceChildren(place)
    const view = new EditorView(place, {
      state: stateOf(`<p><img src="${IMG}"></p>`),
      editable: () => false,
    })
    const dialog = openA11yDialog(view, t).dialog
    expect(dialog.querySelector('fieldset')).toBeNull()
    expect(dialog.querySelector('.scriba-dialog-hint')!.textContent).toContain('sola lettura')
  })
})
