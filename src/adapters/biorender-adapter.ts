/**
 * BioRender adapter interface.
 *
 * The contract between the FigureSpec compiler (in `src/core/`) and BioRender's
 * asset library, template marketplace, and editor APIs. The compiler depends
 * only on this interface. Implementations live in `src/adapters/` and can be
 * swapped at compile time or runtime.
 *
 * Today: only a mock implementation exists (see `biorender-adapter-mock.ts`).
 * The mock returns hand-curated assets for the demo's reference examples.
 *
 * Production: a real implementation would call BioRender's authenticated
 * asset/template APIs. This file does NOT contain a real implementation
 * because we are not in a position to write one until BioRender exposes
 * the relevant endpoints.
 *
 * The proposed API surface is documented in `BIORENDER_API_CONTRACT.md`.
 */

import type { ResolvedAsset } from '@/core/schema'

export interface BioRenderAdapter {
  /**
   * Search BioRender's icon and template library for assets matching a
   * natural-language query.
   *
   * Returns up to N assets ranked by relevance. The first asset is the
   * "primary" suggestion; the remainder are alternatives the user can swap
   * to (mirrors BioRender's canvas Replace verb).
   */
  searchAssets(query: string, limit?: number): Promise<ResolvedAsset[]>

  /**
   * Fetch alternative resolved assets for a given asset ID.
   * Used to populate the Replace alternatives panel after an initial resolution.
   */
  fetchAlternatives(assetId: string, limit?: number): Promise<ResolvedAsset[]>
}
