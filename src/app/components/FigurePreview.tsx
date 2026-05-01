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
 * Day 1 renderer: rectangles, labels, hover-highlight. No Fabric.js (Day 2).
 * No SVG arrows between entities (Day 2-3). No icon resolution (Day 2).
 * The point is provenance + structure, not visual polish.
 */
export function FigurePreview({ figureSpec, onHoverSpan }: Props) {
  return (
    <div className="figure-preview">
      <h3 className="figure-eyebrow">Compiled FigureSpec draft</h3>
      <div className="figure-title">{figureSpec.meta.title}</div>
      <div className="figure-meta">
        {figureSpec.meta.audience} · {figureSpec.meta.figure_type} · {figureSpec.panels.length} panels
      </div>
      <div className="panels-row">
        {figureSpec.panels.map((panel) => (
          <PanelCard key={panel.id} panel={panel} onHoverSpan={onHoverSpan} />
        ))}
      </div>
    </div>
  )
}

function PanelCard({
  panel,
  onHoverSpan,
}: {
  panel: Panel
  onHoverSpan: (span: SourceSpan | null) => void
}) {
  return (
    <div className="panel-card">
      <span className="panel-id">{panel.id}</span>
      <h4>{panel.title}</h4>
      <div className="intent">{panel.intent}</div>

      {panel.entities.length > 0 && (
        <div className="panel-entities">
          {panel.entities.map((entity) => (
            <EntityChip key={entity.id} entity={entity} onHoverSpan={onHoverSpan} />
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
            />
          ))}
        </div>
      )}

      {panel.claims.length > 0 && (
        <div className="panel-claims">
          {panel.claims.map((claim, i) => (
            <ClaimRow key={i} claim={claim} onHoverSpan={onHoverSpan} />
          ))}
        </div>
      )}
    </div>
  )
}

function EntityChip({
  entity,
  onHoverSpan,
}: {
  entity: Entity
  onHoverSpan: (span: SourceSpan | null) => void
}) {
  return (
    <span
      className={`entity-chip ${entity.type}`}
      onMouseEnter={() => onHoverSpan(entity.source_span)}
      onMouseLeave={() => onHoverSpan(null)}
      title={`${entity.type}: ${entity.name}`}
    >
      {entity.name}
    </span>
  )
}

function RelationshipRow({
  relationship,
  entities,
  onHoverSpan,
}: {
  relationship: Relationship
  entities: Entity[]
  onHoverSpan: (span: SourceSpan | null) => void
}) {
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
      title={`${relationship.type} (${relationship.connector_style})`}
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
}: {
  claim: Claim
  onHoverSpan: (span: SourceSpan | null) => void
}) {
  return (
    <div
      className="claim-row"
      onMouseEnter={() => onHoverSpan(claim.source_span)}
      onMouseLeave={() => onHoverSpan(null)}
    >
      <span className="strength">[{claim.evidence_strength}]</span>
      {claim.text}
    </div>
  )
}
