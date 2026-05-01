/**
 * Mock implementation of BioRenderAdapter — architecture demonstration only.
 *
 * This class exists to show how a real adapter would be structured. It is NOT
 * invoked anywhere in the current prototype runtime: the figure preview renders
 * entity names as colored chips, and icon resolution does not run. The mock is
 * preserved in the repo so the typed interface contract has a concrete sample
 * implementation a reader can study.
 *
 * Production: this file should be deleted. A real BioRenderAdapter
 * implementation, calling BioRender's authenticated asset and template APIs,
 * would replace it.
 */

import type { ResolvedAsset } from '@/core/schema'
import type { BioRenderAdapter } from './biorender-adapter'

const MOCK_ASSETS: Record<string, ResolvedAsset[]> = {
  // Hand-curated for the Maude 2018 CAR-T demo. A real adapter would query
  // BioRender's authenticated asset library and return live results.
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
