'use client'

import type { SourceSpan } from '@/core/schema'

type Props = {
  text: string
  highlightedSpan: SourceSpan | null
}

/**
 * Renders the original input abstract with the currently-hovered source span
 * highlighted. Hovering an entity or claim in the figure pane updates
 * `highlightedSpan`, which causes the corresponding text here to light up.
 *
 * This is the demo's "wow" moment: viewer sees that every figure element is
 * traceable to a literal substring of the input.
 */
export function SourceAbstract({ text, highlightedSpan }: Props) {
  if (!highlightedSpan) {
    return (
      <div className="abstract-pane">
        <h3>Source abstract</h3>
        <pre>{text}</pre>
      </div>
    )
  }

  const before = text.slice(0, highlightedSpan.start)
  const span = text.slice(highlightedSpan.start, highlightedSpan.end)
  const after = text.slice(highlightedSpan.end)

  return (
    <div className="abstract-pane">
      <h3>Source abstract</h3>
      <pre>
        {before}
        <mark>{span}</mark>
        {after}
      </pre>
    </div>
  )
}
