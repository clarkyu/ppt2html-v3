// One error type for everything the LLM client throws (besides the user's own
// AbortError), so callers can tell "ask again" (a malformed sample, a
// transient 429/5xx) from "asking again is pointless" (bad key, truncated
// output, a base URL that isn't one) without string-matching localized text.

export type LlmErrorKind =
  /** The reply wasn't parseable JSON — a fresh sample usually is. */
  | 'parse'
  /** finish_reason=length / stop_reason=max_tokens: the output limit cut it off. */
  | 'truncated'
  /** The provider's content filter refused the request. */
  | 'filter'
  /** The provider reported an error in its reply body (also over HTTP 200). */
  | 'model'
  /** Non-2xx response; `status` carries the code. */
  | 'http'
  /** The request never got a response (DNS, CORS, proxy, connection cut). */
  | 'network'
  /** navigator.onLine was false when the request failed. */
  | 'offline'
  /** Settings can't be used as stored (no key, unusable base URL). */
  | 'config'

export class LlmError extends Error {
  readonly kind: LlmErrorKind
  readonly status: number

  constructor(message: string, kind: LlmErrorKind, status = 0) {
    super(message)
    this.name = 'LlmError'
    this.kind = kind
    this.status = status
  }

  /** A fresh attempt may succeed: malformed output, or a transient 429/5xx. */
  get retryable(): boolean {
    return this.kind === 'parse' || this.transient
  }

  /** Server-side and transient (429 / 5xx): worth ONE short-backoff retry. */
  get transient(): boolean {
    return this.kind === 'http' && (this.status === 429 || this.status >= 500)
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** Short pause before a transient retry; rejects with AbortError if cancelled. */
export function backoff(ms = 1500, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
