'use client'

import type {
  FigureSpec,
  Panel,
  Entity,
  Relationship,
  Claim,
  SourceSpan,
} from '@/core/schema'

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

type Props = {
  figureSpec: FigureSpec
  onHoverSpan: (span: SourceSpan | null) => void
  onSelectSpan: (span: SourceSpan) => void
  resolutions: Record<string, ResolutionState>
  resolveBatchStatus: 'idle' | 'running' | 'done' | 'error'
  onResolveAssets: () => void
}

/**
 * Renders a FigureSpec as a stack of panel cards. Each panel shows:
 *   - title + intent
 *   - entity chips (colored by EntityType)
 *   - relationship rows (verb + endpoints)
 *   - claim rows (with evidence_strength)
 *
 * Hovering any element emits its source_span up to the parent so the
 * SourceAbstract can highlight the corresponding text.
 *
 * Prototype rendering: text-only. Entity chips are colored labels, not
 * resolved BioRender icons. Relationships render as inline glyph rows
 * (verb + arrow), not SVG arrows on a canvas. This is intentional. The
 * prototype's job is to prove the FigureSpec contract; the canvas-side
 * rendering (icon resolution via BioRender's asset library, SVG geometry,
 * positional layout) lives downstream of the spec in a production version.
 */
export function FigurePreview({
  figureSpec,
  onHoverSpan,
  onSelectSpan,
  resolutions,
  resolveBatchStatus,
  onResolveAssets,
}: Props) {
  return (
    <div className="figure-preview">
      <h3 className="figure-eyebrow">Compiled FigureSpec draft</h3>
      <div className="figure-title">{figureSpec.meta.title}</div>
      <div className="figure-meta">
        {figureSpec.meta.audience} · {figureSpec.meta.figure_type} · {figureSpec.panels.length} panels
      </div>
      <EntityTypeLegend />
      <ResolveAssetsBar
        status={resolveBatchStatus}
        onResolve={onResolveAssets}
        resolutions={resolutions}
        figureSpec={figureSpec}
      />
      <div className="panels-row">
        {figureSpec.panels.map((panel) => (
          <PanelCard
            key={panel.id}
            panel={panel}
            onHoverSpan={onHoverSpan}
            onSelectSpan={onSelectSpan}
            resolutions={resolutions}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Single-button bar that triggers batch resolution via BioRender's
 * production MCP connector (https://mcp.services.biorender.com/mcp).
 * Shows count of resolved/total entities once a batch completes.
 */
function ResolveAssetsBar({
  status,
  onResolve,
  resolutions,
  figureSpec,
}: {
  status: 'idle' | 'running' | 'done' | 'error'
  onResolve: () => void
  resolutions: Record<string, ResolutionState>
  figureSpec: FigureSpec
}) {
  // Count unique entity names for the progress badge.
  const uniqueNames = new Set<string>()
  for (const panel of figureSpec.panels) {
    for (const entity of panel.entities) {
      uniqueNames.add(entity.name)
    }
  }
  const total = uniqueNames.size
  const resolved = Array.from(uniqueNames).filter(
    (n) => resolutions[n]?.kind === 'resolved'
  ).length
  const errors = Array.from(uniqueNames).filter(
    (n) => resolutions[n]?.kind === 'error'
  ).length

  return (
    <div className="resolve-bar">
      <button
        className="resolve-button"
        onClick={onResolve}
        disabled={status === 'running'}
        title="Calls BioRender's production MCP connector at mcp.services.biorender.com to find real BioRender icons matching each entity in this figure."
      >
        {status === 'running' ? 'Resolving via BioRender MCP…' : 'Resolve via BioRender MCP'}
      </button>
      {status !== 'idle' && (
        <span className="resolve-summary">
          {status === 'running' && `searching ${total} entities…`}
          {status === 'done' && `matched ${resolved} of ${total} entities`}
          {status === 'error' &&
            `matched ${resolved} of ${total} (${errors} error${errors === 1 ? '' : 's'})`}
        </span>
      )}
    </div>
  )
}

/**
 * Legend exposing the chip color → entity-type mapping. The colors aren't
 * confidence or validation status; they're the typed entity classification
 * the compiler assigned. Making this visible turns the chip palette from
 * "decorative" into "informative" and surfaces classification gaps (e.g.,
 * an omics method classified as "process" because the schema lacks a
 * "method" type yet).
 */
function EntityTypeLegend() {
  const items: Array<{ type: string; label: string }> = [
    { type: 'protein', label: 'cell · protein' },
    { type: 'molecule', label: 'molecule' },
    { type: 'tissue', label: 'tissue' },
    { type: 'process', label: 'process' },
    { type: 'concept', label: 'concept · organism' },
  ]
  return (
    <div className="entity-legend" aria-label="entity type color legend">
      <span className="entity-legend-label">Entity types</span>
      {items.map(({ type, label }) => (
        <span key={type} className="entity-legend-item">
          <span className={`entity-legend-dot ${type}`} aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  )
}

type RowHandlers = {
  onHoverSpan: (span: SourceSpan | null) => void
  onSelectSpan: (span: SourceSpan) => void
}

function PanelCard({
  panel,
  onHoverSpan,
  onSelectSpan,
  resolutions,
}: { panel: Panel; resolutions: Record<string, ResolutionState> } & RowHandlers) {
  return (
    <div className="panel-card">
      <span className="panel-id">{panel.id}</span>
      <h4>{panel.title}</h4>
      <div className="intent">{panel.intent}</div>

      {panel.entities.length > 0 && (
        <div className="panel-entities">
          {panel.entities.map((entity) => (
            <EntityChip
              key={entity.id}
              entity={entity}
              onHoverSpan={onHoverSpan}
              onSelectSpan={onSelectSpan}
              resolution={resolutions[entity.name]}
            />
          ))}
        </div>
      )}

      {panel.relationships.length > 0 && (
        <div className="panel-relationships">
          {panel.relationships.map((rel, i) => (
            <RelationshipRow
              key={`${rel.from_entity_id}-${rel.to_entity_id}-${i}`}
              relationship={rel}
              entities={panel.entities}
              onHoverSpan={onHoverSpan}
              onSelectSpan={onSelectSpan}
            />
          ))}
        </div>
      )}

      {panel.claims.length > 0 && (
        <div className="panel-claims">
          {panel.claims.map((claim, i) => (
            <ClaimRow
              key={i}
              claim={claim}
              onHoverSpan={onHoverSpan}
              onSelectSpan={onSelectSpan}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EntityChip({
  entity,
  onHoverSpan,
  onSelectSpan,
  resolution,
}: { entity: Entity; resolution: ResolutionState | undefined } & RowHandlers) {
  const topMatch =
    resolution?.kind === 'resolved' && resolution.matches.length > 0
      ? resolution.matches[0]
      : null

  // Compose the title attribute. Without resolution, just chip metadata
  // and the click-to-jump hint. With resolution, also include the top
  // BioRender match so the user can see what the MCP returned without
  // breaking the chip's compact visual layout.
  const baseTitle = `${entity.type}: ${entity.name} · click to jump to source`
  const titleWithMatch = topMatch
    ? `${baseTitle}\n\nBioRender match: ${topMatch.name}\n${topMatch.description}`
    : resolution?.kind === 'error'
      ? `${baseTitle}\n\nBioRender resolution failed: ${resolution.error}`
      : baseTitle

  // Status indicator: emoji-free, monochrome, accessible.
  // ✓ resolved with at least one placeable match
  // · resolved but no placeable match (still a result, just lower confidence)
  // ! error
  // (nothing) idle / loading
  let statusGlyph: string | null = null
  if (resolution?.kind === 'resolved') {
    statusGlyph = topMatch ? '✓' : '·'
  } else if (resolution?.kind === 'error') {
    statusGlyph = '!'
  } else if (resolution?.kind === 'loading') {
    statusGlyph = '…'
  }

  return (
    <span
      className={`entity-chip ${entity.type}`}
      onMouseEnter={() => onHoverSpan(entity.source_span)}
      onMouseLeave={() => onHoverSpan(null)}
      onClick={() => onSelectSpan(entity.source_span)}
      title={titleWithMatch}
      data-resolution={resolution?.kind ?? 'idle'}
    >
      {entity.name}
      {statusGlyph && (
        <span className="entity-chip-status" aria-hidden="true">
          {statusGlyph}
        </span>
      )}
    </span>
  )
}

function RelationshipRow({
  relationship,
  entities,
  onHoverSpan,
  onSelectSpan,
}: { relationship: Relationship; entities: Entity[] } & RowHandlers) {
  const fromEntity = entities.find((e) => e.id === relationship.from_entity_id)
  const toEntity = entities.find((e) => e.id === relationship.to_entity_id)
  const fromName = fromEntity?.name ?? relationship.from_entity_id
  const toName = toEntity?.name ?? relationship.to_entity_id

  // Render the connector glyph based on connector_style.
  const arrow =
    relationship.connector_style === 'arrowhead'
      ? '→'
      : relationship.connector_style === 'blunt_end'
      ? '⊣'
      : relationship.connector_style === 'dashed'
      ? '⇢'
      : '—'

  return (
    <div
      className="relationship-row"
      onMouseEnter={() => onHoverSpan(relationship.source_span)}
      onMouseLeave={() => onHoverSpan(null)}
      onClick={() => onSelectSpan(relationship.source_span)}
      title={`${relationship.type} (${relationship.connector_style}) · click to jump to source`}
    >
      <span>{fromName}</span>
      <span className="relationship-verb">{relationship.type}</span>
      <span>{arrow}</span>
      <span>{toName}</span>
    </div>
  )
}

function ClaimRow({
  claim,
  onHoverSpan,
  onSelectSpan,
}: { claim: Claim } & RowHandlers) {
  return (
    <div
      className="claim-row"
      onMouseEnter={() => onHoverSpan(claim.source_span)}
      onMouseLeave={() => onHoverSpan(null)}
      onClick={() => onSelectSpan(claim.source_span)}
      title="click to jump to source"
    >
      <span className="strength">[{claim.evidence_strength}]</span>
      {claim.text}
    </div>
  )
}
