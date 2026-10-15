import { searchTexts, type QueryError, type SearchQuery, type SearchResult } from './search.js'

/** A search outcome: matches, a query error, why a regex could not run, or replaced by a newer search. */
export type SearchOutcome = SearchResult | QueryError | 'timeout' | 'unsupported' | 'cancelled'

export interface SearchRunnerOptions {
  /** Time limit for a regular expression search (ms, default 1000; §5.10). */
  timeout?: number
  /** Most matches reported (default 10 000). */
  maxMatches?: number
  /** Custom worker factory (e.g. when your bundler needs another syntax). */
  createWorker?: () => Worker | null
}

export const WORKER_POLICY = 'scriba-worker'

interface ScriptURLPolicy {
  createScriptURL(input: string): unknown
}

let policy: ScriptURLPolicy | undefined

/** Trusted Types: a policy (created once) that only ever returns the URL of our own worker. */
function trustedWorkerURL(url: URL): unknown {
  const factory = (
    globalThis as {
      trustedTypes?: {
        createPolicy(name: string, rules: { createScriptURL(i: string): string }): ScriptURLPolicy
      }
    }
  ).trustedTypes
  if (!factory) return url
  // security-reviewed: accepts exactly the URL of the bundled search worker, nothing else.
  policy ??= factory.createPolicy(WORKER_POLICY, {
    createScriptURL: (input) => {
      if (input !== url.href) throw new TypeError('Unexpected worker URL')
      return input
    },
  })
  return policy.createScriptURL(url.href)
}

/** Starts the search worker, or returns null when workers cannot be used here. */
function spawnWorker(): Worker | null {
  const Native = (globalThis as { Worker?: typeof globalThis.Worker }).Worker
  if (!Native) return null
  try {
    // Named `Worker` on purpose: bundlers (Vite, webpack) recognise
    // `new Worker(new URL('…', import.meta.url))` and bundle the worker file;
    // this subclass only adds the Trusted Types step.
    const Worker = class extends Native {
      constructor(url: URL, options?: WorkerOptions) {
        super(trustedWorkerURL(url) as URL, options)
      }
    }
    return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  } catch {
    return null // e.g. a CSP that does not allow the policy or the worker
  }
}

/**
 * Runs searches. Plain text runs here (an escaped literal is always linear);
 * regular expressions run in a Web Worker that is terminated when it takes
 * longer than the time limit, so a catastrophic pattern cannot freeze the page.
 */
export class SearchRunner {
  private worker: Worker | null = null
  private pending: {
    id: number
    resolve(o: SearchOutcome): void
    timer: ReturnType<typeof setTimeout>
  } | null = null
  private ids = 0

  constructor(private readonly options: SearchRunnerOptions = {}) {}

  run(texts: string[], query: SearchQuery): Promise<SearchOutcome> {
    const max = this.options.maxMatches
    if (!query.regex) return Promise.resolve(searchTexts(texts, query, max))
    this.cancel()
    if (!this.worker) this.worker = (this.options.createWorker ?? spawnWorker)()
    const worker = this.worker
    if (!worker) return Promise.resolve('unsupported')
    const id = ++this.ids
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // the regex is still running: stop the worker (a new one starts next time)
        this.stop()
        resolve('timeout')
      }, this.options.timeout ?? 1000)
      this.pending = { id, resolve, timer }
      worker.onmessage = (
        event: MessageEvent<{ id: number; result: SearchResult | QueryError }>,
      ) => {
        if (!this.pending || event.data.id !== this.pending.id) return
        clearTimeout(this.pending.timer)
        this.pending = null
        resolve(event.data.result)
      }
      worker.onerror = () => {
        this.stop()
        resolve('unsupported')
      }
      worker.postMessage({ id, texts, query, maxMatches: max ?? 10_000 })
    })
  }

  /** Drops the search in progress (a newer one replaces it). */
  private cancel(): void {
    if (!this.pending) return
    clearTimeout(this.pending.timer)
    this.pending.resolve('cancelled')
    this.pending = null
    this.stop() // the old regex may still be running
  }

  private stop(): void {
    this.worker?.terminate()
    this.worker = null
    if (this.pending) clearTimeout(this.pending.timer)
    this.pending = null
  }

  dispose(): void {
    this.cancel()
    this.stop()
  }
}
