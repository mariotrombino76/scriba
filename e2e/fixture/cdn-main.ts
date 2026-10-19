// Uses only the global `Scriba` of scriba.iife.js (nothing imported): the page of any site.
type Handle = { getContent(): string; setContent(c: string): void }
const { Scriba } = window as unknown as {
  Scriba: { createEditor(target: string, options: object): Handle }
}
const cspViolations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`),
)
const out = document.querySelector('[data-testid=value]')!
const editor = Scriba.createEditor('#editor', {
  content: '<p>Ciao <strong>mondo</strong></p>',
  label: 'Editor CDN',
  onChange: (html: string) => (out.textContent = html),
})
document
  .getElementById('load')!
  .addEventListener('click', () =>
    editor.setContent('<h2>Da fuori</h2><img src=x onerror="alert(1)"><p>fine</p>'),
  )
Object.assign(window, { scribaCdn: { editor, cspViolations } })
