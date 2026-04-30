/**
 * Reference fixture: Maude et al. 2018 NEJM tisagenlecleucel CAR-T trial.
 *
 * Used as:
 *   1. The Day 1 input fixture — paste this abstract into the prototype to test
 *      end-to-end extraction → validation → preview.
 *   2. The golden test target for `tests/extract.test.ts`.
 *   3. The headline demo example in the Day 4 Loom walkthrough.
 *
 * Comparison reference for Day 4 demo:
 *   The NEJM-published PowerPoint slide deck (`nejmoa1709866.pptx`) contains
 *   Figure 1 ("Screening, Enrollment, Treatment, and Follow-up") and Figure 2
 *   ("Duration of Remission, Event-free Survival..."). Figure 1 is the natural
 *   comparison target for what FigureSpec compiles from this abstract.
 */

export interface ReferenceAbstract {
  citation: {
    title: string
    authors: string                  // first three + et al.
    journal: string
    year: number
    volume: string
    pages: string
    doi: string
    pmid: string
    pmcid: string
    clinical_trial_id: string
  }
  funding: string[]
  abstract_text: string              // verbatim, with section headers preserved
  mechanism_paragraph: string        // verbatim, the methods sentence describing CAR construction
  extended_input: string             // abstract + mechanism paragraph, for richer demo
  published_figures: { number: number, title: string }[]
}

export const MAUDE_2018_CART: ReferenceAbstract = {
  citation: {
    title: 'Tisagenlecleucel in Children and Young Adults with B-Cell Lymphoblastic Leukemia',
    authors: 'Maude SL, Laetsch TW, Buechner J, et al.',
    journal: 'N Engl J Med',
    year: 2018,
    volume: '378(5)',
    pages: '439-448',
    doi: '10.1056/NEJMoa1709866',
    pmid: '29385370',
    pmcid: 'PMC5996391',
    clinical_trial_id: 'NCT02435849',
  },
  funding: ['Novartis Pharmaceuticals'],
  abstract_text: `Background: In a single-center phase 1-2a study, the anti-CD19 chimeric antigen receptor (CAR) T-cell therapy tisagenlecleucel produced high rates of complete remission and was associated with serious but mainly reversible toxic effects in children and young adults with relapsed or refractory B-cell acute lymphoblastic leukemia (ALL).

Methods: We conducted a phase 2, single-cohort, 25-center, global study of tisagenlecleucel in pediatric and young adult patients with CD19+ relapsed or refractory B-cell ALL. The primary end point was the overall remission rate (the rate of complete remission or complete remission with incomplete hematologic recovery) within 3 months.

Results: For this planned analysis, 75 patients received an infusion of tisagenlecleucel and could be evaluated for efficacy. The overall remission rate within 3 months was 81%, with all patients who had a response to treatment found to be negative for minimal residual disease, as assessed by means of flow cytometry. The rates of event-free survival and overall survival were 73% (95% confidence interval [CI], 60 to 82) and 90% (95% CI, 81 to 95), respectively, at 6 months and 50% (95% CI, 35 to 64) and 76% (95% CI, 63 to 86) at 12 months. The median duration of remission was not reached. Persistence of tisagenlecleucel in the blood was observed for as long as 20 months. Grade 3 or 4 adverse events that were suspected to be related to tisagenlecleucel occurred in 73% of patients. The cytokine release syndrome occurred in 77% of patients, 48% of whom received tocilizumab. Neurologic events occurred in 40% of patients and were managed with supportive care, and no cerebral edema was reported.

Conclusions: In this global study of CAR T-cell therapy, a single infusion of tisagenlecleucel provided durable remission with long-term persistence in pediatric and young adult patients with relapsed or refractory B-cell ALL, with transient high-grade toxic effects.`,
  mechanism_paragraph: `Tisagenlecleucel was generated ex vivo with the use of autologous T cells transduced with a lentiviral vector to express a CAR containing a CD3-zeta domain to provide a T-cell activation signal and a 4-1BB (CD137) domain to provide a costimulatory signal.`,
  extended_input: `Background: In a single-center phase 1-2a study, the anti-CD19 chimeric antigen receptor (CAR) T-cell therapy tisagenlecleucel produced high rates of complete remission and was associated with serious but mainly reversible toxic effects in children and young adults with relapsed or refractory B-cell acute lymphoblastic leukemia (ALL).

Methods: We conducted a phase 2, single-cohort, 25-center, global study of tisagenlecleucel in pediatric and young adult patients with CD19+ relapsed or refractory B-cell ALL. The primary end point was the overall remission rate (the rate of complete remission or complete remission with incomplete hematologic recovery) within 3 months. Tisagenlecleucel was generated ex vivo with the use of autologous T cells transduced with a lentiviral vector to express a CAR containing a CD3-zeta domain to provide a T-cell activation signal and a 4-1BB (CD137) domain to provide a costimulatory signal.

Results: For this planned analysis, 75 patients received an infusion of tisagenlecleucel and could be evaluated for efficacy. The overall remission rate within 3 months was 81%, with all patients who had a response to treatment found to be negative for minimal residual disease, as assessed by means of flow cytometry. The rates of event-free survival and overall survival were 73% (95% confidence interval [CI], 60 to 82) and 90% (95% CI, 81 to 95), respectively, at 6 months and 50% (95% CI, 35 to 64) and 76% (95% CI, 63 to 86) at 12 months. The cytokine release syndrome occurred in 77% of patients, 48% of whom received tocilizumab.`,
  published_figures: [
    { number: 1, title: 'Screening, Enrollment, Treatment, and Follow-up' },
    { number: 2, title: 'Duration of Remission, Event-free Survival, and Overall Survival' },
  ],
}

/**
 * Expected entities the extractor should pick up from this abstract.
 * Used by the golden test in `tests/extract.test.ts`.
 *
 * NOTE: every name listed below is a verbatim substring of `abstract_text`.
 * The validator will reject anything that fails this check.
 */
export const MAUDE_2018_EXPECTED_ENTITIES = [
  // Background
  { name: 'tisagenlecleucel', type: 'molecule' as const },
  { name: 'anti-CD19 chimeric antigen receptor (CAR) T-cell therapy', type: 'protein' as const },
  { name: 'B-cell acute lymphoblastic leukemia (ALL)', type: 'tissue' as const },
  // Methods
  { name: 'pediatric and young adult patients', type: 'organism' as const },
  { name: 'CD19+ relapsed or refractory B-cell ALL', type: 'tissue' as const },
  // Results
  { name: '75 patients', type: 'concept' as const },
  { name: 'tocilizumab', type: 'molecule' as const },
  { name: 'cytokine release syndrome', type: 'process' as const },
  // Conclusions
  { name: 'durable remission', type: 'concept' as const },
]

/**
 * Expected claims the extractor should pick up.
 * Each must have a verifiable source_span pointing into abstract_text.
 */
export const MAUDE_2018_EXPECTED_CLAIMS = [
  { text: 'overall remission rate within 3 months was 81%', evidence_strength: 'direct' as const },
  { text: 'event-free survival', evidence_strength: 'direct' as const },
  { text: 'Persistence of tisagenlecleucel in the blood was observed for as long as 20 months', evidence_strength: 'direct' as const },
  { text: 'cytokine release syndrome occurred in 77% of patients', evidence_strength: 'direct' as const },
  { text: 'durable remission with long-term persistence', evidence_strength: 'direct' as const },
  { text: 'transient high-grade toxic effects', evidence_strength: 'direct' as const },
]

/**
 * Mechanism-paragraph entities. Used when the user pastes `extended_input`
 * (abstract + mechanism). These additional entities show up in the richer
 * mechanism+trial figure.
 */
export const MAUDE_2018_MECHANISM_ENTITIES = [
  { name: 'autologous T cells', type: 'cell' as const },
  { name: 'lentiviral vector', type: 'repeated_unit' as const },
  { name: 'CAR', type: 'protein' as const },
  { name: 'CD3-zeta domain', type: 'protein' as const },
  { name: '4-1BB (CD137) domain', type: 'protein' as const },
]

/**
 * Suggested figure structure for the abstract-only input.
 * Maps thematically to NEJM Figure 1 ("Screening, Enrollment, Treatment, and Follow-up").
 */
export const MAUDE_2018_SUGGESTED_LAYOUT_ABSTRACT_ONLY = {
  audience: 'graphical_abstract' as const,
  figure_type: 'clinical_trial_design',
  panels: [
    { id: 'p1', title: 'Eligibility', input_step_ids: ['background', 'methods'] },
    { id: 'p2', title: 'Treatment', input_step_ids: ['methods'] },
    { id: 'p3', title: 'Response', input_step_ids: ['results'] },
    { id: 'p4', title: 'Survival', input_step_ids: ['results'] },
    { id: 'p5', title: 'Adverse events', input_step_ids: ['results'] },
  ],
  layout: 'left_to_right_process' as const,
  step_connector_style: 'numbered_badge' as const,
}

/**
 * Suggested figure structure for the extended input (abstract + mechanism).
 * Generates a richer 7-panel figure with mechanism panels integrated into the trial flow.
 */
export const MAUDE_2018_SUGGESTED_LAYOUT_EXTENDED = {
  audience: 'graphical_abstract' as const,
  figure_type: 'mechanism_and_trial',
  panels: [
    { id: 'p1', title: 'Patient eligibility', input_step_ids: ['background', 'methods.eligibility'] },
    { id: 'p2', title: 'Leukapheresis', input_step_ids: ['methods.cell_collection'] },
    { id: 'p3', title: 'Lentiviral CAR transduction', input_step_ids: ['methods.car_construction'] },
    { id: 'p4', title: 'Ex vivo expansion', input_step_ids: ['methods.expansion'] },
    { id: 'p5', title: 'Infusion', input_step_ids: ['methods.administration'] },
    { id: 'p6', title: 'Response and survival', input_step_ids: ['results.efficacy'] },
    { id: 'p7', title: 'Adverse events', input_step_ids: ['results.safety'] },
  ],
  layout: 'left_to_right_process' as const,
  step_connector_style: 'arrow' as const,  // arrows for mechanism flow vs numbered badges for trial steps
}
