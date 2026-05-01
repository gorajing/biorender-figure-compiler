/**
 * POST /api/resolve-assets
 *
 * Calls BioRender's production MCP connector at
 * https://mcp.services.biorender.com/mcp to resolve entity names into
 * real BioRender icons. The MCP exposes two tools (search-icons and
 * search-templates); this route uses search-icons.
 *
 * Auth flow:
 *   1. POST /oauth/token with grant_type=refresh_token to get a fresh
 *      access_token (8-hour validity per BioRender's OAuth 2.1 server).
 *   2. POST /mcp with Bearer access_token, calling tools/call for
 *      search-icons. Streamable-HTTP MCP returns SSE-formatted JSON.
 *   3. Parse the SSE event, extract the inner text payload (which is
 *      itself stringified JSON containing the search results), and
 *      return a simplified shape to the client.
 *
 * Refresh on every request: the access_token is short-lived and Vercel
 * Lambda instances are stateless. Refreshing on every request adds one
 * extra HTTPS round trip (~150ms) but avoids any token-staleness bugs.
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
const TOKEN_URL = 'https://mcp.services.biorender.com/oauth/token'

type ResolvedIcon = {
  name: string
  description: string
  assetType: string
  placeable: boolean
  width: number
  height: number
}

async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.BIORENDER_OAUTH_CLIENT_ID
  const clientSecret = process.env.BIORENDER_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.BIORENDER_OAUTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('BioRender OAuth env vars are not configured.')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Token refresh failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) {
    throw new Error('Token refresh returned no access_token.')
  }
  return json.access_token
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
    const accessToken = await refreshAccessToken()
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
