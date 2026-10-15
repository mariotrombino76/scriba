/// <reference lib="webworker" />
// Runs regular expression searches off the main thread: a catastrophic
// pattern (e.g. `(a+)+$`) only blocks this worker, which the editor terminates
// after a time limit (CLAUDE.md §5.10).
import { searchTexts, type SearchQuery } from './search.js'

interface Request {
  id: number
  texts: string[]
  query: SearchQuery
  maxMatches: number
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, texts, query, maxMatches } = event.data
  self.postMessage({ id, result: searchTexts(texts, query, maxMatches) })
}
