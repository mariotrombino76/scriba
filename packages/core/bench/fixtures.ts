import { EditorState, TextSelection, basicSchema, history, type Node } from '../src/index.js'

/** A sentence of ~200 characters, with some formatting. */
const SENTENCE =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi. '

/** A document of about `chars` characters: paragraphs of ~200 characters, every tenth a heading. */
export function bigDoc(chars = 1_000_000): Node {
  const s = basicSchema
  const bold = s.mark('bold')
  const blocks: Node[] = []
  for (let i = 0; blocks.length * SENTENCE.length < chars; i++) {
    blocks.push(
      i % 10 === 0
        ? s.node('heading', { level: 2 }, s.text(`Sezione ${i / 10 + 1}`))
        : s.node('paragraph', null, [
            s.text(SENTENCE.slice(0, 60)),
            s.text(SENTENCE.slice(60, 90), [bold]),
            s.text(SENTENCE.slice(90)),
          ]),
    )
  }
  return s.node('doc', null, blocks)
}

/** State with the cursor in the middle of the document (inside a paragraph), with history. */
export function bigState(doc: Node = bigDoc()): EditorState {
  let pos = Math.floor(doc.content.size / 2)
  const $pos = doc.resolve(pos)
  if (!$pos.parent.inlineContent) pos = TextSelection.near($pos).from
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
    plugins: [history()],
  })
}
