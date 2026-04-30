/**
 * Fixture-mode extractor.
 *
 * Returns the canonical Maude 2018 CAR-T FigureSpec wrapped in a
 * GenerateFigureResponse. Ignores the input text and always returns the
 * canonical example. Used as the safe default and the demo's fallback path
 * when live extraction is disabled or unavailable.
 *
 * This adapter has no external dependencies. It always succeeds. It's the
 * floor of the extraction pipeline: even if Anthropic is down, the API key
 * is missing, the network is broken, or the user pastes something nonsensical,
 * the fixture mode returns a valid GenerateFigureResponse the rest of the
 * pipeline can render.
 */

import type { GenerateFigureResponse } from '@/core/schema'
import { MAUDE_2018_FIGURESPEC } from '@/examples/maude-2018-cart-figurespec'

export async function extractFromFixture(_inputText: string): Promise<GenerateFigureResponse> {
  // Single-candidate response with the canonical Maude FigureSpec selected.
  // Live mode (extract-api.ts) would return 3 candidates with different layouts.
  return {
    candidates: [MAUDE_2018_FIGURESPEC],
    selected_index: 0,
  }
}
