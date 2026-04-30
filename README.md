# biorender-figure-compiler

A renderer-aware Figure Intent Layer that compiles scientific abstracts into editable, validated `FigureSpec` JSON.

**Live demo:** https://biorender-figure-compiler.vercel.app

> *I would not start by asking the LLM to draw. I would ask it to compile scientific intent into a BioRender-native figure spec, validate it, and only then hand it to the renderer/editor.*

**This prototype is a contract, not a product.** `FigureSpec` is the typed interface between AI generation and BioRender's existing editor, asset library, validation surface, and export pipeline. The demo proves the contract works end-to-end against the Maude et al. 2018 NEJM CAR-T paper. A production version would plug `FigureSpec` into BioRender's real APIs.

To run locally: `npm install && npm run dev`. Open http://localhost:3000, click "Load Maude 2018 CAR-T example", hover any entity chip to see the verbatim source-span highlight in the abstract pane.

---

## Repository structure

```
src/
├── core/        # production-shippable contract (would survive into BioRender)
│   ├── schema.ts      # FigureSpec types + Zod runtime validators + connector defaults
│   └── validate.ts    # pure-function validator (verbatim source spans + structural checks)
├── adapters/    # environment-specific integration points (swappable)
│   ├── biorender-adapter.ts        # interface
│   └── biorender-adapter-mock.ts   # demo-only mock implementation
├── examples/    # demo fixtures
│   ├── maude-2018-cart.ts                # real reference abstract + metadata
│   └── maude-2018-cart-figurespec.ts     # hand-authored canonical FigureSpec (golden test)
└── app/         # prototype UI
    ├── components/
    │   ├── FigurePreview.tsx
    │   └── SourceAbstract.tsx
    ├── page.tsx
    ├── layout.tsx
    └── globals.css
```

`src/core/` is the production primitive. `src/adapters/` and `src/examples/` are demo scaffolding behind clean boundaries so they can be deleted or swapped without touching the core.

---

## What works today

- **Two-button mode UX.** "Load Maude 2018 CAR-T example" loads the canonical fixture. "Generate from pasted abstract" is wired but live extraction comes online in a later iteration.
- **5-panel hand-authored Maude FigureSpec.** Patient population → Intervention → Mechanism → Outcome → Safety. Every entity, claim, and relationship carries a verbatim source span enforced at module load.
- **Hover-source-span interaction.** Hovering any entity chip, claim row, or relationship in the figure pane highlights the corresponding verbatim text in the source abstract pane.
- **Live validator.** `src/core/validate.ts` runs on every loaded FigureSpec. Layer 1 verifies every source span is a verbatim substring of the input. Layer 2 checks structural integrity (relationship type vs. connector style, entity reference integrity, layout-specific constraints).
- **Scientific-reviewer voice in the validation drawer.** Warnings explain reasoning and suggest verification (not "this AI failed").

## What is mocked

- **BioRender asset/template library.** The `BioRenderAdapter` interface in `src/adapters/biorender-adapter.ts` defines the contract. The mock implementation in `biorender-adapter-mock.ts` returns hand-curated assets for the Maude reference example. A real adapter would call BioRender's authenticated asset and template APIs.
- **Live extraction.** The fixture path is the demo's golden path. The `EXTRACT_MODE=cli` (Claude Code subprocess) and `EXTRACT_MODE=api` (Anthropic SDK) adapters are planned for later iterations.

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
| Maude fixture loaded by button | Real abstract / protocol / grant input pasted by user |
| Mock `BioRenderAdapter` returning hand-curated assets | Real `BioRenderAdapter` calling BioRender's icon and template library |
| Plain HTML preview (Day 1) → Fabric.js canvas (later) | Editor 3.0 canvas |
| Source-span hover in the abstract pane | Provenance inspector / comments anchored to figure elements |
| Validation drawer with verbatim spans + structural checks | Scientific QA / review layer integrated into the editor sidebar |
| `panel.id` semantic tags carried through validation | BioRender's existing PowerPoint / Slides export pipeline (no parallel implementation needed) |
| `EXTRACT_MODE=fixture/cli/api` adapters | Backend model service with permissions, billing, per-org quota |
| Local browser caching | BioRender's existing draft / autosave infrastructure |

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

A production version would not be a standalone app. It would be a feature inside Editor 3.0:

1. User pastes a paper abstract, grant aim, or protocol into a "Generate from text" surface
2. Backend model service produces a `GenerateFigureResponse` containing 3 candidate `FigureSpec` variants
3. Each candidate is validated (verbatim source spans + structural checks) before being shown
4. User picks a candidate, the adapter resolves icons and templates against BioRender's real library, and the spec compiles to a BioRender draft document
5. **Draft requires explicit user review before insertion into the editor.** Nothing becomes user-facing science without a human checkpoint.
6. Once accepted, the draft opens in Editor 3.0 like any other illustration. All standard editing, collaboration, and export workflows apply.

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

## Stack

- **Next.js 16, TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **Zod** for runtime schema validation
- **Anthropic SDK** with tool-call structured output (used by future `extract-api.ts` adapter)
- **Fabric.js** for editable canvas (planned, suggested by BioRender's public Fabric.js fork)
- **Vitest** for tests

Integration targets are framed as "suggested by public technical signals" because BioRender's public GitHub org reveals which open-source libraries they fork and extend. The internal architecture is presumably more elaborate than what's publicly visible.

**Note on PowerPoint export:** the prototype does not implement PPTX export. BioRender already ships a Download-to-PowerPoint flow with editable text and individual vector objects, plus a PowerPoint Add-in for Quick-Edit inside PowerPoint. A production version of FigureSpec would terminate at a validated draft document and let BioRender's existing export pipeline take over. Building parallel PPTX export in the prototype would be the wrong emphasis.

---

## Run locally

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY (only needed for live extraction)
npm run dev
```

Open `http://localhost:3000` (or whatever port Next picks if 3000 is taken). Click **"Load Maude 2018 CAR-T example"** to see the canonical demo. Hover any element in the figure pane to see the verbatim source span highlighted.

---

## License

MIT © 2026 Jin Choi
