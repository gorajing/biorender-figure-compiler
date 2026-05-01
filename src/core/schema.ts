/**
 * FigureSpec: the central primitive of biorender-figure-compiler.
 *
 * Same architectural pattern as the Sales tool's three-layer contract:
 *   evidence (verbatim source spans)
 *     -> drafting (structured FigureSpec)
 *     -> critique (validation report).
 *
 * Mirrored from sales touches into scientific figures. Every claim and
 * every entity carries a verbatim source span. The validator's job is to
 * reject any claim text that is not a literal substring of its source.
 *
 * Schema version history:
 *   v0   (2026-04-29): initial scaffolding
 *   v1   (2026-04-30): layout expansion, connector_style on relationship,
 *                      candidate_variants, template_metadata,
 *                      refinement_history, panel.input_step_ids,
 *                      panel.resolution_kind, panel.panel_connector_style,
 *                      audience enum expansion, entity type expansion
 *                      (protein_structure, chem_structure)
 *   v1.1 (2026-04-30): repeated_unit entity type for bio-brush-style
 *                      structures (DNA, membranes, protein chains)
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Provenance: verbatim substring of the input abstract.
// ---------------------------------------------------------------------------

export const SourceSpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string().min(1),
})
export type SourceSpan = z.infer<typeof SourceSpanSchema>

// ---------------------------------------------------------------------------
// Resolved BioRender asset. Currently: typed interface only, with a non-invoked
// mock in biorender-adapter-mock.ts. A production version would call BioRender's
// real asset/template APIs (see BIORENDER_API_CONTRACT.md).
// ---------------------------------------------------------------------------

export const ResolvedAssetSchema = z.object({
  search_query: z.string(),
  biorender_id: z.string().optional(),
  url: z.string().url().optional(),
  source: z.enum(['biorender_mcp', 'mocked', 'biorender_api']),
})
export type ResolvedAsset = z.infer<typeof ResolvedAssetSchema>

// ---------------------------------------------------------------------------
// Bio-brush kinds (v1.1). Maps to BioRender's repeated-unit assets.
// Per Dan, Aoki webinar (2026-03-24):
//   "We've developed bio brushes to provide optimal editability for biological
//    structures that are composed of repeated units. Think of membranes made
//    of phospholipids, DNA made of nucleotides, proteins made of peptides, or
//    even cell layers like epithelium."
// ---------------------------------------------------------------------------

export const BrushKindSchema = z.enum([
  'dna_double_helix',     // two backbones, base-pair units
  'membrane',             // phospholipid bilayer
  'protein_chain',        // peptide units
  'rna_strand',           // single-strand nucleotides
  'cell_layer',           // epithelium / endothelium
  'collagen_fiber',
  'microtubule',
  'actin_filament',
])
export type BrushKind = z.infer<typeof BrushKindSchema>

export const RepeatPatternSchema = z.object({
  brush_kind: BrushKindSchema,
  unit_count: z.number().int().positive(),
  axis: z.enum(['horizontal', 'vertical', 'curved']),
  curvature_points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  layer_styles: z.record(z.string(), z.string()).optional(),
})
export type RepeatPattern = z.infer<typeof RepeatPatternSchema>

// ---------------------------------------------------------------------------
// Biological entity taxonomy (v1 + v1.1).
//   v1: added protein_structure (PDB), chem_structure (SMILES)
//   v1.1: added repeated_unit (bio brushes)
// ---------------------------------------------------------------------------

export const EntityTypeSchema = z.enum([
  'cell',                 // T cell, tumor cell, neuron
  'protein',              // CAR receptor, antibody, kinase (2D BioRender icon)
  'protein_structure',    // PDB ID -> PDB Builder
  'molecule',             // ATP, drug compound, cytokine (2D icon)
  'chem_structure',       // SMILES -> ChemRender
  'gene',                 // gene name or transcript
  'tissue',               // tumor, brain region, liver
  'organism',             // mouse, human, zebrafish
  'process',              // signaling pathway, cell-cycle phase
  'apparatus',            // syringe, plate, instrument
  'repeated_unit',        // bio brushes (DNA, membrane, protein chain, etc.)
  'concept',              // catch-all for diagrammatic concepts
])
export type EntityType = z.infer<typeof EntityTypeSchema>

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: EntityTypeSchema,
  source_span: SourceSpanSchema,
  asset_query: z.string(),
  resolved_asset: ResolvedAssetSchema.optional(),
  // Required when type === 'repeated_unit'.
  // The structural validator (validate.ts) enforces this at runtime.
  repeat_pattern: RepeatPatternSchema.optional(),
})
export type Entity = z.infer<typeof EntitySchema>

// ---------------------------------------------------------------------------
// Connector style for relationship arrows (v1).
//
// Per BioRender's published guidance on figure conventions (Tokarz, "Anatomy
// of a Figure" webinar): arrowheads indicate advancement; lines and blunt-ends
// indicate inhibition. The mapping below encodes that convention.
//
// Default mappings (enforced by validate.ts):
//   binds, activates, transforms_into, transports, flows_to, recognizes,
//   modifies                              -> arrowhead
//   inhibits                              -> blunt_end
//   co_localizes                          -> line
//   any with evidence_strength: speculative -> dashed (overrides above)
// ---------------------------------------------------------------------------

export const ConnectorStyleSchema = z.enum([
  'arrowhead',
  'line',
  'dashed',
  'blunt_end',
])
export type ConnectorStyle = z.infer<typeof ConnectorStyleSchema>

// ---------------------------------------------------------------------------
// Relationships between entities (v1).
// Added connector_style with default-mapping logic enforced in validate.ts.
// ---------------------------------------------------------------------------

export const RelationshipTypeSchema = z.enum([
  'binds',
  'activates',
  'inhibits',
  'transforms_into',
  'transports',
  'flows_to',
  'recognizes',
  'modifies',
  'co_localizes',
])
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>

export const RelationshipSchema = z.object({
  from_entity_id: z.string(),
  to_entity_id: z.string(),
  type: RelationshipTypeSchema,
  source_span: SourceSpanSchema,
  label: z.string().optional(),
  connector_style: ConnectorStyleSchema,
})
export type Relationship = z.infer<typeof RelationshipSchema>

// ---------------------------------------------------------------------------
// Claims: a textual assertion the figure is making, with provenance.
// Same shape as Sales tool evidence layer.
// ---------------------------------------------------------------------------

export const ClaimSchema = z.object({
  panel_id: z.string(),
  text: z.string().min(1),
  source_span: SourceSpanSchema,
  evidence_strength: z.enum(['direct', 'inferred', 'speculative']),
})
export type Claim = z.infer<typeof ClaimSchema>

// ---------------------------------------------------------------------------
// Layout primitives (v1: 7 types, was 5 in v0).
//   Added grid_with_row_bridge (Custom Figure Option 3 pattern, observed
//     during in-product walkthrough 2026-04-30)
//   Added compare_contrast_split (Tokarz "Anatomy of a Figure" pattern,
//     also seen in BioRender's "AI vs Traditional" template series)
// ---------------------------------------------------------------------------

export const LayoutSchema = z.enum([
  'left_to_right_process',
  'top_down_pathway',
  'circular_loop',
  'grid',
  'central_radial',           // hub-and-spoke (e.g., a cell with surface receptors)
  'grid_with_row_bridge',     // multi-row grid with one panel as bridge between rows
  'compare_contrast_split',   // identical positioning, two sides, novelty on the right
])
export type Layout = z.infer<typeof LayoutSchema>

// ---------------------------------------------------------------------------
// Step connector style (v1). NOT to be confused with Relationship.connector_style.
//
// Relationship.connector_style is for arrows BETWEEN two entities WITHIN a panel.
// Step connector style is for how panels CONNECT to each other across the layout
// (the inter-panel connector that sequences a multi-panel figure).
//
// Generate Protocol's output uses 'numbered_badge'.
// CAR-T mechanism uses 'arrow'.
// Grid layouts use 'none'.
// ---------------------------------------------------------------------------

export const StepConnectorStyleSchema = z.enum([
  'numbered_badge',           // First Draft Builder style
  'arrow',                    // graphical abstract style
  'connector_line',           // pipeline diagrams
  'none',                     // grids
])
export type StepConnectorStyle = z.infer<typeof StepConnectorStyleSchema>

// ---------------------------------------------------------------------------
// Resolution kind (v1). What did this panel resolve to?
//   icon: single icon
//   template: existing community template (with adaptation)
//   layout_of_icons: fresh layout composed of resolved icons
// ---------------------------------------------------------------------------

export const ResolutionKindSchema = z.enum([
  'icon',
  'template',
  'layout_of_icons',
])
export type ResolutionKind = z.infer<typeof ResolutionKindSchema>

// ---------------------------------------------------------------------------
// Validation: scientific risk + accessibility.
// ---------------------------------------------------------------------------

export const ScientificRiskSchema = z.object({
  panel_id: z.string(),
  type: z.enum([
    'unsupported_claim',          // claim text not a substring of source
    'missing_control',
    'ambiguous_entity',
    'directionality_uncertain',
    'pathway_conflict',           // e.g., inhibits relationship with arrowhead
  ]),
  description: z.string(),
  source_span: SourceSpanSchema.optional(),
})
export type ScientificRisk = z.infer<typeof ScientificRiskSchema>

export const AccessibilityCheckSchema = z.object({
  type: z.enum([
    'contrast',
    'grayscale_legibility',
    'label_density',
    'colorblind_safe',
  ]),
  status: z.enum(['pass', 'warning', 'fail']),
  detail: z.string(),
})
export type AccessibilityCheck = z.infer<typeof AccessibilityCheckSchema>

// ---------------------------------------------------------------------------
// Panel: one figure panel (v1).
//
// id is stable across regenerations of the same input. A production version
// would carry these IDs through to BioRender's editor and PPTX export so that
// individual panels remain editable downstream and so re-compiling an updated
// paper can produce a structural diff against the previous spec. BioRender's
// public PptxGenJS fork shows comparable semantic-tag patterns (e.g. the
// brc-15775 image-tag PR). The current prototype does not implement PPTX export.
//
// input_step_ids makes merge decisions EXPLICIT. This is the user-facing
// differentiator vs. Custom Figure today (where merge decisions are hidden).
// ---------------------------------------------------------------------------

export const PanelSchema = z.object({
  id: z.string(),
  title: z.string(),
  intent: z.string(),
  entities: z.array(EntitySchema),
  relationships: z.array(RelationshipSchema),
  layout: LayoutSchema,
  claims: z.array(ClaimSchema),
  biorender_queries: z.array(z.string()),
  resolved_assets: z.array(ResolvedAssetSchema),
  exportTags: z.array(z.string()).optional(),
  // v1 additions
  input_step_ids: z.array(z.string()),         // which input steps this panel represents
  resolution_kind: ResolutionKindSchema,
  step_connector_style: StepConnectorStyleSchema,
})
export type Panel = z.infer<typeof PanelSchema>

// ---------------------------------------------------------------------------
// Template metadata (v1). Marketplace-flywheel hooks.
//
// BioRender's templates are first-class scientific assets with citation
// infrastructure (APA, in-text), acknowledgement chains (creator + co-authors
// + paper inspiration + template lineage) and stable URLs. Top creators like
// Akiko Iwasaki maintain dozens of published templates with download counts
// ranging from low-thousands to tens-of-thousands per template (e.g. her
// CTLA-4/PD-1 signaling template at 19.71K views / 8.83K downloads as of
// April 2026).
//
// FigureSpec output inherits this structure so generated figures can flow
// into the marketplace (per Aoki's "AI and community" tease).
// ---------------------------------------------------------------------------

export const AcknowledgementSchema = z.object({
  name: z.string(),
  role: z.enum(['creator', 'co_author', 'inspired_by_paper', 'inspired_by_template']),
  source_doi: z.string().optional(),
  source_template_id: z.string().optional(),
})
export type Acknowledgement = z.infer<typeof AcknowledgementSchema>

export const CitationInfoSchema = z.object({
  in_text: z.string(),                          // "Choi, J. (2026) BioRender."
  apa_full: z.string(),                         // full APA citation with URL
  bibtex: z.string().optional(),
})
export type CitationInfo = z.infer<typeof CitationInfoSchema>

export const TemplateMetadataSchema = z.object({
  creator: z.string(),
  acknowledgements: z.array(AcknowledgementSchema),
  derived_from_template_ids: z.array(z.string()),
  source_paper_doi: z.string().optional(),
  citation_info: CitationInfoSchema,
  marketplace_eligibility: z.enum(['private', 'community_draft', 'verified_creator']),
})
export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>

// ---------------------------------------------------------------------------
// Refinement history (v1). Captures the diff chain from initial extraction.
//
// BioRender's Modify Image is prompt-based and burns 10 credits per iteration.
// FigureSpec turns refinement into a free user action because we diff the
// spec instead of regenerating the image. The chain is preserved here.
// ---------------------------------------------------------------------------

export const RefinementSchema = z.object({
  timestamp: z.string().datetime(),
  prompt: z.string(),                            // user's natural-language refinement
  diff: z.unknown(),                             // JSON Patch describing the spec change
  preserved_panel_ids: z.array(z.string()),      // panels that didn't change
})
export type Refinement = z.infer<typeof RefinementSchema>

// ---------------------------------------------------------------------------
// FigureSpec audience enum (v1: expanded from 4 to 11 values).
//
// First six map to BioRender's existing AI generators or content surfaces.
// 'mechanism' is the new wedge (the 20-credit Custom Figure category, structured).
// Last four tie to PDB Builder, ChemRender, and the Data Analysis tool.
// ---------------------------------------------------------------------------

export const AudienceSchema = z.enum([
  'graphical_abstract',
  'methods_figure',
  'grant_figure',
  'protocol_diagram',
  'protocol',                  // First Draft Builder style
  'timeline',
  'flowchart',
  'mechanism',                 // the new wedge: structured Custom Figure
  'molecular_panel',           // PDB Builder-style
  'chem_panel',                // ChemRender-style
  'data_panel',                // BioRender Graphing-style
])
export type Audience = z.infer<typeof AudienceSchema>

// ---------------------------------------------------------------------------
// FigureSpec: the central primitive (v1).
//
// Represents ONE figure. The 3-option UX (candidates) is modeled separately
// in GenerateFigureResponse below to keep this type focused.
// ---------------------------------------------------------------------------

export const FigureSpecSchema = z.object({
  meta: z.object({
    title: z.string(),
    audience: AudienceSchema,
    figure_type: z.string(),
    figureVersion: z.number().int().positive(),
  }),
  source: z.object({
    raw_text: z.string(),
    extracted_at: z.string().datetime(),
  }),
  panels: z.array(PanelSchema).min(1),
  global_style: z.object({
    background: z.string(),
    label_density: z.enum(['minimal', 'medium', 'dense']),
    color_semantics: z.record(z.string(), z.string()),
  }),
  validation: z.object({
    missing_assets: z.array(z.string()),
    scientific_risks: z.array(ScientificRiskSchema),
    accessibility_checks: z.array(AccessibilityCheckSchema),
  }),
  export: z.object({
    pptxTags: z.array(z.string()),
    panel_ids_stable_for_diff: z.array(z.string()),
    alt_text: z.string(),
  }),
  // v1 additions
  template_metadata: TemplateMetadataSchema.optional(),
  refinement_history: z.array(RefinementSchema).optional(),
})
export type FigureSpec = z.infer<typeof FigureSpecSchema>

// ---------------------------------------------------------------------------
// GenerateFigureResponse: wraps the 3-candidate UX (mirrors Custom Figure).
//
// The extractor returns this shape. The frontend shows all candidates,
// the user picks one, and `selected_index` gets filled. The selected
// FigureSpec moves through the rest of the pipeline (validate, render, export).
// ---------------------------------------------------------------------------

export const GenerateFigureResponseSchema = z.object({
  candidates: z.array(FigureSpecSchema).min(1).max(5),
  selected_index: z.number().int().nonnegative().optional(),
})
export type GenerateFigureResponse = z.infer<typeof GenerateFigureResponseSchema>

// ---------------------------------------------------------------------------
// Default connector_style mapping for relationships.
// Used by extract.ts to seed defaults; validate.ts to flag mismatches.
// ---------------------------------------------------------------------------

export function defaultConnectorStyle(relationshipType: RelationshipType): ConnectorStyle {
  switch (relationshipType) {
    case 'inhibits':
      return 'blunt_end'
    case 'co_localizes':
      return 'line'
    case 'binds':
    case 'activates':
    case 'transforms_into':
    case 'transports':
    case 'flows_to':
    case 'recognizes':
    case 'modifies':
      return 'arrowhead'
  }
}
