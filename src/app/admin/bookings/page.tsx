import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import { Calendar, Mail } from 'lucide-react'
import type { Booking, BookingSlot } from '@/lib/types'

const DAY_LABEL: Record<string, string> = {
  '2026-09-28': 'Lundi 28 septembre',
  '2026-09-29': 'Mardi 29 septembre',
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default async function AdminBookingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const [slotsRes, bookingsRes] = await Promise.all([
    supabase.from('booking_slots').select('*'),
    supabase.from('bookings').select('*').order('created_at', { ascending: false }),
  ])
  const slots = (slotsRes.data || []) as BookingSlot[]
  const bookings = (bookingsRes.data || []) as Booking[]
  const slotById = new Map(slots.map(s => [s.id, s]))

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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Créneau</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Startup</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Personne</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Réservé le</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => {
                  const slot = slotById.get(b.slot_id)
                  return (
                    <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {slot ? (
                          <div>
                            <div className="font-medium">{DAY_LABEL[slot.day] || slot.day}</div>
                            <div className="text-xs text-gray-500">{slot.start_time} – {slot.end_time}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{b.startup_name}</td>
                      <td className="px-4 py-3 text-gray-700">{b.first_name} {b.last_name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <a href={`mailto:${b.email}`} className="inline-flex items-center gap-1 hover:text-blue-700">
                          <Mail size={12} />
                          {b.email}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDateTime(b.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
