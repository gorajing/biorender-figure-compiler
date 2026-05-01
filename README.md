# biorender-figure-compiler

A typed paper-to-figure compiler in the same architectural family as **BioRender Graph** and **ChemRender**: domain-specific scientific input in, canvas-ready output out, AI-assisted, source-of-truth grounded.

**Live demo:** https://biorender-figure-compiler.vercel.app

## Where this fits in BioRender's stack

BioRender is shipping a family of typed compilers, each one taking a specific scientific input domain and producing canvas-ready output:

| Compiler | Input | Source of truth | Output |
|---|---|---|---|
| BioRender Graph (BETA) | Spreadsheet (CSV / XLSX) | User upload | Chart on canvas |
| ChemRender (BETA) | Chemical name / SMILES | PubChem | Chemical structure on canvas |
| **FigureSpec (this repo)** | **Paper text / abstract** | **Source paper + Sonnet 4.6** | **Multi-panel figure spec → canvas** |

Each is its own AI-assisted Smart Import. Each renders into BioRender's existing canvas. **FigureSpec tests whether paper-text-to-figure deserves the same treatment.** This prototype is the smallest artifact that lets that thesis be evaluated against real papers, not a claim that BioRender obviously needs it.

The wedge is concrete: BioRender's own Help Center notes that the Make-Your-Own-Icon AI tools *"are intended to be used at the ICON level, and not at the whole FIGURE level"* (April 2026). Generate Protocol / Timeline / Flowchart handle specific structured shapes. Generate Custom Figure handles arbitrary paper-to-figure but produces a flat image (editability *"coming soon"* per their docs). The whole-figure-with-typed-structure slot is empty in their current AI surface. FigureSpec lives there. Same provenance discipline as their existing `Narrate AI` (auto-titles + descriptions on community-template submission, with explicit AI-generated disclaimers); same decomposition primitive as their `Smart Search` (NL query → typed topics → icons). Different input domain.

**The asset-resolution layer is now live.** The deployed demo calls BioRender's [MCP connector](https://mcp.services.biorender.com/mcp) (shipped March 17 2026) directly. Click "Resolve via BioRender MCP" inside the figure pane — every entity in the FigureSpec gets matched to real BioRender icons via the production `search-icons` tool over OAuth 2.1. For the Maude 2018 fixture, "tisagenlecleucel" resolves to "Anti-CD19 CAR T cell recognizing cancer cell" (group asset, placeable). The full flow: paper text → live extraction (Sonnet 4.6) → typed FigureSpec → BioRender MCP search → real icon matches displayed inline. Three production endpoints chained, no mock layers.

> *I would not start by asking the LLM to draw. I would ask it to compile scientific intent into a BioRender-native figure spec, validate it, and only then hand it to the renderer/editor.*

**The wedge it explores: a trust layer for AI-generated scientific figures.** BioRender already has the canvas, icons, export and editor. What's missing for the AI-generation surface is a typed intermediate object that carries source-span provenance, evidence-strength tagging and structural validation before anything reaches the renderer. `FigureSpec` is that object. The demo does not produce a finished visual figure. It produces an editor-ready structured draft: typed entities, claims, relationships, layout primitives and verbatim source-span anchors that BioRender's editor could render as editable components.

**This prototype is a contract, not a product.** `FigureSpec` is the typed interface between AI generation and BioRender's existing editor, asset library, validation surface and export pipeline. The demo proves the contract works end-to-end against the Maude 2018 NEJM CAR-T paper, which is checked into the repo as a hand-authored fixture and is also reproducible live via the Anthropic API adapter. The same live extraction path was tested during prototype development against the Topalian 2012 NEJM anti-PD-1 abstract (no fixture in the repo; reproduce by pasting that abstract into the live demo). A production version would plug `FigureSpec` into BioRender's real APIs.

To run locally: `npm install && npm run dev`. Open the URL Next.js prints (typically `http://localhost:3000`, or 3001 if 3000 is taken), click "Load Maude 2018 CAR-T example", hover any entity chip to see the verbatim source-span highlight in the abstract pane.

---

## Repository structure

```
src/
├── core/        # production-shippable contract (would survive into BioRender)
│   ├── schema.ts      # FigureSpec types + Zod runtime validators + connector defaults
│   ├── validate.ts    # pure-function validator (verbatim source spans + structural checks)
│   └── extract.ts     # extraction-mode router (fixture | api | cli planned)
├── adapters/    # environment-specific integration points (swappable)
│   ├── extract-fixture.ts          # safe default; returns canonical Maude FigureSpec
│   ├── extract-api.ts              # Anthropic SDK adapter (compact-schema + Zod gates)
│   ├── biorender-adapter.ts        # interface for BioRender icon/template APIs
│   ├── biorender-adapter-mock.ts   # interface demo; not invoked in current runtime
│   └── cache-localstorage.ts       # browser-only response cache (read/write wired)
├── examples/    # demo fixtures
│   ├── maude-2018-cart.ts                # real reference abstract + metadata
│   └── maude-2018-cart-figurespec.ts     # hand-authored canonical FigureSpec (golden test)
└── app/         # prototype UI
    ├── components/
    │   ├── FigurePreview.tsx       # panel cards, entity chips, hover-source-span
    │   ├── SourceAbstract.tsx      # right pane with mark-highlight on hover
    │   └── ComparisonSection.tsx   # CONSORT-style original SVG + commentary
    ├── api/extract/route.ts        # POST /api/extract (10KB cap, mode-dispatched)
    ├── page.tsx
    ├── layout.tsx
    └── globals.css
```

`src/core/` is the production primitive. `src/adapters/` and `src/examples/` are demo scaffolding behind clean boundaries so they can be deleted or swapped without touching the core. The `BioRenderAdapter` interface in `src/adapters/biorender-adapter.ts` is defined and a mock implementation exists, but neither is invoked at runtime; icon resolution is mocked at the visual layer (entity names rendered as colored chips) rather than at the data layer.

---

## What works today

- **Two-button mode UX.** "Load Maude 2018 CAR-T example" loads the canonical fixture instantly. "Compile draft from pasted text" routes to the active extraction mode (fixture or api) and renders the resulting FigureSpec into the panel-card preview.
- **Live API extraction.** `src/adapters/extract-api.ts` uses the Anthropic SDK with a two-schema pattern (compact generation schema for the model, full FigureSpec schema for storage and render) plus deterministic server-side normalization for offsets and IDs. Two Zod gates run before any output reaches the UI. Default model: `claude-sonnet-4-6`. Activated via `EXTRACT_MODE=api` and `ANTHROPIC_API_KEY` environment variables. The live demo runs in this mode.
- **Fixture mode as the safe default.** With no environment variables set, `extract.ts` routes to `extract-fixture.ts`, which always returns the canonical Maude FigureSpec regardless of input. Even with no API key or network, the demo works.
- **5-panel hand-authored Maude FigureSpec.** Patient population → Intervention → Mechanism → Outcome → Safety. Every entity, claim and relationship carries a verbatim source span enforced at module load by `findSpan()`.
- **Hover-source-span interaction.** Hovering any entity chip, claim row or relationship in the figure pane highlights the corresponding verbatim text in the source abstract pane.
- **Live validator.** `src/core/validate.ts` runs on every loaded FigureSpec. Layer 1 verifies every source span is a verbatim substring of the input. Layer 2 checks structural integrity (relationship type vs. connector style, entity reference integrity, layout-specific constraints).
- **Scientific-reviewer voice in the validation drawer.** Warnings explain reasoning and suggest verification (not "this AI failed").
- **Browser-only cache.** Successful extractions cache to `localStorage` keyed by SHA-256 of input + schema version, so repeat extractions of the same abstract are instant on the second view. Server route is stateless; never persists pasted text.
- **Live BioRender MCP integration.** `src/app/api/resolve-assets/route.ts` calls BioRender's production MCP connector at `https://mcp.services.biorender.com/mcp` over OAuth 2.1 (PKCE + dynamic client registration). The "Resolve via BioRender MCP" button in the figure pane batches one request per unique entity name, displays per-chip status indicators (✓ resolved, · resolved-but-no-placeable, ! error, … loading), and surfaces top match metadata in chip tooltips. `search-icons` tool wired today; `search-templates` is a follow-up.

## What is mocked

- **BioRender asset/template library.** The `BioRenderAdapter` interface in `src/adapters/biorender-adapter.ts` defines the contract that a production version would implement. The mock implementation in `biorender-adapter-mock.ts` exists as architecture demonstration but is not invoked anywhere in the runtime. The figure preview renders entity names as colored chips, not actual BioRender icons. A real adapter would call BioRender's authenticated asset and template APIs and resolve each entity's `asset_query` to an icon ID.
- **Multi-candidate generation.** The schema supports up to 3 candidate FigureSpecs per response, and the UI renders `selected_index` from the response. The current API adapter ships 1 candidate by default for latency; raising to 3 is a one-line tunable (`EXTRACT_API_MAX_CANDIDATES`).
- **CLI extraction mode.** `EXTRACT_MODE=cli` is reserved for a future Claude Code subprocess adapter that would use a Max-plan quota instead of API tokens. Currently falls through to fixture mode with a console warning.

## What BioRender's internal APIs would unlock

See [`BIORENDER_API_CONTRACT.md`](./BIORENDER_API_CONTRACT.md) for the full proposed surface. Highlights:

- **Structured asset search** returning typed `ResolvedAsset[]` (not just titles + links)
- **Smart Template adaptation** so FigureSpec can target existing structured templates instead of composing from icons
- **Scene-graph creation API** so `FigureSpec` can compile to an editable BioRender draft document, not a flat preview
- **Renderer capability introspection** so the compiler can constrain emissions to what the canvas actually supports
- **Pre-render validation hook** so the validator catches issues before document mutation
- **Marketplace-eligible publish** so AI-generated figures can flow into the community templates surface (the "AI and community" frontier Aoki teased)

## Why this maps to BioRender's roadmap

Aoki's March 24 webinar named the architecture: *"Most figures are derivatives of a core base template, and the editing options are actually finite."* That's the Smart Templates thesis. ELISA was the inaugural Smart Template because its editing options were finite enough to encode by hand.

`FigureSpec` scales that pattern from one-domain-at-a-time (hand-design ELISA, then PCR, then Western Blot) to one-shot-from-arbitrary-input (extract finite structure from a paper abstract or grant aim). Same scene graph, same editable-by-construction property, different acquisition strategy.

Aoki also confirmed editable Custom Figure outputs are on the roadmap. The CS team confirmed AI is currently *"80-85% of the way there with the last 15% on the user."* `FigureSpec`'s structural constraints (verbatim source spans, typed relationship verbs with renderer-aware connector styles, layout primitives validated against the figure type) make that 15% inspectable, editable, and easier to validate.

---

## Production path

The prototype mocks pieces of BioRender's stack. A production implementation would replace each demo adapter with the real surface.

| Prototype today | Production inside BioRender |
|---|---|
| Maude fixture loaded by button + paste-text via live API | Real abstract / protocol / grant input pasted by user |
| `BioRenderAdapter` interface + uninvoked mock; live `/api/resolve-assets` route calling BioRender's production MCP for icon search; chips show resolution status badges | Same MCP + scene-graph write API to place resolved icons on the canvas |
| Panel-card preview rendered as HTML (text labels, no canvas geometry) | BioRender's canvas / editor renders the spec as editable scene-graph elements |
| Source-span hover in the abstract pane | Provenance inspector / comments anchored to figure elements on the canvas |
| Validation drawer with verbatim spans + structural checks | Scientific QA / review layer integrated into the editor sidebar |
| `panel.id` stable across re-compiles | Re-compile-with-diff workflow when the source paper updates |
| `EXTRACT_MODE=fixture/api` (cli planned) | Backend model service with permissions, billing, per-org quota |
| Local browser caching keyed by input + schema version | BioRender's existing draft / autosave infrastructure |
| (no export step in prototype) | BioRender's existing PowerPoint / Slides / PDF export pipeline (no parallel implementation needed) |

The shippable primitive is the typed contract:

```
AI input
  -> GenerateFigureResponse
  -> selected FigureSpec
  -> validation / provenance
  -> BioRender draft document
  -> Editor 3.0
  -> existing PowerPoint / Slides / publication workflows
```

`FigureSpec` terminates at a validated draft document. From there, BioRender's existing editor, export pipeline (PowerPoint, Google Slides, publication-ready PDF), and collaboration workflows take over. **The prototype does not duplicate the export pipeline.** That's what the existing BioRender PowerPoint Add-in and Download-to-PowerPoint flows already handle well.

The fixture, CLI, and localStorage layers are not what BioRender ships. They prove the contract works in isolation before any real-API integration.

---

## What would ship inside BioRender

A production version would not be a standalone app. It would be a feature inside the canvas-beta editor:

1. User pastes a paper abstract, grant aim or protocol into a "Compile from paper" surface (sibling to BioRender Graph and ChemRender)
2. Backend model service produces a `GenerateFigureResponse` containing 1-3 candidate `FigureSpec` variants (current prototype defaults to 1 for latency; tunable per-deployment)
3. Each candidate is validated (verbatim source spans + structural checks) before being shown
4. User reviews the spec preview, optionally tweaks panel grouping, picks a candidate; the adapter resolves icons and templates against BioRender's real library, and the spec compiles to a BioRender draft document
5. **Draft requires explicit user review before insertion into the editor.** Nothing becomes user-facing science without a human checkpoint.
6. Once accepted, the draft opens in the canvas like any other illustration. All standard editing, collaboration and export workflows apply.

> *I would not ship this as an autonomous figure generator. I would ship it as a draft compiler into BioRender's editor, with provenance and validation before anything becomes user-facing science.*

---

## A 90-day plan if I'm building this on the team

**Days 0-30: internal prototype against real BioRender stack.**
Connect FigureSpec compiler to BioRender's real asset and template search. Generate editable draft figures for one narrow domain (CAR-T mechanism, or one of the Smart Template-shaped protocols). End state: a senior scientist on the team pastes an abstract and gets an editable draft they can refine in Editor 3.0.

**Days 31-60: controlled beta with explicit review.**
Open to internal users plus 5-10 external alpha customers. Drafts require explicit user review before insertion into the editor. Track:

- Acceptance rate (drafts inserted vs. discarded)
- Edit burden (time spent refining the draft after insertion)
- Validator flags (which warnings appear, which are acted on)
- Time-to-publishable-figure (vs. baseline of starting from scratch or template)

Goal: prove the spec format reduces total figure-creation time without compromising scientific accuracy.

**Days 61-90: production wedge.**
Ship one narrow workflow as a feature: *"Generate editable graphical abstract draft from text"* OR *"Convert AI-generated figure into editable BioRender document."* Keep provenance and validation visible at every step. Decision criterion for graduating from beta: directional improvement on all four beta metrics + qualitative trust signals from KOL contributors.

---

## Stack (what's actually used)

- **Next.js 16, TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **Zod** for runtime schema validation (two gates: compact generation schema + full FigureSpec schema)
- **Anthropic SDK** (`@anthropic-ai/sdk`) used by `src/adapters/extract-api.ts`. The adapter constructs a system prompt with the schema enums inline, then validates the model's plain-JSON response against the compact Zod schema. It does NOT use the SDK's `tools` / structured-output feature; the post-hoc Zod gate plus deterministic server-side normalization is what makes the output reliable.
- **Plain HTML/CSS/SVG** for the preview. No canvas library, no Fabric.js, no rendering framework. The prototype is text-rendered on purpose. The FigureSpec is the contract; BioRender's existing canvas would do the visual rendering in production.

No tests are checked in. The `typecheck` script (`tsc --noEmit`) runs cleanly under the strict TypeScript settings above and is the closest thing to a test gate in the current prototype. Adding Vitest is on the roadmap; the schema's pure-function shape (validator, normalizer, findSpan) makes it well-suited to unit tests.

**Note on PowerPoint export:** the prototype does not implement PPTX export. BioRender already ships a Download-to-PowerPoint flow with editable text and individual vector objects, plus a PowerPoint Add-in for Quick-Edit inside PowerPoint. A production version of FigureSpec would terminate at a validated draft document and let BioRender's existing export pipeline take over. Building parallel PPTX export in the prototype would be the wrong emphasis.

---

## Run locally

```bash
npm install
npm run dev
```

This boots fixture mode by default; the demo works with no environment configuration. Open the URL Next.js prints (typically `http://localhost:3000`, or 3001 if 3000 is taken). Click **"Load Maude 2018 CAR-T example"** to see the canonical demo. Hover any element in the figure pane to see the verbatim source span highlighted in the right pane.

To enable live extraction locally, create `.env.local` in the project root with both lines:

```
EXTRACT_MODE=api
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Then restart the dev server (Next.js does not hot-reload env vars). Now "Compile draft from pasted text" routes to the live API adapter instead of fixture mode, takes 20-40 seconds and returns a real LLM-compiled FigureSpec. Cost per extraction: ~$0.03 with `claude-sonnet-4-6`.

---

## License

MIT © 2026 Jin Choi
