/**
 * Extraction router.
 *
 * Reads `process.env.EXTRACT_MODE` and dispatches to the corresponding
 * adapter. Default mode is `fixture` — safe, deterministic, no API spend.
 * Live modes are explicit opt-in via env.
 *
 * Extraction modes:
 *   - 'fixture' (default): returns canonical Maude FigureSpec.
 *   - 'cli'   (planned): spawns Claude Code subprocess (uses Max quota).
 *   - 'api'   (planned): calls Anthropic SDK (requires ANTHROPIC_API_KEY).
 *
 * Production note: in a real deployment, the mode would be set per-environment
 * via env vars or feature flags. For the demo, the default is fixture mode
 * unless someone explicitly opts in.
 */

import type { GenerateFigureResponse } from './schema'
import { extractFromFixture } from '@/adapters/extract-fixture'
import { extractFromApi } from '@/adapters/extract-api'

export type ExtractMode = 'fixture' | 'cli' | 'api'

/**
 * Read the extraction mode from env, defaulting to 'fixture'.
 * Server-only. Runs in the API route.
 */
export function getExtractMode(): ExtractMode {
  const mode = process.env.EXTRACT_MODE?.toLowerCase()
  if (mode === 'cli' || mode === 'api') return mode
  return 'fixture'
}

/**
 * Extract a GenerateFigureResponse from input text using the configured mode.
 * Returns a valid response or throws.
 *
 * Errors should be handled at the API route boundary (return 500 with
 * structured error to the client; client falls back to fixture mode).
 */
export async function extract(inputText: string): Promise<GenerateFigureResponse> {
  const mode = getExtractMode()

  switch (mode) {
    case 'fixture':
      return extractFromFixture(inputText)

    case 'cli':
      // Day 2-3: Claude Code CLI subprocess adapter.
      // For now, fall through to fixture mode rather than throwing.
      console.warn('EXTRACT_MODE=cli not yet implemented, falling back to fixture')
      return extractFromFixture(inputText)

    case 'api':
      // Anthropic SDK adapter. Requires ANTHROPIC_API_KEY in env.
      // Errors here propagate to the API route, which returns 500.
      // The client preserves the existing figure on screen — never clears
      // the golden path on a failed live extraction.
      return extractFromApi(inputText)
  }
}
