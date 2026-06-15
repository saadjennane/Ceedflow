import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

// 1x1 transparent PNG (43 bytes)
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // Fire-and-forget: log the open. Don't await failures from blocking the pixel.
  void (async () => {
    try {
      const supa = await createServiceRoleClient()
      const { data: send } = await supa
        .from('email_sends')
        .select('id, campaign_id, opened_at, open_count')
        .eq('tracking_token', token)
        .maybeSingle()
      if (!send) return

      const isFirstOpen = !send.opened_at
      await supa
        .from('email_sends')
        .update({
          opened_at: send.opened_at || new Date().toISOString(),
          last_opened_at: new Date().toISOString(),
          open_count: (send.open_count || 0) + 1,
        })
        .eq('id', send.id)

      if (isFirstOpen) {
        // Bump campaign opened_count once per recipient (only on first open)
        const { data: campaign } = await supa
          .from('email_campaigns')
          .select('opened_count')
          .eq('id', send.campaign_id)
          .maybeSingle()
        if (campaign) {
          await supa
            .from('email_campaigns')
            .update({ opened_count: (campaign.opened_count || 0) + 1 })
            .eq('id', send.campaign_id)
        }
      }
    } catch {
      // Silent: tracking failures must never block the pixel response.
    }
  })()

  return new NextResponse(PIXEL as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(PIXEL.length),
      // Strong anti-cache so each open hits the server
      'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
