/**
 * Hand-authored canonical Maude 2018 CAR-T FigureSpec.
 *
 * This is the FIXTURE-mode output for `EXTRACT_MODE=fixture`. The entire
 * downstream pipeline (validate → render → hover-source-spans → export)
 * is built against this file. Day 1 demo works against this regardless of
 * whether live extraction (CLI or API) is available.
 *
 * Demo discipline: this fixture is loaded explicitly via the
 * "Load Maude 2018 CAR-T example" button. It is NOT silently substituted
 * when a user pastes their own abstract. Live mode is its own button with
 * its own status banner. See README.md for the two-button UX rationale.
 *
 * Self-validating: every source_span uses the `findSpan()` helper which
 * throws at module load if the verbatim text isn't found in the source.
 * This guarantees the fixture cannot drift away from schema correctness.
 */

import {
  type FigureSpec,
  FigureSpecSchema,
  type SourceSpan,
  defaultConnectorStyle,
} from '../core/schema'
import { MAUDE_2018_CART } from './maude-2018-cart'

// ---------------------------------------------------------------------------
// Helper: find verbatim substring and compute source span.
// Throws at module load if text isn't found. Fail-fast prevents drift.
// ---------------------------------------------------------------------------

function findSpan(source: string, text: string): SourceSpan {
  const start = source.indexOf(text)
  if (start === -1) {
    throw new Error(
      `findSpan: text "${text.slice(0, 60)}..." not found in source. ` +
      `Fixture is out of sync with MAUDE_2018_CART.extended_input.`
    )
  }
  return { start, end: start + text.length, text }
}

const SRC = MAUDE_2018_CART.extended_input

// ---------------------------------------------------------------------------
// Panel 1: Patient population
// ---------------------------------------------------------------------------

const panel1_patientPopulation = {
  id: 'p1-patient-population',
  title: 'Patient population',
  intent: 'Pediatric and young adult patients with relapsed or refractory CD19+ B-cell ALL.',
  entities: [
    {
      id: 'e1-patients',
      name: 'pediatric and young adult patients',
      type: 'organism' as const,
      source_span: findSpan(SRC, 'pediatric and young adult patients'),
      asset_query: 'pediatric patient',
    },
    {
      id: 'e1-disease',
      name: 'CD19+ relapsed or refractory B-cell ALL',
      type: 'tissue' as const,
      source_span: findSpan(SRC, 'CD19+ relapsed or refractory B-cell ALL'),
      asset_query: 'B-cell acute lymphoblastic leukemia',
    },
  ],
  relationships: [],
  layout: 'left_to_right_process' as const,
  claims: [
    {
      panel_id: 'p1-patient-population',
      text: 'pediatric and young adult patients with CD19+ relapsed or refractory B-cell ALL',
      source_span: findSpan(SRC, 'pediatric and young adult patients with CD19+ relapsed or refractory B-cell ALL'),
      evidence_strength: 'direct' as const,
    },
  ],
  biorender_queries: ['pediatric patient', 'B-cell acute lymphoblastic leukemia', 'bone marrow blasts'],
  resolved_assets: [],
  input_step_ids: ['background', 'methods.eligibility'],
  resolution_kind: 'layout_of_icons' as const,
  step_connector_style: 'arrow' as const,
}

// ---------------------------------------------------------------------------
// Panel 2: Intervention
// ---------------------------------------------------------------------------

const panel2_intervention = {
  id: 'p2-intervention',
  title: 'Intervention',
  intent: 'Anti-CD19 CAR-T cell therapy tisagenlecleucel, delivered as a single infusion.',
  entities: [
    {
      id: 'e2-tisagenlecleucel',
      name: 'tisagenlecleucel',
      type: 'molecule' as const,
      source_span: findSpan(SRC, 'tisagenlecleucel'),
      asset_query: 'CAR-T cell therapy infusion',
    },
    {
      id: 'e2-car-tcell',
      name: 'anti-CD19 chimeric antigen receptor (CAR) T-cell therapy',
      type: 'protein' as const,
      source_span: findSpan(SRC, 'anti-CD19 chimeric antigen receptor (CAR) T-cell therapy'),
      asset_query: 'CAR-T cell',
    },
  ],
  relationships: [],
  layout: 'left_to_right_process' as const,
  claims: [
    {
      panel_id: 'p2-intervention',
      text: '75 patients received an infusion of tisagenlecleucel',
      source_span: findSpan(SRC, '75 patients received an infusion of tisagenlecleucel'),
      evidence_strength: 'direct' as const,
    },
    {
      panel_id: 'p2-intervention',
      text: 'autologous T cells transduced with a lentiviral vector',
      source_span: findSpan(SRC, 'autologous T cells transduced with a lentiviral vector'),
      evidence_strength: 'direct' as const,
    },
  ],
  biorender_queries: ['CAR-T cell', 'IV bag', 'lentiviral vector', 'CD3-zeta domain'],
  resolved_assets: [],
  input_step_ids: ['background', 'methods.car_construction'],
  resolution_kind: 'layout_of_icons' as const,
  step_connector_style: 'arrow' as const,
}

// ---------------------------------------------------------------------------
// Panel 3: Mechanism
// CAR-T cells recognize CD19+ tumor cells. Validator surfaces an
// inferred-from-context warning because the abstract describes the therapy
// but doesn't spell out the mechanism step-by-step.
// ---------------------------------------------------------------------------

const panel3_mechanism = {
  id: 'p3-mechanism',
  title: 'Mechanism',
  intent: 'Engineered CAR-T cells recognize and bind the CD19 antigen on tumor cells.',
  entities: [
    {
      id: 'e3-cart-cell',
      name: 'tisagenlecleucel',
      type: 'cell' as const,
      source_span: findSpan(SRC, 'tisagenlecleucel'),
      asset_query: 'CAR-T cell with receptor',
    },
    {
      id: 'e3-cd19',
      name: 'CD19',
      type: 'protein' as const,
      source_span: findSpan(SRC, 'CD19'),
      asset_query: 'CD19 surface protein on B-cell',
    },
    {
      id: 'e3-tumor',
      name: 'B-cell ALL',
      type: 'cell' as const,
      source_span: findSpan(SRC, 'B-cell ALL'),
      asset_query: 'CD19+ B-cell leukemia cell',
    },
  ],
  relationships: [
    {
      from_entity_id: 'e3-cart-cell',
      to_entity_id: 'e3-cd19',
      type: 'recognizes' as const,
      source_span: findSpan(SRC, 'anti-CD19 chimeric antigen receptor (CAR) T-cell therapy'),
      label: 'recognizes',
      connector_style: defaultConnectorStyle('recognizes'),
    },
  ],
  layout: 'left_to_right_process' as const,
  claims: [
    {
      panel_id: 'p3-mechanism',
      text: 'anti-CD19 chimeric antigen receptor (CAR) T-cell therapy',
      source_span: findSpan(SRC, 'anti-CD19 chimeric antigen receptor (CAR) T-cell therapy'),
      evidence_strength: 'direct' as const,
    },
  ],
  biorender_queries: ['CAR-T cell', 'CD19 receptor', 'tumor cell binding'],
  resolved_assets: [],
  input_step_ids: ['background', 'methods.car_construction'],
  resolution_kind: 'layout_of_icons' as const,
  step_connector_style: 'arrow' as const,
}

// ---------------------------------------------------------------------------
// Panel 4: Outcome
// ---------------------------------------------------------------------------

const panel4_outcome = {
  id: 'p4-outcome',
  title: 'Outcome',
  intent: 'High remission rates and durable event-free / overall survival.',
  entities: [
    {
      id: 'e4-remission',
      name: 'overall remission rate',
      type: 'concept' as const,
      source_span: findSpan(SRC, 'overall remission rate'),
      asset_query: 'remission outcome',
    },
    {
      id: 'e4-mrd',
      name: 'minimal residual disease',
      type: 'concept' as const,
      source_span: findSpan(SRC, 'minimal residual disease'),
      asset_query: 'flow cytometry',
    },
  ],
  relationships: [],
  layout: 'left_to_right_process' as const,
  claims: [
    {
      panel_id: 'p4-outcome',
      text: 'overall remission rate within 3 months was 81%',
      source_span: findSpan(SRC, 'overall remission rate within 3 months was 81%'),
      evidence_strength: 'direct' as const,
    },
    {
      panel_id: 'p4-outcome',
      text: 'event-free survival and overall survival were 73%',
      source_span: findSpan(SRC, 'event-free survival and overall survival were 73%'),
      evidence_strength: 'direct' as const,
    },
    {
      panel_id: 'p4-outcome',
      text: 'all patients who had a response to treatment found to be negative for minimal residual disease',
      source_span: findSpan(SRC, 'all patients who had a response to treatment found to be negative for minimal residual disease'),
      evidence_strength: 'direct' as const,
    },
  ],
  biorender_queries: ['remission curve', 'survival curve', 'flow cytometry'],
  resolved_assets: [],
  input_step_ids: ['results.efficacy'],
  resolution_kind: 'layout_of_icons' as const,
  step_connector_style: 'arrow' as const,
}

// ---------------------------------------------------------------------------
// Panel 5: Safety / monitoring
// Validator surfaces a single-arm-trial context warning (no comparator).
// ---------------------------------------------------------------------------

const panel5_safety = {
  id: 'p5-safety',
  title: 'Safety and monitoring',
  intent: 'Cytokine release syndrome was the most common serious adverse event, managed with tocilizumab.',
  entities: [
    {
      id: 'e5-crs',
      name: 'cytokine release syndrome',
      type: 'process' as const,
      source_span: findSpan(SRC, 'cytokine release syndrome'),
      asset_query: 'cytokine release cluster',
    },
    {
      id: 'e5-tocilizumab',
      name: 'tocilizumab',
      type: 'molecule' as const,
      source_span: findSpan(SRC, 'tocilizumab'),
      asset_query: 'IL-6 receptor antagonist antibody',
    },
  ],
  relationships: [],
  layout: 'left_to_right_process' as const,
  claims: [
    {
      panel_id: 'p5-safety',
      text: 'cytokine release syndrome occurred in 77% of patients',
      source_span: findSpan(SRC, 'cytokine release syndrome occurred in 77% of patients'),
      evidence_strength: 'direct' as const,
    },
    {
      panel_id: 'p5-safety',
      text: '48% of whom received tocilizumab',
      source_span: findSpan(SRC, '48% of whom received tocilizumab'),
      evidence_strength: 'direct' as const,
    },
  ],
  biorender_queries: ['cytokine cluster', 'IV bag tocilizumab', 'monitoring'],
  resolved_assets: [],
  input_step_ids: ['results.safety'],
  resolution_kind: 'layout_of_icons' as const,
  step_connector_style: 'arrow' as const,
}

// ---------------------------------------------------------------------------
// The canonical FigureSpec.
// Validates against FigureSpecSchema at module load (see assertion at bottom).
// ---------------------------------------------------------------------------

export const MAUDE_2018_FIGURESPEC: FigureSpec = {
  meta: {
    title: 'Tisagenlecleucel in Children and Young Adults with B-Cell Lymphoblastic Leukemia',
    audience: 'graphical_abstract',
    figure_type: 'mechanism_and_trial',
    figureVersion: 1,
  },
  source: {
    raw_text: SRC,
    extracted_at: '2026-04-30T00:00:00Z',
  },
  panels: [
    panel1_patientPopulation,
    panel2_intervention,
    panel3_mechanism,
    panel4_outcome,
    panel5_safety,
  ],
  global_style: {
    background: '#ffffff',
    label_density: 'medium',
    color_semantics: {
      therapeutic: '#3b82f6',         // blue for tisagenlecleucel / CAR-T
      tumor: '#ef4444',               // red for B-cell ALL / CD19+ tumor
      response: '#22c55e',            // green for remission / response
      adverse: '#f59e0b',             // amber for cytokine release syndrome / AEs
    },
  },
  validation: {
    missing_assets: [],
    scientific_risks: [
      {
        panel_id: 'p3-mechanism',
        type: 'unsupported_claim',
        description:
          'Mechanism (CAR-T recognizes CD19+ tumor cells) is inferred from the therapy ' +
          'description and standard CAR-T biology, not directly stated in the input abstract. ' +
          'Verify against the full paper or cite Maude SL et al. 2018 NEJM for mechanism context.',
        source_span: findSpan(SRC, 'anti-CD19 chimeric antigen receptor (CAR) T-cell therapy'),
      },
      {
        panel_id: 'p5-safety',
        type: 'missing_control',
        description:
          'Single-arm trial context; no comparator arm described in the abstract. ' +
          'Adverse event rates should be interpreted in this context.',
      },
    ],
    accessibility_checks: [
      {
        type: 'contrast',
        status: 'pass',
        detail: 'Panel background and label colors meet WCAG AA contrast ratio (4.5:1).',
      },
      {
        type: 'colorblind_safe',
        status: 'pass',
        detail: 'Color palette distinguishable in deuteranopia and protanopia simulations.',
      },
      {
        type: 'label_density',
        status: 'warning',
        detail:
          'Panel 4 (Outcome) carries 3 numerical claims. Consider splitting into two ' +
          'sub-panels (Response and Survival) if the figure becomes crowded at print size.',
      },
    ],
  },
  export: {
    pptxTags: [
      'p1-patient-population',
      'p2-intervention',
      'p3-mechanism',
      'p4-outcome',
      'p5-safety',
    ],
    panel_ids_stable_for_diff: [
      'p1-patient-population',
      'p2-intervention',
      'p3-mechanism',
      'p4-outcome',
      'p5-safety',
    ],
    alt_text:
      'Five-panel graphical abstract of Maude et al. 2018 NEJM CAR-T trial: ' +
      'patient population (pediatric/young adult B-cell ALL), intervention (tisagenlecleucel), ' +
      'mechanism (CAR-T recognizes CD19), outcome (81% remission, 73% EFS at 6 months), ' +
      'safety (77% cytokine release syndrome, 48% received tocilizumab).',
  },
  template_metadata: {
    creator: 'Jin Choi',
    acknowledgements: [
      {
        name: 'Maude SL, Laetsch TW, Buechner J, et al.',
        role: 'inspired_by_paper',
        source_doi: '10.1056/NEJMoa1709866',
      },
    ],
    derived_from_template_ids: [],
    source_paper_doi: '10.1056/NEJMoa1709866',
    citation_info: {
      in_text: 'Choi, J. (2026) BioRender Figure Compiler.',
      apa_full:
        'Choi, J. (2026). Tisagenlecleucel in Children and Young Adults with B-Cell Lymphoblastic ' +
        'Leukemia [Generated graphical abstract]. BioRender Figure Compiler. ' +
        'https://biorender-figure-compiler.vercel.app/example/maude-2018',
    },
    marketplace_eligibility: 'private',
  },
}

// ---------------------------------------------------------------------------
// Module-load validation. If this throws, the fixture is out of sync with
// the schema and the build should fail fast.
// ---------------------------------------------------------------------------

const result = FigureSpecSchema.safeParse(MAUDE_2018_FIGURESPEC)
if (!result.success) {
  throw new Error(
    `MAUDE_2018_FIGURESPEC failed schema validation:\n${JSON.stringify(result.error.format(), null, 2)}`
  )
}
