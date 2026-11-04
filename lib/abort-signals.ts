/** AbortSignal.any/timeout are newer than iOS 16.4's Web Push support. */
export function timeoutSignal(milliseconds: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(milliseconds)
  const controller = new AbortController()
  setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), milliseconds)
  return controller.signal
}
export function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals)
  const controller = new AbortController(), listeners = new Map<AbortSignal, () => void>()
  const abort = (source: AbortSignal) => {
    controller.abort(source.reason)
    for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener)
    listeners.clear()
  }
  for (const signal of signals) {
    if (signal.aborted) { abort(signal); break }
    const listener = () => abort(signal)
    listeners.set(signal, listener); signal.addEventListener('abort', listener, { once: true })
  }
  return controller.signal
}
export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason || new DOMException('Cancelled', 'AbortError')
}
