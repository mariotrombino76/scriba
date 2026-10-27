/**
 * Stroke icons (24×24 grid, `currentColor`). Built with `createElementNS`:
 * no markup strings, so they work under a strict CSP / Trusted Types.
 */

type Shape = readonly ['path', string] | readonly ['circle', number, number, number]

const ICONS = {
  undo: [
    ['path', 'M9 14 4 9l5-5'],
    ['path', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  ],
  redo: [
    ['path', 'm15 14 5-5-5-5'],
    ['path', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  ],
  code: [
    ['path', 'm16 18 6-6-6-6'],
    ['path', 'm8 6-6 6 6 6'],
  ],
  link: [
    ['path', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'],
    ['path', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  ],
  bulletList: [
    ['path', 'M9 6h11'],
    ['path', 'M9 12h11'],
    ['path', 'M9 18h11'],
    ['circle', 4.5, 6, 1],
    ['circle', 4.5, 12, 1],
    ['circle', 4.5, 18, 1],
  ],
  orderedList: [
    ['path', 'M10 6h11'],
    ['path', 'M10 12h11'],
    ['path', 'M10 18h11'],
    ['path', 'M4 6h1v4'],
    ['path', 'M4 10h2'],
    ['path', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'],
  ],
  outdent: [
    ['path', 'M21 6H11'],
    ['path', 'M21 12H11'],
    ['path', 'M21 18H11'],
    ['path', 'm7 8-4 4 4 4'],
  ],
  indent: [
    ['path', 'M21 6H11'],
    ['path', 'M21 12H11'],
    ['path', 'M21 18H11'],
    ['path', 'm3 8 4 4-4 4'],
  ],
  alignLeft: [
    ['path', 'M3 6h18'],
    ['path', 'M3 12h12'],
    ['path', 'M3 18h16'],
  ],
  alignCenter: [
    ['path', 'M3 6h18'],
    ['path', 'M6 12h12'],
    ['path', 'M4 18h16'],
  ],
  alignRight: [
    ['path', 'M3 6h18'],
    ['path', 'M9 12h12'],
    ['path', 'M5 18h16'],
  ],
  alignJustify: [
    ['path', 'M3 6h18'],
    ['path', 'M3 12h18'],
    ['path', 'M3 18h18'],
  ],
  quote: [
    ['path', 'M3 21c3 0 7-1 7-8V5H3v7h4'],
    ['path', 'M14 21c3 0 7-1 7-8V5h-7v7h4'],
  ],
  codeBlock: [
    ['path', 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1'],
    ['path', 'M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1'],
  ],
  highlight: [
    ['path', 'm9 11-6 6v3h9l3-3'],
    ['path', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
  ],
  image: [
    ['path', 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'],
    ['circle', 9, 9, 2],
    ['path', 'm21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21'],
  ],
  fullscreen: [
    ['path', 'M8 3H5a2 2 0 0 0-2 2v3'],
    ['path', 'M21 8V5a2 2 0 0 0-2-2h-3'],
    ['path', 'M3 16v3a2 2 0 0 0 2 2h3'],
    ['path', 'M16 21h3a2 2 0 0 0 2-2v-3'],
  ],
  exitFullscreen: [
    ['path', 'M8 3v3a2 2 0 0 1-2 2H3'],
    ['path', 'M21 8h-3a2 2 0 0 1-2-2V3'],
    ['path', 'M3 16h3a2 2 0 0 1 2 2v3'],
    ['path', 'M16 21v-3a2 2 0 0 1 2-2h3'],
  ],
  source: [
    ['path', 'M14 3v4a1 1 0 0 0 1 1h4'],
    ['path', 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z'],
    ['path', 'm10 12-2 2 2 2'],
    ['path', 'm14 16 2-2-2-2'],
  ],
  search: [
    ['circle', 11, 11, 7],
    ['path', 'm21 21-4.3-4.3'],
  ],
  smile: [
    ['circle', 12, 12, 9],
    ['path', 'M8 14s1.5 2 4 2 4-2 4-2'],
    ['path', 'M9 9.5h.01'],
    ['path', 'M15 9.5h.01'],
  ],
  sparkles: [
    ['path', 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'],
    ['path', 'M19 15l.8 1.7L21.5 17.5l-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8z'],
  ],
  comment: [['path', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']],
  suggest: [
    ['path', 'M12 20h9'],
    ['path', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  ],
  table: [
    ['path', 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    ['path', 'M3 9h18'],
    ['path', 'M3 15h18'],
    ['path', 'M9 3v18'],
    ['path', 'M15 3v18'],
  ],
  chevronDown: [['path', 'm6 9 6 6 6-6']],
  chevronRight: [['path', 'm9 18 6-6-6-6']],
  check: [['path', 'M20 6 9 17l-5-5']],
  file: [
    ['path', 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'],
    ['path', 'M14 3v5h5'],
  ],
  callout: [
    ['path', 'M4 4h16v16H4z'],
    ['path', 'M8 9h8'],
    ['path', 'M8 13h6'],
  ],
  task: [
    ['path', 'm9 11 3 3L22 4'],
    ['path', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
  ],
  close: [
    ['path', 'M18 6 6 18'],
    ['path', 'm6 6 12 12'],
  ],
  hr: [['path', 'M4 12h16']],
  math: [['path', 'M18 5H7l5 7-5 7h11']],
  toc: [
    ['path', 'M4 6h2'],
    ['path', 'M9 6h11'],
    ['path', 'M6 12h2'],
    ['path', 'M11 12h9'],
    ['path', 'M6 18h2'],
    ['path', 'M11 18h9'],
  ],
  mergeTag: [
    ['path', 'M8 4c-2 0-2 2-2 4s-1 4-3 4c2 0 3 2 3 4s0 4 2 4'],
    ['path', 'M16 4c2 0 2 2 2 4s1 4 3 4c-2 0-3 2-3 4s0 4-2 4'],
  ],
  footnote: [
    ['path', 'M4 6h10'],
    ['path', 'M4 10h7'],
    ['path', 'M17 4h2v5'],
    ['path', 'M4 18h16'],
    ['path', 'M4 21h10'],
  ],
  styles: [
    ['path', 'M4 7V5h16v2'],
    ['path', 'M9 19h6'],
    ['path', 'M12 5v14'],
    ['path', 'M17 14l2 2 3-3'],
  ],
  map: [
    ['path', 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z'],
    ['circle', 12, 9.5, 2.5],
  ],
  music: [
    ['path', 'M9 18V5l12-2v13'],
    ['circle', 6, 18, 3],
    ['circle', 18, 16, 3],
  ],
  letterCase: [
    ['path', 'm3 17 4-10 4 10'],
    ['path', 'M4.5 13.5h5'],
    ['path', 'M18 10.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
    ['path', 'M20.5 9.5V17'],
  ],
  accessibility: [
    ['circle', 16, 4, 1],
    ['path', 'm18 19 1-7-6 1'],
    ['path', 'm5 8 3-3 5.5 3-2.36 3.5'],
    ['path', 'M4.24 14.5a5 5 0 0 0 6.88 6'],
    ['path', 'M13.76 17.5a5 5 0 0 0-6.88-6'],
  ],
  formatPainter: [
    [
      'path',
      'M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3z',
    ],
    ['path', 'M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7'],
    ['path', 'M14.5 17.5 4.5 15'],
  ],
  save: [
    ['path', 'M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'],
    ['path', 'M7 3v5h8V3'],
    ['path', 'M7 21v-7h10v7'],
  ],
  video: [
    ['path', 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    ['path', 'm10 9 5 3-5 3z'],
  ],
  blocks: [
    ['path', 'M4 4h16v6H4z'],
    ['path', 'M4 14h16v6H4z'],
  ],
  pilcrow: [
    ['path', 'M13 4v16'],
    ['path', 'M17 4v16'],
    ['path', 'M19 4H9.5a4.5 4.5 0 0 0 0 9H13'],
  ],
  details: [
    ['path', 'm4 6 3 3 3-3'],
    ['path', 'M13 7h7'],
    ['path', 'M7 14h13'],
    ['path', 'M7 18h13'],
  ],
  anchor: [
    ['circle', 12, 5, 3],
    ['path', 'M12 22V8'],
    ['path', 'M5 12H2a10 10 0 0 0 20 0h-3'],
  ],
  lineHeight: [
    ['path', 'M11 6h10'],
    ['path', 'M11 12h10'],
    ['path', 'M11 18h10'],
    ['path', 'm3 8 3-3 3 3'],
    ['path', 'M6 5v14'],
    ['path', 'm3 16 3 3 3-3'],
  ],
  ltr: [
    ['path', 'M9 4v12'],
    ['path', 'M13 4v12'],
    ['path', 'M15 4H8.5a3.5 3.5 0 0 0 0 7H9'],
    ['path', 'M4 20h15'],
    ['path', 'm16 17 3 3-3 3'],
  ],
  rtl: [
    ['path', 'M11 4v12'],
    ['path', 'M15 4v12'],
    ['path', 'M17 4h-6.5a3.5 3.5 0 0 0 0 7H11'],
    ['path', 'M20 20H5'],
    ['path', 'm8 17-3 3 3 3'],
  ],
  superscript: [
    ['path', 'm4 19 8-8'],
    ['path', 'm12 19-8-8'],
    [
      'path',
      'M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7.5c0-.8-.7-1.5-1.5-1.5-.88 0-1.5.5-1.5 1.25',
    ],
  ],
  subscript: [
    ['path', 'm4 5 8 8'],
    ['path', 'm12 5-8 8'],
    [
      'path',
      'M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14.5c0-.8-.7-1.5-1.5-1.5-.88 0-1.5.5-1.5 1.25',
    ],
  ],
  pageBreak: [
    ['path', 'M3 12h4'],
    ['path', 'M10 12h4'],
    ['path', 'M17 12h4'],
    ['path', 'M6 3v5h12V3'],
    ['path', 'M6 21v-5h12v5'],
  ],
  clock: [
    ['circle', 12, 12, 10],
    ['path', 'M12 6v6l4 2'],
  ],
  help: [
    ['circle', 12, 12, 10],
    ['path', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3'],
    ['path', 'M12 17h.01'],
  ],
  more: [
    ['circle', 5, 12, 1],
    ['circle', 12, 12, 1],
    ['circle', 19, 12, 1],
  ],
} satisfies Record<string, readonly Shape[]>

export type IconName = keyof typeof ICONS

const SVG = 'http://www.w3.org/2000/svg'

/** Creates a decorative icon (`aria-hidden`); the button carries the accessible name. */
export function createIcon(doc: Document, name: IconName, size = 18): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('class', 'scriba-icon')
  for (const shape of ICONS[name] as readonly Shape[]) {
    if (shape[0] === 'path') {
      const path = doc.createElementNS(SVG, 'path')
      path.setAttribute('d', shape[1])
      svg.appendChild(path)
    } else {
      const circle = doc.createElementNS(SVG, 'circle')
      circle.setAttribute('cx', String(shape[1]))
      circle.setAttribute('cy', String(shape[2]))
      circle.setAttribute('r', String(shape[3]))
      if (name === 'more') circle.setAttribute('fill', 'currentColor')
      svg.appendChild(circle)
    }
  }
  return svg
}
