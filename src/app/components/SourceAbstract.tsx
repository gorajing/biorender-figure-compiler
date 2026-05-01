'use client'

import { useEffect, useRef } from 'react'
import type { SourceSpan } from '@/core/schema'

type Props = {
  text: string
  hoveredSpan: SourceSpan | null
  pinnedSpan: SourceSpan | null
}

/**
 * Renders the original input abstract with the currently-active source span
 * highlighted. Two interactions feed this surface:
 *   - HOVER (hoveredSpan): previews the verbatim source for whichever chip
 *     or row the user is hovering. Highlight only, no scroll.
 *   - CLICK (pinnedSpan):  pins the highlight and smooth-scrolls the
 *     abstract pane to bring the passage into view. Stays pinned until
 *     another click changes it.
 *
 * The "active" highlight rendered = hoveredSpan ?? pinnedSpan. Hover takes
 * precedence visually so that previewing a different chip does what the
 * user expects, while the pinned span remains the anchor when they move
 * the mouse away.
 *
 * This is the core provenance affordance: every figure element traces
 * back to verbatim source text. Hover previews it, click navigates to it.
 */
export function SourceAbstract({ text, hoveredSpan, pinnedSpan }: Props) {
  const activeSpan = hoveredSpan ?? pinnedSpan
  const markRef = useRef<HTMLElement>(null)

  // Scroll the pinned span into view when it changes. We watch only the
  // pinned span (not the hovered one) so that hover never causes scroll.
  useEffect(() => {
    if (!pinnedSpan) return
    // Defer to next frame so the mark is in the DOM before we scroll.
    const id = window.requestAnimationFrame(() => {
      markRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [pinnedSpan?.start, pinnedSpan?.end])

  if (!activeSpan) {
    return (
      <div className="abstract-pane">
        <h3>Source abstract</h3>
        <pre>{text}</pre>
      </div>
    )
  }

  const before = text.slice(0, activeSpan.start)
  const span = text.slice(activeSpan.start, activeSpan.end)
  const after = text.slice(activeSpan.end)

  // Attach the scroll target ref only when the rendered mark IS the pinned
  // span (i.e., not while a different hover is taking over). Without this
  // guard, hovering a far-away chip while a span is pinned would re-target
  // the scroll-into-view at the hovered chip's location.
  const isMarkPinned =
    !!pinnedSpan &&
    activeSpan.start === pinnedSpan.start &&
    activeSpan.end === pinnedSpan.end

  return (
    <div className="abstract-pane">
      <h3>Source abstract</h3>
      <pre>
        {before}
        <mark ref={isMarkPinned ? markRef : null}>{span}</mark>
        {after}
      </pre>
    </div>
  )
}
