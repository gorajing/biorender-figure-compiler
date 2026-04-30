# BIORENDER_API_CONTRACT.md

**Status:** proposed
**Audience:** BioRender engineering / product
**Author:** Jin Choi (proposed during the Product Builder application process)

What internal APIs would BioRender need to expose for FigureSpec to become a real, marketplace-integrated component of the product?

This document is opinionated by intent. The hosted prototype mocks every endpoint named below. The mock interfaces are typed (`src/lib/biorender-mcp.ts`) and swap-in-ready: replace the mock with a real implementation, and the prototype works against your stack without further schema work.

---

## 1. Icon and template search (MCP, structured)

### Today (public-facing)

The Claude for Life Sciences MCP integration shipped Oct 23, 2025 returns icons and templates as natural-language search results. Output is presentation-shaped: titles, thumbnail URLs, links into the BioRender canvas.

### What FigureSpec needs

A structured-search endpoint that returns asset metadata, not just links. Required fields:

- `asset_id` (stable, citable)
- `asset_kind` (`icon` | `template` | `smart_template` | `chem_render` | `pdb_builder`)
- `category_path` (e.g., `Cancer / CAR-T / receptor binding`)
- `style_variants[]` — list of stylistic alternatives the user can swap to (mirrors the Replace verb)
- `editable_object_kind` — the Fabric.js scene-graph type the asset compiles to
- `attribution` — creator + acknowledgements, citation strings ready to embed
- `download_count`, `like_count`, `view_count` — for ranking and credibility surfacing

### Why structured matters

Today's MCP returns titles and links. The FigureSpec compiler needs to know that `t cell receptor` query result A is a 2D-icon vs. result B is a Smart Template (cell-to-cell interaction) vs. result C is a 3D PDB structure. Without typed kinds, the compiler can't decide whether to embed it as a single icon, adapt a template, or compose a layout-of-icons.

---

## 2. Smart Template adaptation

### Today

Smart Templates (ELISA inaugural, more rolling out) accept user input via click-to-edit on a fixed UI. The internal data model presumably has a typed schema for ELISA's finite editing options (sandwich/direct/indirect, colorimetric/chemiluminescent, etc.).

### What FigureSpec needs

A programmatic interface to:

- **Enumerate available Smart Templates** with their typed editing-option schemas
- **Adapt a Smart Template** by passing in a partial editing-option JSON (the FigureSpec compiler decides which options apply based on the input abstract)
- **Inspect the compiled scene graph** (without committing to canvas) to verify renderer output

### Use case

The CAR-T abstract gets compiled. The compiler queries: is there a "CAR-T mechanism" Smart Template? If yes, adapt with `{conditioning_chemo: "lymphodepleting", t_cell_source: "autologous", car_target: "CD19"}`. If no, fall back to compose-from-icons.

This is the path that turns FigureSpec into a Smart Template factory — every successful FigureSpec compilation that gets community-published becomes the seed for a new Smart Template domain.

---

## 3. Scene graph creation (write API)

### Today

Generate Custom Figure outputs flat images. First Draft Builder, Smart Templates, and Make Your Own Icon output editable scene graphs. The write path from "AI extracted structured intent" to "editable BioRender document" exists internally but isn't exposed externally.

### What FigureSpec needs

A `create_draft_figure` endpoint that accepts:

```ts
{
  scene_graph: SceneGraphSpec,    // Fabric.js-compatible objects, groups, transforms
  text_blocks: TextBlock[],
  panel_ids: string[],            // stable across regenerations, used as PPTX export tags
  source_provenance: SourceSpan[],// embed in figure metadata for verifiable lineage
  template_lineage: {
    derived_from_template_ids?: string[],
    acknowledgements?: Acknowledgement[]
  },
  validation_state: {
    scientific_risks?: ScientificRisk[],
    accessibility_status?: AccessibilityStatus
  }
}
```

Returns: a draft figure URL the user can open and edit.

### Why this matters

Without a write API, every FigureSpec compilation has to terminate at "here's a JSON, the user pastes it somewhere." With a write API, FigureSpec output IS a BioRender draft, citation-ready, marketplace-eligible.

---

## 4. Renderer capability introspection

### Today

The Skia / CanvasKit / Fabric stack supports specific text features (baseline shifts, blur primitives, mask compositing, SVGDOM transforms, WebGPU-experimental). Internal commits suggest these capabilities are evolving (`baselineShift`, `MakeBlur`, `br-m145-svgdom` branch).

### What FigureSpec needs

A capability-query endpoint:

```ts
GET /renderer/capabilities
→ {
  text_features: ['baseline_shift', 'subscript', 'superscript', 'kerning'],
  filter_primitives: ['gaussian_blur', 'drop_shadow', 'glow'],
  mask_modes: ['alpha', 'luminance'],
  svg_compatibility: { import: true, export: true, lossless: true },
  pptx_compatibility: { editable_text: true, vector_objects: true, semantic_tags: true },
  gpu_backend: 'webgpu' | 'webgl' | 'skia_software'
}
```

The compiler uses this to constrain emissions. A FigureSpec that requests `gaussian_blur` on an entity, when the renderer is running in `skia_software` mode without filter support, gets a downgrade hint at compile time, not a render-time surprise.

---

## 5. Validation before document mutation

### Today

The "Always verify the accuracy of AI-generated content" disclaimer puts the burden on the user. There's no pre-render validation pass.

### What FigureSpec needs

A `validate_figure_spec` endpoint that runs the same checks the prototype runs locally, but with access to:

- BioRender's icon ontology (so `T cell` is recognized as a `cell` entity, not a generic blob)
- BioRender's pathway database (so an `inhibits` relationship between `IL-6` and `JAK1` can be flagged as biologically suspect if not present in pathway databases)
- BioRender's accessibility tooling

Returns: a validation report with the same structure as `FigureSpec.validation` (scientific_risks, missing_assets, accessibility_checks).

The user sees the validation report BEFORE clicking "Add to canvas." Aoki's disclaimer becomes a structural pre-flight check.

---

## 6. Marketplace publish (community-draft submission)

### Today

`Submit a template` exists in the UI. Templates flow through the 7-stage internal production pipeline (per Jerry Gu's "Anatomy of a Figure" webinar): rigorous content research, rough sketches, illustrated first draft, internal review, usability refinement, publishing, ongoing maintenance.

### What FigureSpec needs

A `propose_community_template` endpoint that accepts:

```ts
{
  figure_spec: FigureSpec,            // the validated, source-grounded spec
  proposed_metadata: TemplateMetadata,
  citation_info: CitationInfo,
  suggested_category_path: string,
  acknowledgements: Acknowledgement[]
}
```

Returns: a community-draft URL pending BioRender's internal review (mirrors the existing community-template submission flow, but with structured input that bypasses stages 1-3 of the production pipeline because the AI compiler did the structural work).

### Why this matters

This is what closes the "AI and community" loop Aoki teased. Every successful FigureSpec compilation can become a community template seed. The marketplace flywheel currently runs on hand-built community templates (see Akiko Iwasaki's 166-template profile). FigureSpec adds a programmatic seed path.

---

## 7. Annotations: read-only vs. write boundaries

Per BioRender's `mcp-trino` fork, the read-only-by-default + explicit-write annotations pattern is already in the engineering orbit. Apply the same discipline here:

| Endpoint | Read or Write | MCP annotation |
|---|---|---|
| Icon/template search | read | `read_only_hint: true` |
| Smart Template enumerate | read | `read_only_hint: true` |
| Smart Template adapt (preview) | read | `read_only_hint: true` |
| Renderer capabilities | read | `read_only_hint: true` |
| Validate FigureSpec | read | `read_only_hint: true` |
| Create draft figure | write | `destructive_hint: true` (creates a user-visible draft) |
| Propose community template | write | `destructive_hint: true`, `requires_review: true` |

This boundary protects against AI agents accidentally polluting the marketplace with unreviewed drafts.

---

## 8. Authentication and identity

OAuth + enterprise identity (per `mcp-trino` architecture notes). FigureSpec compiler running on behalf of a logged-in BioRender user inherits that user's permissions: their license tier (free / academic / industry / enterprise), their template-publishing rights, their organization's data-residency requirements.

For multi-user organizations, every compiled FigureSpec carries the compiling user's identity in `template_metadata.creator`. Acknowledgements chains include the original AI input source (paper DOI), template lineage (if adapted from existing community templates), and any human contributors.

---

## What's intentionally NOT in this contract

- **Real-time multi-user FigureSpec editing** — out of scope. Once the spec is in the canvas, BioRender's existing collaboration handles it.
- **Direct LLM model access** — FigureSpec is model-agnostic. The compiler runs Claude in this prototype, but a future BioRender-internal version could run any structured-output LLM.
- **Animation primitives** — FigureSpec is static-figure-oriented. Animation lives in PowerPoint export today.
- **Localization (non-English labels)** — out of scope for v1.
- **Posters and Graphs surface integration** — separate contracts. FigureSpec v1 targets the Illustrations surface only.

---

## Implementation sequencing (suggested for BioRender)

1. **Wave 1 (1-2 sprints):** Structured icon/template search (#1) + renderer capability introspection (#4). Enables external tools to make smart asset choices and respect renderer constraints.
2. **Wave 2 (2-3 sprints):** Validation endpoint (#5) + Smart Template enumerate/adapt (#2). Enables pre-render type-checking and Smart Template factory composition.
3. **Wave 3 (3-4 sprints):** Scene graph write API (#3) + marketplace publish (#6). Closes the AI-and-community loop end-to-end.

---

## Open questions for BioRender

1. Are the Smart Template editing-option schemas already typed internally? (The ELISA Smart Template demo strongly suggests yes — the click-to-edit options are clearly enumerated. Just exposing the existing schema may suffice.)
2. Does the canvas object model preserve provenance fields (where each entity came from in the source text)? If yes, FigureSpec's `source_span` propagation maps directly. If no, this is a small but important data model addition.
3. Is the renderer capability query accessible per-user-tier, or global? Free tier users may not have access to WebGPU rendering; the compiler should know.

---

## Cross-references

- Prototype mock: `src/lib/biorender-mcp.ts`
- FigureSpec schema: `src/lib/schema.ts`
- Design rationale: [../FigureSpec Schema Design Notes](../FigureSpec%20Schema%20Design%20Notes.md)
- Product surface context: [../Product Surface Map](../Product%20Surface%20Map.md)
- BioRender's public engineering: [github.com/BioRender-Team](https://github.com/BioRender-Team)
- BioRender + Anthropic Claude for Life Sciences: [BusinessWire announcement](https://www.businesswire.com/news/home/20251023858531/en/BioRender-and-Anthropic-Partner-To-Bring-Scientific-Illustrations-to-Claude-For-Life-Sciences)
