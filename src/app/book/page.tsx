import { createServiceRoleClient } from '@/lib/supabase/server'
import { BOOKING_DEADLINE, BOOKING_DAYS } from '@/lib/config'
import BookingClient from '@/components/BookingClient'
import type { BookingSlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function BookPage() {
  const supabase = await createServiceRoleClient()

  const closed = Date.now() > new Date(BOOKING_DEADLINE).getTime()

  // We list every slot for the two configured days and the ids of slots already
  // taken. The client marks the taken ones as unavailable. Bookings table is
  // never leaked in full to the browser — only the slot ids.
  const [slotsRes, takenRes] = await Promise.all([
    supabase
      .from('booking_slots')
      .select('*')
      .in('day', [...BOOKING_DAYS])
      .order('day', { ascending: true })
      .order('sort_index', { ascending: true }),
    supabase.from('bookings').select('slot_id'),
  ])

  const slots = (slotsRes.data || []) as BookingSlot[]
  const takenSlotIds = ((takenRes.data || []) as { slot_id: string }[]).map(b => b.slot_id)

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/40 via-white to-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center mb-6">
          <img src="/Logos/logo%20builders-02.png" alt="The Builders" className="h-10" />
        </div>
        <BookingClient
          slots={slots}
          takenSlotIds={takenSlotIds}
          closed={closed}
        />
      </div>
    </div>
  )
}
