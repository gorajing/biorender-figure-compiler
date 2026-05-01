/**
 * POST /api/resolve-assets
 *
 * Calls BioRender's production MCP connector at
 * https://mcp.services.biorender.com/mcp to resolve entity names into
 * real BioRender icons. The MCP exposes two tools (search-icons and
 * search-templates); this route uses search-icons.
 *
 * Auth: uses BIORENDER_ACCESS_TOKEN directly (8-hour validity per
 * BioRender's OAuth 2.1 server). Production Path A note: BioRender
 * rotates refresh_tokens on every use, which is incompatible with
 * stateless Vercel Lambdas without external shared state. For this
 * prototype, the access_token is obtained via the OAuth flow once
 * locally, stored in Vercel env, and used directly. When it expires,
 * we re-do the OAuth flow and rotate the env var. A production-grade
 * version would use Vercel KV (or equivalent) to share refresh state
 * across Lambda instances.
 *
 * Response shape:
 *   200 { ok: true, query: string, results: ResolvedIcon[] }
 *   400 { ok: false, error: string }
 *   500 { ok: false, error: string }
 *
 * Where ResolvedIcon =
 *   { name: string; description: string; assetType: string;
 *     placeable: boolean; width: number; height: number }
 *
 * Note: the MCP returns an `_id` per icon. We deliberately do NOT pass
 * it back to the client. The MCP's tool description says: "Do not show
 * the icon _id to the user — it is included for use by other tools
 * only." We respect that contract.
 */

import { NextResponse } from 'next/server'

const MCP_URL = 'https://mcp.services.biorender.com/mcp'

type ResolvedIcon = {
  name: string
  description: string
  assetType: string
  placeable: boolean
  width: number
  height: number
}

function getAccessToken(): string {
  const accessToken = process.env.BIORENDER_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error(
      'BIORENDER_ACCESS_TOKEN env var is not configured. ' +
        'Re-run the OAuth flow locally and rotate the env var.'
    )
  }
  return accessToken
}

/**
 * Parse a Streamable-HTTP MCP response (SSE-format) and return the
 * inner JSON-RPC result payload. The server returns:
 *   event: message\n
 *   data: {"result":{...},"jsonrpc":"2.0","id":N}\n\n
 */
function parseSseJsonRpc(text: string): unknown {
  const dataLine = text
    .split('\n')
    .find((line) => line.startsWith('data:'))
  if (!dataLine) {
    throw new Error('MCP response did not include a data: line.')
  }
  const jsonStr = dataLine.slice('data:'.length).trim()
  return JSON.parse(jsonStr)
}

async function callMcpSearchIcons(
  accessToken: string,
  query: string,
  perPage: number
): Promise<ResolvedIcon[]> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'search-icons',
        arguments: { query, perPage },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MCP search-icons failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }

  const text = await res.text()
  const parsed = parseSseJsonRpc(text) as {
    result?: {
      content?: Array<{ type: string; text: string }>
    }
    error?: { message?: string }
  }

  if (parsed.error) {
    throw new Error(`MCP search-icons error: ${parsed.error.message}`)
  }

  const textContent = parsed.result?.content?.find((c) => c.type === 'text')
  if (!textContent) {
    throw new Error('MCP response did not include a text content block.')
  }

  // The text content has a preamble line ("Found N icon(s)...") then a JSON
  // object. Find the first { and parse from there.
  const braceIdx = textContent.text.indexOf('{')
  if (braceIdx === -1) {
    throw new Error('MCP text content did not contain a JSON object.')
  }
  const inner = JSON.parse(textContent.text.slice(braceIdx)) as {
    hits?: Array<{
      name?: string
      displayName?: string
      description?: string
      assetType?: string
      placeable?: boolean
      width?: number
      height?: number
    }>
  }

  const hits = inner.hits ?? []
  return hits.map((h) => ({
    name: h.displayName || h.name || 'Untitled',
    description: h.description ?? '',
    assetType: h.assetType ?? 'unknown',
    placeable: Boolean(h.placeable),
    width: h.width ?? 0,
    height: h.height ?? 0,
  }))
}

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
    typeof (body as { query?: unknown }).query !== 'string'
  ) {
    return NextResponse.json(
      { ok: false, error: 'Request body must include `query: string`.' },
      { status: 400 }
    )
  }

  const query = (body as { query: string; perPage?: number }).query.trim()
  const perPage = (body as { query: string; perPage?: number }).perPage ?? 3

  if (query.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'query must not be empty.' },
      { status: 400 }
    )
  }

  if (query.length > 500) {
    return NextResponse.json(
      { ok: false, error: 'query exceeds 500 character limit.' },
      { status: 400 }
    )
  }

  try {
    const accessToken = getAccessToken()
    const results = await callMcpSearchIcons(accessToken, query, perPage)
    return NextResponse.json({
      ok: true,
      query,
      results: results.slice(0, perPage),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown MCP error'
    console.error('Asset resolution failed:', err)
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}
