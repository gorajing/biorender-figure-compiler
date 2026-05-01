'use client'

import type {
  FigureSpec,
  Panel,
  Entity,
  Relationship,
  Claim,
  SourceSpan,
} from '@/core/schema'

type Props = {
  figureSpec: FigureSpec
  onHoverSpan: (span: SourceSpan | null) => void
  onSelectSpan: (span: SourceSpan) => void
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
export function FigurePreview({ figureSpec, onHoverSpan, onSelectSpan }: Props) {
  return (
    <div className="figure-preview">
      <h3 className="figure-eyebrow">Compiled FigureSpec draft</h3>
      <div className="figure-title">{figureSpec.meta.title}</div>
      <div className="figure-meta">
        {figureSpec.meta.audience} · {figureSpec.meta.figure_type} · {figureSpec.panels.length} panels
      </div>
      <EntityTypeLegend />
      <div className="panels-row">
        {figureSpec.panels.map((panel) => (
          <PanelCard
            key={panel.id}
            panel={panel}
            onHoverSpan={onHoverSpan}
            onSelectSpan={onSelectSpan}
          />
        ))}
      </div>
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
}: { panel: Panel } & RowHandlers) {
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
}: { entity: Entity } & RowHandlers) {
  return (
    <span
      className={`entity-chip ${entity.type}`}
      onMouseEnter={() => onHoverSpan(entity.source_span)}
      onMouseLeave={() => onHoverSpan(null)}
      onClick={() => onSelectSpan(entity.source_span)}
      title={`${entity.type}: ${entity.name} · click to jump to source`}
    >
      {entity.name}
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
