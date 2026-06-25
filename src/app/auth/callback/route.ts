import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Auth callback used by Supabase magic links, password recovery and OAuth.
 *
 * Supabase appends `?code=XXX` to the redirect URL when using the PKCE flow
 * (the default with `@supabase/ssr`). This route exchanges that code for a
 * session (sets the auth cookies) and then forwards the user to `next`.
 *
 * Without this exchange, password recovery + magic links never establish a
 * session and downstream pages think the link is expired/invalid.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error') || url.searchParams.get('error_code')
  const errorDescription = url.searchParams.get('error_description')
  const next = url.searchParams.get('next') || '/admin'

  if (errorParam) {
    const target = new URL('/admin/login', request.url)
    target.searchParams.set('error', errorDescription || errorParam)
    return NextResponse.redirect(target)
  }

  if (!code) {
    // Nothing to exchange — just forward.
    return NextResponse.redirect(new URL(next, request.url))
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const target = new URL('/admin/login', request.url)
    target.searchParams.set('error', error.message)
    return NextResponse.redirect(target)
  }

  return NextResponse.redirect(new URL(next, request.url))
}
