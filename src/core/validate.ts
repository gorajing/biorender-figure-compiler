/**
 * FigureSpec validator.
 *
 * Pure function: takes a FigureSpec, returns a ValidationReport that merges
 * the spec's pre-declared warnings (domain knowledge from the source) with
 * computed warnings (structural correctness checks).
 *
 * Layers:
 *   1. Verbatim source-span check. Every entity, claim, relationship.
 *   2. Structural checks. Connector_style mismatch, orphan refs, layout fit.
 *   3. Heuristic checks (future). Label density, color contrast.
 *
 * Schema validation (Zod) happens separately at extract/load time. This
 * validator assumes the input has already passed Zod parsing.
 *
 * The pre-declared warnings carried in `figureSpec.validation.scientific_risks`
 * stay in the output. Computed warnings get appended. The two are merged so
 * the demo can show both kinds of insight side by side.
 */

import {
  type FigureSpec,
  type ScientificRisk,
  defaultConnectorStyle,
} from './schema'

// Re-derive ValidationReport type (same shape as FigureSpec.validation).
// schema.ts doesn't export this directly because it's defined inline.
type ValidationReport = FigureSpec['validation']

export function validate(spec: FigureSpec): ValidationReport {
  const computedRisks: ScientificRisk[] = []
  const computedMissingAssets: string[] = []

  for (const panel of spec.panels) {
    // ---------- Layer 1: verbatim source-span check ----------

    for (const claim of panel.claims) {
      const actual = spec.source.raw_text.slice(
        claim.source_span.start,
        claim.source_span.end
      )
      if (actual !== claim.source_span.text) {
        computedRisks.push({
          panel_id: panel.id,
          type: 'unsupported_claim',
          description:
            `Claim source span drift: position ${claim.source_span.start}-${claim.source_span.end} ` +
            `contains "${truncate(actual, 60)}" but span text claims "${truncate(claim.source_span.text, 60)}". ` +
            `Either the abstract was modified after extraction or the span offsets are wrong.`,
          source_span: claim.source_span,
        })
      }
    }

    for (const entity of panel.entities) {
      const actual = spec.source.raw_text.slice(
        entity.source_span.start,
        entity.source_span.end
      )
      if (actual !== entity.source_span.text) {
        computedRisks.push({
          panel_id: panel.id,
          type: 'ambiguous_entity',
          description:
            `Entity "${entity.name}" source span drift at position ` +
            `${entity.source_span.start}-${entity.source_span.end}. ` +
            `Found "${truncate(actual, 60)}" instead of "${truncate(entity.source_span.text, 60)}".`,
          source_span: entity.source_span,
        })
      }
    }

    for (const rel of panel.relationships) {
      const actual = spec.source.raw_text.slice(
        rel.source_span.start,
        rel.source_span.end
      )
      if (actual !== rel.source_span.text) {
        computedRisks.push({
          panel_id: panel.id,
          type: 'unsupported_claim',
          description:
            `Relationship "${rel.type}" source span drift. Found "${truncate(actual, 60)}" ` +
            `instead of "${truncate(rel.source_span.text, 60)}".`,
          source_span: rel.source_span,
        })
      }
    }

    // ---------- Layer 2: structural checks ----------

    // Relationship connector_style should match the default for the verb,
    // unless explicitly overridden for stylistic reasons. Mismatch → pathway_conflict.
    for (const rel of panel.relationships) {
      const expectedStyle = defaultConnectorStyle(rel.type)
      if (rel.connector_style !== expectedStyle) {
        computedRisks.push({
          panel_id: panel.id,
          type: 'pathway_conflict',
          description:
            `Relationship "${rel.type}" usually renders with connector_style "${expectedStyle}" ` +
            `but this spec uses "${rel.connector_style}". Verify pathway directionality is intended.`,
          source_span: rel.source_span,
        })
      }
    }

    // Entity references in relationships must exist in the panel's entities.
    const entityIds = new Set(panel.entities.map((e) => e.id))
    for (const rel of panel.relationships) {
      if (!entityIds.has(rel.from_entity_id)) {
        computedRisks.push({
          panel_id: panel.id,
          type: 'ambiguous_entity',
          description:
            `Relationship "${rel.type}" references from_entity_id "${rel.from_entity_id}" ` +
            `which is not in this panel's entities. Likely a stale reference after a panel edit.`,
        })
      }
      if (!entityIds.has(rel.to_entity_id)) {
        computedRisks.push({
          panel_id: panel.id,
          type: 'ambiguous_entity',
          description:
            `Relationship "${rel.type}" references to_entity_id "${rel.to_entity_id}" ` +
            `which is not in this panel's entities. Likely a stale reference after a panel edit.`,
        })
      }
    }

    // Claim panel_id should match the panel it lives in.
    for (const claim of panel.claims) {
      if (claim.panel_id !== panel.id) {
        computedRisks.push({
          panel_id: panel.id,
          type: 'ambiguous_entity',
          description:
            `Claim has panel_id "${claim.panel_id}" but lives in panel "${panel.id}". ` +
            `Internal reference inconsistency.`,
          source_span: claim.source_span,
        })
      }
    }

    // Layout-specific structural checks.
    if (panel.layout === 'compare_contrast_split') {
      // compare_contrast_split should have exactly 2 entities (one per side).
      // Soft heuristic, not a hard error.
      if (panel.entities.length !== 2) {
        computedRisks.push({
          panel_id: panel.id,
          type: 'directionality_uncertain',
          description:
            `Panel uses 'compare_contrast_split' layout but has ${panel.entities.length} entities. ` +
            `This layout is designed for two-sided comparisons (known vs new).`,
        })
      }
    }
  }

  // ---------- Merge pre-declared with computed ----------

  return {
    missing_assets: [...spec.validation.missing_assets, ...computedMissingAssets],
    scientific_risks: [...spec.validation.scientific_risks, ...computedRisks],
    accessibility_checks: spec.validation.accessibility_checks,
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
