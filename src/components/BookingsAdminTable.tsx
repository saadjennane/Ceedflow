'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Trash2, Loader2 } from 'lucide-react'
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

export default function BookingsAdminTable({
  bookings,
  slots,
}: {
  bookings: Booking[]
  slots: BookingSlot[]
}) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const slotById = new Map(slots.map(s => [s.id, s]))

  const remove = async (b: Booking) => {
    const slot = slotById.get(b.slot_id)
    const slotLabel = slot ? `${DAY_LABEL[slot.day] || slot.day} · ${slot.start_time}` : 'ce créneau'
    if (!confirm(`Libérer ce créneau ?\n\n${b.startup_name} — ${b.first_name} ${b.last_name}\n${slotLabel}`)) return
    setDeletingId(b.id)
    const res = await fetch(`/api/admin/bookings/${b.id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Échec de la suppression')
      return
    }
    router.refresh()
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        Aucune réservation pour l&apos;instant.
      </div>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Créneau</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Startup</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Personne</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Réservé le</th>
          <th className="px-4 py-3 w-10"></th>
        </tr>
      </thead>
      <tbody>
        {bookings.map(b => {
          const slot = slotById.get(b.slot_id)
          const isDeleting = deletingId === b.id
          return (
            <tr key={b.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isDeleting ? 'opacity-40' : ''}`}>
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
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => remove(b)}
                  disabled={isDeleting}
                  className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                  title="Libérer ce créneau (supprime la réservation)"
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
