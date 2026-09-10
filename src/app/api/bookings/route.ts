import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { buildTransactionalHtml, buildTransactionalText } from '@/lib/email-templates'
import { BOOKING_DEADLINE } from '@/lib/config'
import { DEFAULT_FROM_EMAIL } from '@/lib/email'
import type { BookingSlot } from '@/lib/types'

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'ssl0.ovh.net',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

const DAY_LABEL: Record<string, string> = {
  '2026-09-28': 'lundi 28 septembre 2026',
  '2026-09-29': 'mardi 29 septembre 2026',
}

/**
 * POST /api/bookings
 * Body: { slot_id, startup_name, first_name, last_name, email }
 *
 * Reserves a slot for a candidate. Enforces the booking deadline, uniqueness
 * on both slot_id and email (one slot per person, one person per slot), and
 * sends a confirmation email using the same OVH SMTP as the rest of the app.
 */
export async function POST(request: NextRequest) {
  // 1) Deadline gate
  if (Date.now() > new Date(BOOKING_DEADLINE).getTime()) {
    return NextResponse.json({ error: 'Les réservations sont clôturées.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })

  const slot_id = typeof body.slot_id === 'string' ? body.slot_id : ''
  const startup_name = (body.startup_name || '').trim()
  const first_name = (body.first_name || '').trim()
  const last_name = (body.last_name || '').trim()
  const email = (body.email || '').trim().toLowerCase()

  if (!slot_id || !startup_name || !first_name || !last_name || !email) {
    return NextResponse.json({ error: 'Tous les champs sont requis.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // 2) Validate slot exists
  const { data: slot } = await supabase
    .from('booking_slots')
    .select('*')
    .eq('id', slot_id)
    .maybeSingle<BookingSlot>()
  if (!slot) return NextResponse.json({ error: 'Créneau introuvable.' }, { status: 404 })

  // 3) Insert booking. UNIQUE(slot_id) + UNIQUE(email) enforce single-booking
  // atomically — Postgres returns 23505 if either constraint is violated.
  const { error: insertErr } = await supabase.from('bookings').insert({
    slot_id,
    startup_name,
    first_name,
    last_name,
    email,
  })

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Constraint hit: figure out which one so we return an actionable message.
      const [{ data: takenSlot }, { data: takenEmail }] = await Promise.all([
        supabase.from('bookings').select('id').eq('slot_id', slot_id).maybeSingle(),
        supabase.from('bookings').select('id').eq('email', email).maybeSingle(),
      ])
      if (takenSlot) return NextResponse.json({ error: 'Ce créneau vient d\'être pris. Merci d\'en choisir un autre.' }, { status: 409 })
      if (takenEmail) return NextResponse.json({ error: 'Cette adresse email a déjà réservé un créneau.' }, { status: 409 })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // 4) Send confirmation email — best-effort, don't fail the booking if SMTP hiccups.
  const dayLabel = DAY_LABEL[slot.day] || slot.day
  const rawBody = `Bonjour ${first_name},

Votre créneau est confirmé.

**Date :** ${dayLabel}
**Horaire :** ${slot.start_time} – ${slot.end_time} (heure Maroc)
**Startup :** ${startup_name}

Si vous devez modifier ou annuler ce rendez-vous, contactez-nous à info@ceed-morocco.org.

À bientôt,
L'équipe The Builders by CEED`

  try {
    await getTransporter().sendMail({
      from: DEFAULT_FROM_EMAIL,
      to: email,
      subject: `Confirmation de votre créneau — ${dayLabel} ${slot.start_time}`,
      html: buildTransactionalHtml(rawBody, {}),
      text: buildTransactionalText(rawBody, {}),
    })
  } catch (e) {
    console.error('bookings: confirmation email failed', e)
  }

  return NextResponse.json({
    ok: true,
    slot: {
      id: slot.id,
      day: slot.day,
      dayLabel,
      start_time: slot.start_time,
      end_time: slot.end_time,
    },
  })
}
