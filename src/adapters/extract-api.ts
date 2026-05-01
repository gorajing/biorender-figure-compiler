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

const SYSTEM_PROMPT = `You are a scientific figure compiler. Given a paper abstract, produce 1 high-quality candidate FigureSpec structure that would render as a graphical abstract.

CRITICAL RULES:
1. Every entity name MUST appear as a verbatim phrase in the input abstract.
2. Every source_quote MUST be a verbatim substring of the input abstract (case-sensitive).
3. Do NOT invent claims, entities, or relationships not supported by the abstract.
4. Aim for 3-6 panels covering the natural structure of the paper (e.g. patient population, intervention, mechanism, outcome, safety).
5. Keep entities to the most informative 2-4 per panel. Do not list every term.

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
// Source-span helpers.
//
// The model is instructed to produce verbatim quotes, but real LLM output
// occasionally paraphrases or concatenates phrases from different sentences.
// safeFindSpan returns null instead of throwing so the normalizer can drop
// unresolvable items without failing the whole extraction. The hand-authored
// Maude fixture in src/examples/ uses its own throwing findSpan because that
// content is deterministic and any drift indicates a real bug.
// ----------------------------------------------------------------------------

function safeFindSpan(source: string, quote: string): SourceSpan | null {
  const start = source.indexOf(quote)
  if (start === -1) return null
  return { start, end: start + quote.length, text: quote }
}

// Two-stage entity-span resolution: find the broader source_quote region,
// then narrow the highlighted span to the entity name within that region.
// This makes the hover affordance read as "chip name == highlighted text"
// instead of "chip name appears somewhere inside a longer highlighted passage."
//
// Resolution order (per option B in the design discussion):
//   1. Locate the source_quote to establish the right region (handles cases
//      where the entity name appears multiple times in the source).
//   2. Within that region, narrow to the entity name. Use those tighter offsets.
//   3. If the entity name isn't inside the region, fall back to highlighting
//      the whole source_quote (still useful, just wider).
//   4. If the source_quote isn't verbatim at all, fall back to a global search
//      for the entity name (which the prompt requires to be verbatim).
//   5. If neither resolves, return null and let the normalizer drop the entity.
function resolveEntitySpan(
  source: string,
  entityName: string,
  sourceQuote: string
): SourceSpan | null {
  const regionStart = source.indexOf(sourceQuote)
  if (regionStart >= 0) {
    const region = source.slice(regionStart, regionStart + sourceQuote.length)
    const nameInRegion = region.indexOf(entityName)
    if (nameInRegion >= 0) {
      const start = regionStart + nameInRegion
      return { start, end: start + entityName.length, text: entityName }
    }
    return {
      start: regionStart,
      end: regionStart + sourceQuote.length,
      text: sourceQuote,
    }
  }
  const nameStart = source.indexOf(entityName)
  if (nameStart >= 0) {
    return { start: nameStart, end: nameStart + entityName.length, text: entityName }
  }
  return null
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
  // Pre-pass: build a global name -> entity-info map across all panels.
  // Lets us resolve cross-panel relationship references by auto-cloning the
  // entity into the referencing panel.
  const globalEntityInfo = new Map<
    string,
    { type: GenPanel['entities'][0]['type']; name: string; source_quote: string }
  >()
  for (const genPanel of gen.panels) {
    for (const genEntity of genPanel.entities) {
      if (!globalEntityInfo.has(genEntity.name)) {
        globalEntityInfo.set(genEntity.name, {
          type: genEntity.type,
          name: genEntity.name,
          source_quote: genEntity.source_quote,
        })
      }
    }
  }

  // Track every dropped item so we can log it. Production would surface these
  // as warnings in the validation drawer.
  const dropLog: string[] = []

  const panels: FigureSpec['panels'] = gen.panels.map((genPanel, panelIdx) => {
    const panelId = `p${panelIdx + 1}-${slugify(genPanel.title)}`

    // Resolve each entity. Try source_quote first (verbatim substring of the
    // input). Fall back to the entity name itself, which the prompt requires
    // to be verbatim. Drop with a warning if neither resolves.
    type ResolvedEntity = {
      id: string
      name: string
      type: GenPanel['entities'][0]['type']
      source_span: SourceSpan
      asset_query: string
    }
    const entitiesWithSpans: ResolvedEntity[] = []
    genPanel.entities.forEach((genEntity, entityIdx) => {
      const span = resolveEntitySpan(
        sourceText,
        genEntity.name,
        genEntity.source_quote
      )
      if (!span) {
        dropLog.push(
          `Dropped entity "${genEntity.name}" in panel "${genPanel.title}": ` +
            `neither source_quote nor name found verbatim in input.`
        )
        return
      }
      entitiesWithSpans.push({
        id: `${panelId}-e${entityIdx + 1}`,
        name: genEntity.name,
        type: genEntity.type,
        source_span: span,
        asset_query: genEntity.name,
      })
    })

    // Local name -> id lookup for relationship resolution within this panel.
    const localNameToId = new Map<string, string>()
    entitiesWithSpans.forEach((e) => localNameToId.set(e.name, e.id))

    // Cloned entities: when a relationship references a name not local to this
    // panel but defined elsewhere, auto-clone the entity into this panel so
    // the relationship can render with the proper name in the FigurePreview.
    const clonedEntities: ResolvedEntity[] = []
    let cloneCounter = entitiesWithSpans.length

    function resolveOrClone(name: string): string | null {
      const localId = localNameToId.get(name)
      if (localId) return localId

      const globalEntity = globalEntityInfo.get(name)
      if (!globalEntity) return null

      const span = resolveEntitySpan(
        sourceText,
        globalEntity.name,
        globalEntity.source_quote
      )
      if (!span) return null

      cloneCounter += 1
      const newId = `${panelId}-e${cloneCounter}`
      clonedEntities.push({
        id: newId,
        name: globalEntity.name,
        type: globalEntity.type,
        source_span: span,
        asset_query: globalEntity.name,
      })
      localNameToId.set(name, newId)
      return newId
    }

    const relationships: FigureSpec['panels'][0]['relationships'] = []
    genPanel.relationships.forEach((genRel) => {
      const fromId = resolveOrClone(genRel.from)
      const toId = resolveOrClone(genRel.to)
      if (!fromId || !toId) {
        dropLog.push(
          `Dropped relationship "${genRel.from} ${genRel.type} ${genRel.to}" ` +
            `in panel "${genPanel.title}": entity name not found in any panel.`
        )
        return
      }
      const span = safeFindSpan(sourceText, genRel.source_quote)
      if (!span) {
        dropLog.push(
          `Dropped relationship "${genRel.from} ${genRel.type} ${genRel.to}" ` +
            `in panel "${genPanel.title}": source_quote not verbatim.`
        )
        return
      }
      relationships.push({
        from_entity_id: fromId,
        to_entity_id: toId,
        type: genRel.type,
        source_span: span,
        ...(genRel.label !== undefined ? { label: genRel.label } : {}),
        connector_style: defaultConnectorStyle(genRel.type),
      })
    })

    const claims: FigureSpec['panels'][0]['claims'] = []
    genPanel.claims.forEach((genClaim) => {
      // Prefer the claim's own text when it appears verbatim in the source.
      // This keeps "hover claim row -> highlight matches the claim text"
      // even when the model produced a wider source_quote for context.
      // Fall back to the source_quote when the claim text was paraphrased.
      const span =
        safeFindSpan(sourceText, genClaim.text) ??
        safeFindSpan(sourceText, genClaim.source_quote)
      if (!span) {
        dropLog.push(
          `Dropped claim "${genClaim.text.slice(0, 60)}" in panel ` +
            `"${genPanel.title}": neither claim text nor source_quote verbatim.`
        )
        return
      }
      claims.push({
        panel_id: panelId,
        text: genClaim.text,
        source_span: span,
        evidence_strength: genClaim.evidence_strength,
      })
    })

    const allEntities = [...entitiesWithSpans, ...clonedEntities]

    return {
      id: panelId,
      title: genPanel.title,
      intent: genPanel.intent,
      entities: allEntities,
      relationships,
      claims,
      layout: genPanel.layout,
      biorender_queries: allEntities.map((e) => e.name),
      resolved_assets: [],
      input_step_ids: genPanel.input_step_ids,
      resolution_kind: 'layout_of_icons' as const,
      step_connector_style: defaultStepConnectorStyle(genPanel.layout),
    }
  })

  if (dropLog.length > 0) {
    console.warn(
      `extract-api: lenient resolution dropped ${dropLog.length} item(s):`
    )
    dropLog.forEach((msg) => console.warn(`  - ${msg}`))
  }

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

// 90 seconds covers Sonnet 4.6 with full FigureSpec output (5-6 panels with
// 15-20 entities, ~2000 output tokens at ~50-100 tok/sec). Tunable via env
// if a different model or smaller candidate count is used.
const TIMEOUT_MS = Number(process.env.EXTRACT_API_TIMEOUT_MS) || 90_000
// Default to current Sonnet (4.6 as of Apr 2026). 1M context window + adaptive
// thinking + Jan 2026 training cutoff. Tunable via env for haiku/opus swaps.
const MODEL = process.env.EXTRACT_API_MODEL || 'claude-sonnet-4-6'
const MAX_CANDIDATES = Number(process.env.EXTRACT_API_MAX_CANDIDATES) || 1

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
            content: `Compile the following paper abstract into 1 high-quality FigureSpec candidate, following the rules above.\n\n---\n\n${inputText}`,
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
