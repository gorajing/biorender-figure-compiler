/**
 * Browser localStorage cache for GenerateFigureResponse.
 *
 * Demo-only adapter. Caches successful extractions so reload-and-re-paste is
 * instant on the second view. Founder-call demo discipline: even with this
 * cache present, the primary demo flow uses fixture mode. Live mode uses the
 * cache to avoid re-burning API/Max quota on the same input.
 *
 * Production: this file should be deleted. A real implementation would lean
 * on BioRender's existing draft / autosave infrastructure rather than
 * persisting derived AI content in browser storage.
 *
 * Cache key: SHA-256 of (input_text + schema_version). Schema version
 * prevents stale-deserialization errors when the schema evolves between
 * cache writes and reads.
 */

import type { GenerateFigureResponse } from '@/core/schema'

const STORAGE_KEY_PREFIX = 'biorender-figure-compiler/v1/'
const SCHEMA_VERSION = 'v1.1'  // bump when schema.ts changes shape

/**
 * Compute a stable cache key from input text + schema version.
 * Uses SubtleCrypto SHA-256, hex-encoded, prefixed for namespacing.
 */
async function cacheKey(inputText: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${SCHEMA_VERSION}::${inputText}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${STORAGE_KEY_PREFIX}${hex.slice(0, 16)}`  // first 16 hex chars = 64 bits, plenty for demo
}

/**
 * Look up a cached GenerateFigureResponse by input text.
 * Returns null if not found, expired, or schema-version-mismatched.
 *
 * Safe in SSR contexts (returns null if `window` is undefined).
 */
export async function getCachedResponse(
  inputText: string
): Promise<GenerateFigureResponse | null> {
  if (typeof window === 'undefined') return null

  try {
    const key = await cacheKey(inputText)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      response: GenerateFigureResponse
      cachedAt: string
      schemaVersion: string
    }

    // Defensive check: even though the cache key includes schema version,
    // verify the stored payload matches. Catches corrupted entries.
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      window.localStorage.removeItem(key)
      return null
    }

    return parsed.response
  } catch {
    // Quota exceeded, JSON parse error, etc. Fail silently — cache is
    // best-effort. Live extraction will run as if no cache was present.
    return null
  }
}

/**
 * Store a GenerateFigureResponse in localStorage keyed by input text.
 *
 * No TTL: demo cache stays fresh until the user changes input text or until
 * the schema version bumps (which silently invalidates stale entries on
 * subsequent reads). A `clearCache()` helper is exported below for completeness;
 * the current UI does not surface a "Clear cache" button.
 *
 * Safe in SSR contexts (no-op if `window` is undefined).
 */
export async function setCachedResponse(
  inputText: string,
  response: GenerateFigureResponse
): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    const key = await cacheKey(inputText)
    const payload = JSON.stringify({
      response,
      cachedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
    })
    window.localStorage.setItem(key, payload)
  } catch {
    // localStorage quota exceeded or disabled. Silent failure is correct
    // for a demo cache — the live extraction still produced a valid result.
  }
}

/**
 * Clear all cache entries for this app. Safe to call from a "Reset demo"
 * button. Only removes keys under the app's namespace prefix.
 */
export function clearCache(): void {
  if (typeof window === 'undefined') return

  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // ignore
  }
}
