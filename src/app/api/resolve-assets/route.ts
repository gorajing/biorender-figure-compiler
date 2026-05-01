/**
 * POST /api/resolve-assets
 *
 * Calls BioRender's production MCP connector at
 * https://mcp.services.biorender.com/mcp to resolve entity names into
 * real BioRender icons. The MCP exposes two tools (search-icons and
 * search-templates); this route uses search-icons.
 *
 * Auth (with Vercel KV for shared-state token rotation):
 *
 *   BioRender's OAuth 2.1 server rotates refresh_tokens after every use
 *   (RFC 6749 standard). Stateless Vercel Lambdas can't persist the
 *   rotated refresh_token across invocations without external shared
 *   state. This route uses Vercel KV (Upstash Redis under the hood) as
 *   that shared state.
 *
 *   Per request:
 *     1. Try to read a cached access_token from KV. If present AND not
 *        within 5 minutes of expiry, use it directly (skip refresh).
 *     2. Else: read the current refresh_token from KV, POST /oauth/token
 *        with grant_type=refresh_token to get a new access_token + new
 *        refresh_token, write both back to KV atomically, use the new
 *        access_token for the MCP call.
 *
 *   Race condition: two concurrent requests both seeing a stale access
 *   token will both attempt refresh. First wins. Second's refresh fails
 *   with invalid_grant. Mitigation: catch invalid_grant, re-read the
 *   newly-cached access_token from KV (the other Lambda just wrote it),
 *   use that. For low-traffic demo this race is rare; the retry handles
 *   the rare case.
 *
 * Bootstrap: KV must be seeded with the initial refresh_token via the
 * /api/resolve-assets-bootstrap route or a one-shot script. After that,
 * the route is self-rotating indefinitely.
 *
 * Response shape:
 *   200 { ok: true, query: string, results: ResolvedIcon[] }
 *   400 { ok: false, error: string }
 *   500 { ok: false, error: string }
 *
 * Note: the MCP returns an `_id` per icon. We deliberately do NOT pass
 * it back to the client. The MCP's tool description says: "Do not show
 * the icon _id to the user — it is included for use by other tools
 * only." We respect that contract.
 */

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const MCP_URL = 'https://mcp.services.biorender.com/mcp'
const TOKEN_URL = 'https://mcp.services.biorender.com/oauth/token'

const KV_ACCESS_KEY = 'biorender:access_token'
const KV_ACCESS_EXPIRES_KEY = 'biorender:access_token_expires_at'
const KV_REFRESH_KEY = 'biorender:refresh_token'

// Safety margin: refresh if the cached access_token is within this many
// milliseconds of expiry. 5 minutes is generous enough that a slow MCP
// call started right before refresh-window has time to complete on the
// previous token.
const REFRESH_SAFETY_MARGIN_MS = 5 * 60 * 1000

type ResolvedIcon = {
  name: string
  description: string
  assetType: string
  placeable: boolean
  width: number
  height: number
}

async function refreshFromKv(): Promise<string> {
  const clientId = process.env.BIORENDER_OAUTH_CLIENT_ID
  const clientSecret = process.env.BIORENDER_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'BIORENDER_OAUTH_CLIENT_ID / BIORENDER_OAUTH_CLIENT_SECRET env vars are not configured.'
    )
  }

  const refreshToken = await kv.get<string>(KV_REFRESH_KEY)
  if (!refreshToken) {
    throw new Error(
      'No refresh_token in KV. Bootstrap the store via /api/resolve-assets-bootstrap.'
    )
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
    // invalid_grant typically means another Lambda just rotated the
    // refresh_token. Bubble up so the caller can retry by re-reading KV.
    throw new Error(`Token refresh failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!json.access_token || !json.refresh_token) {
    throw new Error('Token refresh response missing access_token or refresh_token.')
  }

  const expiresAt = Date.now() + (json.expires_in ?? 28800) * 1000
  // Write the new refresh_token first (the most important durable bit),
  // then the access_token cache. If the access_token write fails, the
  // next request will refresh again using the new refresh_token.
  await kv.set(KV_REFRESH_KEY, json.refresh_token)
  await kv.set(KV_ACCESS_KEY, json.access_token)
  await kv.set(KV_ACCESS_EXPIRES_KEY, expiresAt)

  return json.access_token
}

async function getValidAccessToken(): Promise<string> {
  // First-pass: try the cached access_token if it's fresh enough.
  const [cachedAccess, cachedExpires] = await Promise.all([
    kv.get<string>(KV_ACCESS_KEY),
    kv.get<number>(KV_ACCESS_EXPIRES_KEY),
  ])
  if (
    cachedAccess &&
    cachedExpires &&
    cachedExpires > Date.now() + REFRESH_SAFETY_MARGIN_MS
  ) {
    return cachedAccess
  }

  // Stale or missing. Refresh.
  try {
    return await refreshFromKv()
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    // Concurrency-aware retry: if refresh failed (invalid_grant or
    // similar), another Lambda may have just updated KV with a fresh
    // pair. Re-read once before giving up.
    if (msg.includes('invalid_grant') || msg.includes('400')) {
      const [retryAccess, retryExpires] = await Promise.all([
        kv.get<string>(KV_ACCESS_KEY),
        kv.get<number>(KV_ACCESS_EXPIRES_KEY),
      ])
      if (
        retryAccess &&
        retryExpires &&
        retryExpires > Date.now() + REFRESH_SAFETY_MARGIN_MS &&
        retryAccess !== cachedAccess
      ) {
        return retryAccess
      }
    }
    throw err
  }
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
    const accessToken = await getValidAccessToken()
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
