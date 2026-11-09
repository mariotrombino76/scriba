// Inline mode with the global `Scriba` of scriba.iife.js, as on any site.
type Handle = { getContent(): string; setContent(c: string): void }
const { Scriba } = window as unknown as {
  Scriba: { createEditor(target: string, options: object): Handle }
}
const cspViolations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`),
)
const editor = Scriba.createEditor('#editor', {
  inline: true,
  content: '<p>Testo <strong>modificabile</strong> nella pagina.</p>',
  label: 'Editor inline',
})
Object.assign(window, { scribaInline: { editor, cspViolations } })

export {}
