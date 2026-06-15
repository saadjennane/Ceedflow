import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createServiceRoleClient()

  // Find the send by token to identify the application
  const { data: send } = await supabase
    .from('email_sends')
    .select('application_id, recipient_email')
    .eq('tracking_token', token)
    .maybeSingle()

  let success = false
  let email: string | null = null

  if (send) {
    email = send.recipient_email
    if (send.application_id) {
      await supabase
        .from('applications')
        .update({ do_not_contact: true, unsubscribed_at: new Date().toISOString() })
        .eq('id', send.application_id)
      success = true
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 mx-auto mb-4 flex items-center justify-center text-emerald-600 text-3xl">
          {success ? '✓' : '?'}
        </div>
        {success ? (
          <>
            <h1 className="text-2xl font-bold mb-2">Désinscription confirmée</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              {email ? <>L&apos;adresse <strong>{email}</strong> ne recevra plus d&apos;emails de notre part.</> : 'Vous ne recevrez plus d\'emails de notre part.'}
            </p>
            <p className="text-gray-500 text-xs mt-4">
              Si c&apos;est une erreur, contactez-nous à{' '}
              <a href="mailto:info@ceed-morocco.org" className="text-emerald-600 hover:underline">info@ceed-morocco.org</a>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">Lien invalide</h1>
            <p className="text-gray-600 text-sm">
              Ce lien de désinscription n&apos;est pas reconnu. Il a peut-être expiré ou été utilisé.
            </p>
            <p className="text-gray-500 text-xs mt-4">
              Si vous souhaitez vous désinscrire, contactez-nous à{' '}
              <a href="mailto:info@ceed-morocco.org" className="text-emerald-600 hover:underline">info@ceed-morocco.org</a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
