'use client'

import { useState } from 'react'
import type { FigureSpec, SourceSpan, GenerateFigureResponse } from '@/core/schema'
import { MAUDE_2018_FIGURESPEC } from '@/examples/maude-2018-cart-figurespec'
import { validate } from '@/core/validate'
import { getCachedResponse, setCachedResponse } from '@/adapters/cache-localstorage'
import { FigurePreview } from './components/FigurePreview'
import { SourceAbstract } from './components/SourceAbstract'
import { ComparisonSection } from './components/ComparisonSection'

/**
 * BioRender Figure Compiler — main page.
 *
 * Two-button UX (no silent fixture substitution):
 *   - Load Maude 2018 CAR-T example  -> fixture mode (always works)
 *   - Compile draft from pasted text -> live API extraction (when
 *                                       EXTRACT_MODE=api and ANTHROPIC_API_KEY
 *                                       are set in env), else fixture fallback
 *
 * The source-span highlight is the core provenance affordance: hovering any
 * entity, claim, or relationship in the figure pane lights up the corresponding
 * verbatim text in the source abstract pane. This is what makes the FigureSpec
 * traceable back to its source.
 */
/**
 * Per-entity-name resolution state from BioRender MCP. The string keys
 * are entity.name. The values are tagged unions for rendering decisions.
 */
type ResolvedIcon = {
  name: string
  description: string
  assetType: string
  placeable: boolean
}
type ResolutionState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'resolved'; matches: ResolvedIcon[] }
  | { kind: 'error'; error: string }

export default function HomePage() {
  const [figureSpec, setFigureSpec] = useState<FigureSpec | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [hoveredSpan, setHoveredSpan] = useState<SourceSpan | null>(null)
  const [pinnedSpan, setPinnedSpan] = useState<SourceSpan | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Asset resolution via BioRender MCP. Keyed by entity.name.
  const [resolutions, setResolutions] = useState<Record<string, ResolutionState>>({})
  const [resolveBatchStatus, setResolveBatchStatus] = useState<
    'idle' | 'running' | 'done' | 'error'
  >('idle')

  function loadMaudeExample() {
    setFigureSpec(MAUDE_2018_FIGURESPEC)
    setHoveredSpan(null)
    setPinnedSpan(null)
    setStatusMessage(null)
    setResolutions({})
    setResolveBatchStatus('idle')
  }

  // Click-to-jump handler. Clears hover so the pinned highlight wins
  // visually for the scroll-into-view pass, then reveals the pinned span.
  function handleSelectSpan(span: SourceSpan) {
    setHoveredSpan(null)
    setPinnedSpan(span)
  }

  // Resolve every entity in the current FigureSpec against BioRender's
  // production MCP connector. One request per unique entity name, run
  // in parallel. Results populate the per-chip badges via the resolutions
  // map. Network failures degrade gracefully (per-entity error states),
  // never breaking the rest of the figure.
  async function resolveAllAssets() {
    if (!figureSpec) return
    if (resolveBatchStatus === 'running') return

    const uniqueNames = new Set<string>()
    for (const panel of figureSpec.panels) {
      for (const entity of panel.entities) {
        uniqueNames.add(entity.name)
      }
    }
    const names = Array.from(uniqueNames)

    setResolveBatchStatus('running')
    setResolutions((prev) => {
      const next: Record<string, ResolutionState> = { ...prev }
      names.forEach((n) => {
        next[n] = { kind: 'loading' }
      })
      return next
    })

    const settled = await Promise.all(
      names.map(async (name) => {
        try {
          const res = await fetch('/api/resolve-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: name, perPage: 3 }),
          })
          const data: {
            ok: boolean
            results?: ResolvedIcon[]
            error?: string
          } = await res.json()
          if (!res.ok || !data.ok) {
            return [name, { kind: 'error', error: data.error ?? 'unknown' } as ResolutionState] as const
          }
          return [
            name,
            { kind: 'resolved', matches: data.results ?? [] } as ResolutionState,
          ] as const
        } catch (err) {
          return [
            name,
            {
              kind: 'error',
              error: err instanceof Error ? err.message : 'network error',
            } as ResolutionState,
          ] as const
        }
      })
    )

    setResolutions((prev) => {
      const next: Record<string, ResolutionState> = { ...prev }
      for (const [name, state] of settled) {
        next[name] = state
      }
      return next
    })
    const anyError = settled.some(([, s]) => s.kind === 'error')
    setResolveBatchStatus(anyError ? 'error' : 'done')
  }

  async function generateFromPasted() {
    const trimmed = pastedText.trim()
    if (trimmed.length === 0 || loading) return

    setLoading(true)
    setStatusMessage(null)

    try {
      // 1. Check client-side cache first (browser-only).
      const cached = await getCachedResponse(trimmed)
      if (cached) {
        const candidate = cached.candidates[cached.selected_index ?? 0]
        if (candidate) {
          setFigureSpec(candidate)
          setLoading(false)
          return
        }
      }

      // 2. Cache miss — call the server route.
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputText: trimmed }),
      })

      const data: {
        ok: boolean
        mode?: 'fixture' | 'cli' | 'api'
        notice?: string | null
        response?: GenerateFigureResponse
        error?: string
      } = await res.json()

      if (!res.ok || !data.ok || !data.response) {
        // CRITICAL demo discipline: do NOT clear figureSpec on failure.
        // If the user has Maude loaded, leave it on screen. Show the error
        // as a non-blocking banner.
        setStatusMessage(`Extraction failed: ${data.error ?? 'unknown error'}`)
        setLoading(false)
        return
      }

      // 3. Success — store in cache and update UI.
      await setCachedResponse(trimmed, data.response)

      const candidate = data.response.candidates[data.response.selected_index ?? 0]
      if (!candidate) {
        // Same discipline: don't clear figureSpec on a malformed response.
        setStatusMessage('Extraction returned no candidates.')
        setLoading(false)
        return
      }

      setFigureSpec(candidate)
      setHoveredSpan(null)
      setPinnedSpan(null)
      setResolutions({})
      setResolveBatchStatus('idle')

      // 4. Display the server's notice (if any). Server owns the message;
      //    client just renders. When extract-api.ts ships, the same hook
      //    surfaces "live extraction took 12 seconds" or rate-limit messages.
      setStatusMessage(data.notice ?? null)
    } catch (err) {
      setStatusMessage(
        `Network error: ${err instanceof Error ? err.message : 'unknown'}`
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <h1>BioRender Figure Compiler</h1>
        <span className="meta">
          Source-grounded paper-to-figure compiler · prototype for the BioRender Product Builder application
        </span>
      </header>

      <div className="mode-bar">
        <button className="primary" onClick={loadMaudeExample}>
          Load Maude 2018 CAR-T example
        </button>
        <input
          type="text"
          placeholder="Or paste paper text..."
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
        />
        <button
          onClick={generateFromPasted}
          disabled={loading || pastedText.trim().length === 0}
        >
          {loading ? 'Compiling...' : 'Compile draft from pasted text'}
        </button>
      </div>

      {statusMessage && (
        <div className="status-banner" role="status">
          <span className="icon" aria-hidden="true">ⓘ</span>
          <span className="text">{statusMessage}</span>
        </div>
      )}

      <div className="workspace">
        <div className="figure-pane">
          {figureSpec ? (
            <>
              <FigurePreview
                figureSpec={figureSpec}
                onHoverSpan={setHoveredSpan}
                onSelectSpan={handleSelectSpan}
                resolutions={resolutions}
                resolveBatchStatus={resolveBatchStatus}
                onResolveAssets={resolveAllAssets}
              />
              {figureSpec.source.raw_text === MAUDE_2018_FIGURESPEC.source.raw_text && (
                <ComparisonSection />
              )}
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div className="empty-title">No figure loaded yet</div>
              <div className="hint">
                Click "Load Maude 2018 CAR-T example" above to see the canonical demo.
                Hover any entity, claim, or relationship to see the verbatim source span
                highlighted in the abstract pane.
              </div>
            </div>
          )}
        </div>
        {figureSpec ? (
          <SourceAbstract
            text={figureSpec.source.raw_text}
            hoveredSpan={hoveredSpan}
            pinnedSpan={pinnedSpan}
          />
        ) : (
          <div className="abstract-pane">
            <h3>Source abstract</h3>
            <div className="empty-state" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
              <div className="hint">
                Source text will appear here once a figure is loaded. Hovering elements
                in the figure highlights the verbatim text that produced them.
              </div>
            </div>
          </div>
        )}
      </div>

      {figureSpec && (() => {
        const report = validate(figureSpec)
        if (report.scientific_risks.length === 0) return null
        return (
          <div className="validation-drawer">
            <div className="summary">
              <span>
                {report.scientific_risks.length} validation note
                {report.scientific_risks.length > 1 ? 's' : ''}
              </span>
              <span className="summary-meta">
                validated by FigureSpec validator · verbatim source spans, structural checks
              </span>
            </div>
            <div className="risks">
              {report.scientific_risks.map((risk, i) => (
                <div key={i} className="risk-row">
                  <div className="label">
                    {risk.panel_id} · {risk.type.replace(/_/g, ' ')}
                  </div>
                  <div>{risk.description}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <footer className="app-footer">
        <span>
          Prototype for BioRender Product Builder application. MIT license. Code at{' '}
          <a href="https://github.com/gorajing/biorender-figure-compiler" style={{ color: 'var(--accent)' }}>
            github.com/gorajing/biorender-figure-compiler
          </a>
          .
        </span>
        <span>
          {figureSpec?.template_metadata?.citation_info.in_text ?? '—'}
        </span>
      </footer>
    </>
  )
}
