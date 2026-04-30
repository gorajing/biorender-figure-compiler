/**
 * POST /api/extract
 *
 * Server route that takes an input text and returns a GenerateFigureResponse.
 * Stateless. Does not cache (caching is client-side via localStorage).
 * Does not persist pasted abstracts.
 *
 * Mode dispatch happens in core/extract.ts. Default mode is fixture, so this
 * route works without any external dependencies (no API key, no CLI).
 *
 * Response shape:
 *   200 { ok: true, response: GenerateFigureResponse }
 *   400 { ok: false, error: string }
 *   500 { ok: false, error: string }
 */

import { NextResponse } from 'next/server'
import { extract, getExtractMode } from '@/core/extract'

const MAX_INPUT_LENGTH = 10_000  // 10KB cap on pasted text. Generous for an abstract.

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Request body must be valid JSON.' },
      { status: 400 }
    )
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { inputText?: unknown }).inputText !== 'string'
  ) {
    return NextResponse.json(
      { ok: false, error: 'Request body must include `inputText: string`.' },
      { status: 400 }
    )
  }

  const inputText = (body as { inputText: string }).inputText.trim()

  if (inputText.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'inputText must not be empty.' },
      { status: 400 }
    )
  }

  if (inputText.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `inputText exceeds ${MAX_INPUT_LENGTH} character limit.` },
      { status: 400 }
    )
  }

  try {
    const response = await extract(inputText)
    const mode = getExtractMode()
    return NextResponse.json({
      ok: true,
      mode,
      notice: noticeForMode(mode),
      response,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown extraction error'
    console.error('Extraction failed:', err)
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}

/**
 * Per-mode user-facing notice. Returned alongside the response so the client
 * doesn't have to hardcode mode-aware UI messages. When extract-api.ts and
 * extract-cli.ts ship, this is where their notices live too.
 */
function noticeForMode(mode: 'fixture' | 'cli' | 'api'): string | null {
  switch (mode) {
    case 'fixture':
      return (
        'Live extraction is not enabled in this environment. ' +
        'Returning the canonical Maude 2018 CAR-T example regardless of pasted input. ' +
        'Set EXTRACT_MODE=api with ANTHROPIC_API_KEY (or EXTRACT_MODE=cli for local Claude Code) to enable live generation.'
      )
    case 'cli':
      return null  // live mode — no notice needed
    case 'api':
      return null  // live mode — no notice needed
  }
}
