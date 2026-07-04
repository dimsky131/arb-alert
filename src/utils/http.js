import { createLogger } from './logger.js'

const log = createLogger('http')

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_RETRIES = 2

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * fetch JSON with timeout and exponential-backoff retries.
 * Throws after all retries are exhausted.
 */
export async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, label = url } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })
      if (res.status === 429 || res.status === 418) {
        // Rate limited — back off harder and retry.
        throw new Error(`rate limited (HTTP ${res.status})`)
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      return await res.json()
    } catch (err) {
      lastError = err
      const isLast = attempt === retries
      if (!isLast) {
        const backoff = 500 * 2 ** attempt
        log.warn(`request failed, retrying in ${backoff}ms`, { label, attempt: attempt + 1, error: String(err?.message || err) })
        await sleep(backoff)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`${label}: ${String(lastError?.message || lastError)}`)
}
