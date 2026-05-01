/**
 * POST /api/resolve-assets-bootstrap
 *
 * One-shot route to seed the Vercel KV store with the initial
 * refresh_token (and optionally a fresh access_token). Called once
 * after KV is provisioned, then never again — the main /api/resolve-
 * assets route handles rotation indefinitely.
 *
 * Security: this route is gated by a shared secret in the request body
 * (BIORENDER_BOOTSTRAP_SECRET env var). Without the secret, anyone could
 * overwrite our KV-stored tokens. With it, only callers with the secret
 * (Jin running curl from his laptop) can seed.
 *
 * Request shape:
 *   { secret: string,
 *     refresh_token: string,
 *     access_token?: string,
 *     expires_in?: number }
 *
 * Response:
 *   200 { ok: true, message: string }
 *   401 { ok: false, error: 'Bootstrap secret invalid.' }
 *   400 { ok: false, error: string }
 */

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const KV_ACCESS_KEY = 'biorender:access_token'
const KV_ACCESS_EXPIRES_KEY = 'biorender:access_token_expires_at'
const KV_REFRESH_KEY = 'biorender:refresh_token'

export async function POST(request: Request) {
  const expectedSecret = process.env.BIORENDER_BOOTSTRAP_SECRET
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: 'Bootstrap not configured: BIORENDER_BOOTSTRAP_SECRET unset.' },
      { status: 500 }
    )
  }

  let body: {
    secret?: string
    refresh_token?: string
    access_token?: string
    expires_in?: number
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Request body must be valid JSON.' },
      { status: 400 }
    )
  }

  if (body.secret !== expectedSecret) {
    return NextResponse.json(
      { ok: false, error: 'Bootstrap secret invalid.' },
      { status: 401 }
    )
  }

  if (!body.refresh_token || typeof body.refresh_token !== 'string') {
    return NextResponse.json(
      { ok: false, error: '`refresh_token` is required.' },
      { status: 400 }
    )
  }

  await kv.set(KV_REFRESH_KEY, body.refresh_token)

  if (body.access_token && typeof body.access_token === 'string') {
    const expiresAt = Date.now() + (body.expires_in ?? 28800) * 1000
    await kv.set(KV_ACCESS_KEY, body.access_token)
    await kv.set(KV_ACCESS_EXPIRES_KEY, expiresAt)
  }

  return NextResponse.json({
    ok: true,
    message:
      'KV bootstrapped. /api/resolve-assets is now self-rotating. ' +
      'Bootstrap can be re-run if tokens are ever invalidated.',
  })
}
