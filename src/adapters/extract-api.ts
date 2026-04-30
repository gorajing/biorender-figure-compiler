/**
 * extract-api.ts — Anthropic SDK adapter for live FigureSpec extraction.
 *
 * Architecture (two-schema pattern):
 *
 *   1. Model produces a COMPACT generation schema: text + verbatim source
 *      quotes + types. No offsets, no IDs, no derived fields.
 *   2. Server NORMALIZES into the full FigureSpec: computes source span
 *      offsets via findSpan(), generates stable IDs, maps connector styles
 *      via defaultConnectorStyle(), fills defaults.
 *   3. Server VALIDATES the result with Zod and runs validate() to flag
 *      structural issues.
 *
 * Why this split: models are reliable at producing typed text + verbatim
 * quotes. Models are unreliable at exact byte offsets, ID generation, default
 * inference. Don't ask the model to do what the server can do deterministically.
 *
 * Time-boxing: AbortController with 30-second default cap. A hung extraction
 * is worse than a failed one. Demo invariant: nothing the user does hangs
 * the UI.
 *
 * Failure mode: throws a clear error. The API route returns 500. The client
 * preserves the existing figureSpec on screen. Never let a failed live
 * extraction destroy the user's working document.
 *
 * Activation: requires EXTRACT_MODE=api AND ANTHROPIC_API_KEY in the
 * environment. Without both, the extract.ts router falls through to fixture
 * mode with a console.warn.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import {
  type FigureSpec,
  type GenerateFigureResponse,
  type SourceSpan,
  FigureSpecSchema,
  EntityTypeSchema,
  RelationshipTypeSchema,
  LayoutSchema,
  AudienceSchema,
  defaultConnectorStyle,
} from '@/core/schema'

// ----------------------------------------------------------------------------
// Compact generation schema (model-facing).
// Smaller than FigureSpec because the model only produces facts, not structure.
// ----------------------------------------------------------------------------

const GenSourceQuoteSchema = z.string().min(1).max(500)

const GenEntitySchema = z.object({
  name: z.string().min(1),
  type: EntityTypeSchema,
  source_quote: GenSourceQuoteSchema,
})

const GenRelationshipSchema = z.object({
  from: z.string().min(1), // entity name (server resolves to id)
  to: z.string().min(1),
  type: RelationshipTypeSchema,
  source_quote: GenSourceQuoteSchema,
  label: z.string().optional(),
})

const GenClaimSchema = z.object({
  text: z.string().min(1),
  source_quote: GenSourceQuoteSchema,
  evidence_strength: z.enum(['direct', 'inferred', 'speculative']),
})

const GenPanelSchema = z.object({
  title: z.string().min(1),
  intent: z.string().min(1),
  entities: z.array(GenEntitySchema),
  relationships: z.array(GenRelationshipSchema),
  claims: z.array(GenClaimSchema),
  layout: LayoutSchema,
  input_step_ids: z.array(z.string()),
})

const GenFigureSpecSchema = z.object({
  title: z.string().min(1),
  audience: AudienceSchema,
  label_density: z.enum(['minimal', 'medium', 'dense']),
  panels: z.array(GenPanelSchema).min(1).max(10),
})

const GenResponseSchema = z.object({
  candidates: z.array(GenFigureSpecSchema).min(1).max(3),
})

type GenResponse = z.infer<typeof GenResponseSchema>
type GenFigureSpec = z.infer<typeof GenFigureSpecSchema>
type GenPanel = z.infer<typeof GenPanelSchema>

// ----------------------------------------------------------------------------
// System prompt. Reuses our schema enums so Claude knows the valid values.
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a scientific figure compiler. Given a paper abstract, produce up to 3 candidate FigureSpec structures that would render as graphical abstracts.

CRITICAL RULES:
1. Every entity name MUST appear as a verbatim phrase in the input abstract.
2. Every source_quote MUST be a verbatim substring of the input abstract (case-sensitive).
3. Do NOT invent claims, entities, or relationships not supported by the abstract.
4. The 3 candidates should differ in panel grouping (which input sections merge into which panels) and layout choice, NOT in extracted facts. They should share the same set of entities, relationships, and claims; only how those are organized into panels should vary.
5. If the abstract is too short or too unstructured to support 3 candidates, return fewer (1-2 is acceptable).

VALID ENUM VALUES:
- entity type: cell, protein, protein_structure, molecule, chem_structure, gene, tissue, organism, process, apparatus, repeated_unit, concept
- relationship type: binds, activates, inhibits, transforms_into, transports, flows_to, recognizes, modifies, co_localizes
- layout: left_to_right_process, top_down_pathway, circular_loop, grid, central_radial, grid_with_row_bridge, compare_contrast_split
- audience: graphical_abstract, methods_figure, grant_figure, protocol_diagram, protocol, timeline, flowchart, mechanism, molecular_panel, chem_panel, data_panel
- evidence_strength: direct, inferred, speculative
- label_density: minimal, medium, dense

OUTPUT FORMAT:
Return ONLY a JSON object matching this shape. No preamble, no markdown code fences, no commentary:

{
  "candidates": [
    {
      "title": "string (derived from paper)",
      "audience": "graphical_abstract" (or other valid value),
      "label_density": "medium" (or minimal/dense),
      "panels": [
        {
          "title": "string",
          "intent": "string (one-sentence description)",
          "entities": [
            { "name": "verbatim phrase from abstract", "type": "cell" (or other), "source_quote": "verbatim substring" }
          ],
          "relationships": [
            { "from": "entity-name", "to": "entity-name", "type": "activates" (or other), "source_quote": "verbatim substring", "label": "optional human label" }
          ],
          "claims": [
            { "text": "claim text", "source_quote": "verbatim substring", "evidence_strength": "direct" (or inferred/speculative) }
          ],
          "layout": "left_to_right_process" (or other),
          "input_step_ids": ["background", "methods", "results.efficacy", ...]
        }
      ]
    }
  ]
}`

// ----------------------------------------------------------------------------
// Source-span helper. Throws if quote is not a verbatim substring.
// Same primitive as the Maude fixture's findSpan().
// ----------------------------------------------------------------------------

function findSpan(source: string, quote: string): SourceSpan {
  const start = source.indexOf(quote)
  if (start === -1) {
    throw new Error(
      `Model produced a non-verbatim source_quote: "${quote.slice(0, 80)}..."`
    )
  }
  return { start, end: start + quote.length, text: quote }
}

// ----------------------------------------------------------------------------
// Slugify panel titles for stable, readable IDs.
// ----------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// ----------------------------------------------------------------------------
// Default step_connector_style based on layout type.
// ----------------------------------------------------------------------------

function defaultStepConnectorStyle(layout: GenPanel['layout']): FigureSpec['panels'][0]['step_connector_style'] {
  switch (layout) {
    case 'left_to_right_process':
    case 'top_down_pathway':
      return 'arrow'
    case 'grid':
    case 'grid_with_row_bridge':
      return 'none'
    case 'circular_loop':
    case 'central_radial':
    case 'compare_contrast_split':
      return 'connector_line'
  }
}

// ----------------------------------------------------------------------------
// Normalize: turn a compact GenFigureSpec into a full FigureSpec.
// All offsets, IDs, defaults, and structural fields filled in deterministically.
// ----------------------------------------------------------------------------

function normalize(gen: GenFigureSpec, sourceText: string): FigureSpec {
  const panels: FigureSpec['panels'] = gen.panels.map((genPanel, panelIdx) => {
    const panelId = `p${panelIdx + 1}-${slugify(genPanel.title)}`

    // Entities first — relationships reference them by name.
    const entities = genPanel.entities.map((genEntity, entityIdx) => ({
      id: `${panelId}-e${entityIdx + 1}`,
      name: genEntity.name,
      type: genEntity.type,
      source_span: findSpan(sourceText, genEntity.source_quote),
      asset_query: genEntity.name,
    }))

    // Build name -> id map for relationship resolution.
    const nameToId = new Map<string, string>()
    entities.forEach((e) => nameToId.set(e.name, e.id))

    const relationships = genPanel.relationships.map((genRel) => {
      const fromId = nameToId.get(genRel.from)
      const toId = nameToId.get(genRel.to)
      if (!fromId) {
        throw new Error(
          `Relationship references unknown entity name "${genRel.from}" in panel "${genPanel.title}"`
        )
      }
      if (!toId) {
        throw new Error(
          `Relationship references unknown entity name "${genRel.to}" in panel "${genPanel.title}"`
        )
      }
      return {
        from_entity_id: fromId,
        to_entity_id: toId,
        type: genRel.type,
        source_span: findSpan(sourceText, genRel.source_quote),
        ...(genRel.label !== undefined ? { label: genRel.label } : {}),
        connector_style: defaultConnectorStyle(genRel.type),
      }
    })

    const claims = genPanel.claims.map((genClaim) => ({
      panel_id: panelId,
      text: genClaim.text,
      source_span: findSpan(sourceText, genClaim.source_quote),
      evidence_strength: genClaim.evidence_strength,
    }))

    return {
      id: panelId,
      title: genPanel.title,
      intent: genPanel.intent,
      entities,
      relationships,
      claims,
      layout: genPanel.layout,
      biorender_queries: entities.map((e) => e.name),
      resolved_assets: [],
      input_step_ids: genPanel.input_step_ids,
      resolution_kind: 'layout_of_icons' as const,
      step_connector_style: defaultStepConnectorStyle(genPanel.layout),
    }
  })

  const allPanelIds = panels.map((p) => p.id)

  return {
    meta: {
      title: gen.title,
      audience: gen.audience,
      figure_type: 'live_generated',
      figureVersion: 1,
    },
    source: {
      raw_text: sourceText,
      extracted_at: new Date().toISOString(),
    },
    panels,
    global_style: {
      background: '#ffffff',
      label_density: gen.label_density,
      color_semantics: {},
    },
    validation: {
      missing_assets: [],
      scientific_risks: [],
      accessibility_checks: [],
    },
    export: {
      pptxTags: allPanelIds,
      panel_ids_stable_for_diff: allPanelIds,
      alt_text: gen.title,
    },
  }
}

// ----------------------------------------------------------------------------
// Strip markdown code fences if the model wrapped its JSON in them.
// Defensive: model is told not to, but graceful anyway.
// ----------------------------------------------------------------------------

function stripCodeFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

// ----------------------------------------------------------------------------
// Main adapter entry point.
// ----------------------------------------------------------------------------

const TIMEOUT_MS = Number(process.env.EXTRACT_API_TIMEOUT_MS) || 30_000
const MODEL = process.env.EXTRACT_API_MODEL || 'claude-sonnet-4-5-20250929'

export async function extractFromApi(inputText: string): Promise<GenerateFigureResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Configure it in your environment to use EXTRACT_MODE=api.'
    )
  }

  const client = new Anthropic({ apiKey })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Compile the following paper abstract into 1-3 candidate FigureSpec structures, following the rules above.\n\n---\n\n${inputText}`,
          },
        ],
      },
      { signal: controller.signal }
    )

    // Extract the JSON text from the response.
    const textBlock = response.content.find((c) => c.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Model response did not include a text block.')
    }

    const cleaned = stripCodeFences(textBlock.text)
    let rawJson: unknown
    try {
      rawJson = JSON.parse(cleaned)
    } catch (err) {
      throw new Error(
        `Model produced invalid JSON: ${err instanceof Error ? err.message : 'parse error'}.`
      )
    }

    // First Zod gate: validate against compact generation schema.
    const genResult = GenResponseSchema.safeParse(rawJson)
    if (!genResult.success) {
      throw new Error(
        `Model output failed generation-schema validation: ${genResult.error.message}`
      )
    }

    // Normalize each candidate into a full FigureSpec.
    // Errors here are typically non-verbatim quotes or unknown entity references.
    const normalizedCandidates: FigureSpec[] = genResult.data.candidates.map((gen) => {
      const fullSpec = normalize(gen, inputText)
      // Second Zod gate: validate the normalized spec against the full schema.
      const finalResult = FigureSpecSchema.safeParse(fullSpec)
      if (!finalResult.success) {
        throw new Error(
          `Normalized FigureSpec failed full-schema validation: ${finalResult.error.message}`
        )
      }
      return finalResult.data
    })

    return {
      candidates: normalizedCandidates,
      selected_index: 0,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Extraction exceeded ${TIMEOUT_MS}ms timeout.`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
