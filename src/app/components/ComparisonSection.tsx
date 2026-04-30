'use client'

/**
 * Comparison section: shows an original SVG diagram abstracting the
 * journal-published trial flow, with commentary explaining the structural
 * parallel and what FigureSpec adds.
 *
 * Demo discipline: this section appears below the figure panels in the same
 * scrollable area. The diagram is original artwork — trial counts (107, 92,
 * 75, 48) are public facts from the paper, but the visual rendering is ours.
 * Not a copy of NEJM's published Figure 1.
 *
 * Why an original diagram instead of the journal figure? BioRender's business
 * lives at the intersection of figure licensing, attribution, and publication
 * permissions. Shipping a copyrighted figure in a public demo would be a
 * credibility miss for this specific application. Original artwork that
 * abstracts the published structure (without copying it) demonstrates respect
 * for figure rights AND understanding of the trial flow.
 */

export function ComparisonSection() {
  return (
    <section className="comparison-section">
      <header className="comparison-header">
        <h3>Compare with published trial flow</h3>
        <p className="comparison-subtitle">
          The journal-published Figure 1 for the same paper is a CONSORT-style trial-flow diagram.
          Both are produced from the same trial, but FigureSpec is compiled from <em>just the abstract</em>;
          the journal figure had access to the full Methods + Supplementary Appendix.
        </p>
      </header>

      <div className="comparison-grid">
        <div className="comparison-image">
          <ConsortDiagramSVG />
          <div className="image-caption">
            <strong>Original schematic</strong> based on trial-flow facts reported in Maude et al. 2018;
            not a reproduction of the NEJM figure.
          </div>
        </div>

        <aside className="comparison-commentary">
          <h4>What both figures capture</h4>
          <ul>
            <li>Patient population (panel 1 ↔ "Screened")</li>
            <li>Intervention (panel 2 ↔ "Underwent infusion")</li>
            <li>Outcome (panel 4 ↔ "Remained in follow-up")</li>
          </ul>

          <h4>What FigureSpec adds</h4>
          <ul>
            <li>
              <strong>Mechanism panel (3).</strong> CAR-T recognizes CD19+ tumor cells.
              The journal figure doesn't show the molecular interaction; it's a trial-flow CONSORT.
            </li>
            <li>
              <strong>Safety panel (5).</strong> Cytokine release syndrome + tocilizumab use,
              extracted from the Results section of the abstract.
            </li>
            <li>
              <strong>Verbatim provenance on every claim.</strong> Hover any element above to see
              the source span highlighted in the abstract pane on the right.
            </li>
            <li>
              <strong>Validator-flagged inferences.</strong> The mechanism panel carries an{' '}
              <code>unsupported_claim</code> warning because it's inferred from the therapy
              description, not directly stated in the abstract.
            </li>
          </ul>

          <h4>What the journal figure does that FigureSpec doesn't</h4>
          <ul>
            <li>
              Per-step patient counts (107 → 92 → 75 → 48). Source: full Methods section,
              not in the abstract input.
            </li>
            <li>
              Discontinuation reasons (11 died, 9 lack of efficacy, etc.). Same — supplementary
              data, not in abstract.
            </li>
          </ul>

          <p className="attribution">
            Trial counts and discontinuation reasons are public facts from Maude SL, Laetsch TW,
            Buechner J, et al., <em>Tisagenlecleucel in Children and Young Adults with B-Cell
            Lymphoblastic Leukemia</em>, N Engl J Med 2018;378:439-448.{' '}
            <a
              href="https://doi.org/10.1056/NEJMoa1709866"
              target="_blank"
              rel="noopener noreferrer"
            >
              DOI: 10.1056/NEJMoa1709866
            </a>
            . Diagram above is original artwork abstracting the published trial flow; not a
            reproduction of NEJM's Figure 1.
          </p>
        </aside>
      </div>
    </section>
  )
}

/**
 * Original CONSORT-style trial flow diagram. Renders as a vertical stack of
 * rounded boxes with branched side boxes for excluded/discontinued counts.
 * Generic styling (sans-serif, rounded corners, neutral palette) — visually
 * distinct from NEJM's published figure.
 */
function ConsortDiagramSVG() {
  return (
    <svg
      viewBox="0 0 520 460"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      style={{ maxWidth: 520, display: 'block' }}
      role="img"
      aria-label="Trial flow diagram: 107 patients screened, 92 enrolled, 17 excluded, 75 underwent infusion, 27 discontinued, 48 remained in follow-up"
    >
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#374151" />
        </marker>
      </defs>

      {/* Box 1: 107 screened */}
      <rect x="40" y="12" width="200" height="40" rx="6" fill="#ffffff" stroke="#9ca3af" />
      <text x="140" y="37" textAnchor="middle" fontSize="13" fill="#1d1d1f" fontFamily="-apple-system, sans-serif">
        107 patients screened
      </text>

      {/* Arrow 1->2 */}
      <line x1="140" y1="52" x2="140" y2="78" stroke="#374151" strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Box 2: 92 enrolled */}
      <rect x="40" y="80" width="200" height="40" rx="6" fill="#ffffff" stroke="#9ca3af" />
      <text x="140" y="105" textAnchor="middle" fontSize="13" fill="#1d1d1f" fontFamily="-apple-system, sans-serif">
        92 enrolled
      </text>

      {/* Branch to excluded */}
      <line x1="140" y1="120" x2="140" y2="155" stroke="#374151" strokeWidth="1.5" />
      <line x1="140" y1="155" x2="270" y2="155" stroke="#374151" strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Excluded side box */}
      <rect x="280" y="125" width="220" height="84" rx="6" fill="#fffbeb" stroke="#fbbf24" />
      <text x="290" y="146" fontSize="12" fontWeight="600" fill="#92400e" fontFamily="-apple-system, sans-serif">
        17 excluded
      </text>
      <text x="290" y="166" fontSize="11" fill="#374151" fontFamily="-apple-system, sans-serif">
        7 had product-related issues
      </text>
      <text x="290" y="183" fontSize="11" fill="#374151" fontFamily="-apple-system, sans-serif">
        7 died
      </text>
      <text x="290" y="200" fontSize="11" fill="#374151" fontFamily="-apple-system, sans-serif">
        3 had adverse events
      </text>

      {/* Continue main flow */}
      <line x1="140" y1="155" x2="140" y2="225" stroke="#374151" strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Box 3: 75 infused */}
      <rect x="40" y="227" width="200" height="40" rx="6" fill="#ffffff" stroke="#9ca3af" />
      <text x="140" y="252" textAnchor="middle" fontSize="13" fill="#1d1d1f" fontFamily="-apple-system, sans-serif">
        75 underwent infusion
      </text>

      {/* Branch to discontinued */}
      <line x1="140" y1="267" x2="140" y2="305" stroke="#374151" strokeWidth="1.5" />
      <line x1="140" y1="305" x2="270" y2="305" stroke="#374151" strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Discontinued side box */}
      <rect x="280" y="265" width="220" height="100" rx="6" fill="#fffbeb" stroke="#fbbf24" />
      <text x="290" y="286" fontSize="12" fontWeight="600" fill="#92400e" fontFamily="-apple-system, sans-serif">
        27 discontinued
      </text>
      <text x="290" y="306" fontSize="11" fill="#374151" fontFamily="-apple-system, sans-serif">
        11 died
      </text>
      <text x="290" y="323" fontSize="11" fill="#374151" fontFamily="-apple-system, sans-serif">
        9 lack of efficacy
      </text>
      <text x="290" y="340" fontSize="11" fill="#374151" fontFamily="-apple-system, sans-serif">
        5 underwent new therapy
      </text>
      <text x="290" y="357" fontSize="11" fill="#374151" fontFamily="-apple-system, sans-serif">
        2 withdrew or were withdrawn
      </text>

      {/* Final arrow */}
      <line x1="140" y1="305" x2="140" y2="395" stroke="#374151" strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Box 4: 48 follow-up */}
      <rect x="40" y="397" width="200" height="40" rx="6" fill="#f0fdf4" stroke="#22c55e" />
      <text x="140" y="422" textAnchor="middle" fontSize="13" fontWeight="600" fill="#14532d" fontFamily="-apple-system, sans-serif">
        48 remained in follow-up
      </text>
    </svg>
  )
}
