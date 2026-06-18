'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import type { EmailTemplate } from '@/lib/types'
import SendTemplateModal from './SendTemplateModal'

interface Props {
  juror: { id: string; first_name: string; last_name: string; email: string; role?: string | null }
  templates: EmailTemplate[]
  fromAddresses: string[]
}

export default function JurorSendEmailButton({ juror, templates, fromAddresses }: Props) {
  const [open, setOpen] = useState(false)
  if (!juror.email) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-600"
      >
        <Send size={14} /> Envoyer un email
      </button>
      {open && (
        <SendTemplateModal
          target={{
            kind: 'juror',
            jurorId: juror.id,
            firstName: juror.first_name,
            lastName: juror.last_name,
            email: juror.email,
            role: juror.role || '',
          }}
          templates={templates}
          fromAddresses={fromAddresses}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
