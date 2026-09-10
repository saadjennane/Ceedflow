import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import BookingsAdminTable from '@/components/BookingsAdminTable'
import { Calendar } from 'lucide-react'
import type { Booking, BookingSlot } from '@/lib/types'

export default async function AdminBookingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const [slotsRes, bookingsRes] = await Promise.all([
    supabase.from('booking_slots').select('*'),
    supabase.from('bookings').select('*'),
  ])
  const slots = (slotsRes.data || []) as BookingSlot[]
  const bookings = (bookingsRes.data || []) as Booking[]

  // Chronological order by day then start_time. Bookings on unknown slots
  // sink to the bottom so nothing hides on top when a slot was pruned.
  const slotById = new Map(slots.map(s => [s.id, s]))
  const sortedBookings = [...bookings].sort((a, b) => {
    const sa = slotById.get(a.slot_id)
    const sb = slotById.get(b.slot_id)
    if (!sa && !sb) return 0
    if (!sa) return 1
    if (!sb) return -1
    if (sa.day !== sb.day) return sa.day.localeCompare(sb.day)
    return sa.start_time.localeCompare(sb.start_time)
  })

  const totalSlots = slots.length
  const bookedCount = bookings.length
  const freeCount = totalSlots - bookedCount

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Réservations</h1>
            <p className="text-sm text-gray-500">
              Lien public : <a href="/book" className="text-emerald-700 underline">/book</a>
            </p>
          </div>
          <div className="flex gap-3">
            <Stat label="Réservés" value={bookedCount} color="text-emerald-700" />
            <Stat label="Libres" value={freeCount} color="text-gray-700" />
            <Stat label="Total" value={totalSlots} color="text-gray-500" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {bookings.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Calendar size={28} className="mx-auto text-gray-300 mb-3" />
              Aucune réservation pour l&apos;instant.
            </div>
          ) : (
            <BookingsAdminTable bookings={sortedBookings} slots={slots} />
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border border-gray-200 rounded-lg px-4 py-2 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}
