/**
 * Mock implementation of BioRenderAdapter.
 *
 * Demo/dev use only. Returns hand-curated `ResolvedAsset` records for queries
 * that appear in the Maude 2018 CAR-T reference example. Used by Day 2's
 * Replace-verb UX so the demo can show alternative-icon swap behavior without
 * calling any real BioRender API.
 *
 * Production: this file should be deleted. A real BioRenderAdapter
 * implementation would replace it.
 */

import type { ResolvedAsset } from '@/core/schema'
import type { BioRenderAdapter } from './biorender-adapter'

const MOCK_ASSETS: Record<string, ResolvedAsset[]> = {
  // Hand-curated for the Maude 2018 CAR-T demo. Day 2 will populate more
  // queries as the canvas Replace UX comes online.
  'CAR-T cell': [
    { search_query: 'CAR-T cell', biorender_id: 'mock-cart-001', source: 'mocked' },
    { search_query: 'CAR-T cell', biorender_id: 'mock-cart-002', source: 'mocked' },
    { search_query: 'CAR-T cell', biorender_id: 'mock-cart-003', source: 'mocked' },
  ],
  'CD19 receptor': [
    { search_query: 'CD19 receptor', biorender_id: 'mock-cd19-001', source: 'mocked' },
    { search_query: 'CD19 receptor', biorender_id: 'mock-cd19-002', source: 'mocked' },
  ],
  'pediatric patient': [
    { search_query: 'pediatric patient', biorender_id: 'mock-patient-001', source: 'mocked' },
    { search_query: 'pediatric patient', biorender_id: 'mock-patient-002', source: 'mocked' },
  ],
  'cytokine cluster': [
    { search_query: 'cytokine cluster', biorender_id: 'mock-cytokine-001', source: 'mocked' },
  ],
  'IV bag': [
    { search_query: 'IV bag', biorender_id: 'mock-ivbag-001', source: 'mocked' },
  ],
}

export class MockBioRenderAdapter implements BioRenderAdapter {
  async searchAssets(query: string, limit = 5): Promise<ResolvedAsset[]> {
    const results = MOCK_ASSETS[query] ?? []
    return results.slice(0, limit)
  }

  async fetchAlternatives(assetId: string, limit = 3): Promise<ResolvedAsset[]> {
    // Find the asset and return its siblings (same query, different IDs).
    for (const assets of Object.values(MOCK_ASSETS)) {
      if (assets.some((a) => a.biorender_id === assetId)) {
        return assets.filter((a) => a.biorender_id !== assetId).slice(0, limit)
      }
    }
    return []
  }
}
