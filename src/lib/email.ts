import nodemailer from 'nodemailer'
import { createServiceRoleClient } from '@/lib/supabase/server'

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'ssl0.ovh.net',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'CEED Morocco <noreply@ceedflow.com>'

export async function sendAdminNotification(data: {
  startupName: string
  stage: string
  sector: string
  applicationId: string
}) {
  const supabase = await createServiceRoleClient()
  const { data: usersData } = await supabase.auth.admin.listUsers()
  const adminEmails = usersData?.users?.map(u => u.email).filter(Boolean) as string[] || []

  if (adminEmails.length === 0) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  await getTransporter().sendMail({
    from: FROM_EMAIL,
    to: adminEmails.join(', '),
    subject: `New startup application: ${data.startupName}`,
    html: `
      <h2>New startup application received</h2>
      <p><strong>Startup:</strong> ${data.startupName}</p>
      <p><strong>Stage:</strong> ${data.stage}</p>
      <p><strong>Sector:</strong> ${data.sector}</p>
      <br/>
      <p><a href="${appUrl}/admin/applications/${data.applicationId}">Review application</a></p>
    `,
  })
}

export async function sendApplicantConfirmation(email: string, startupName: string) {
  await getTransporter().sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: 'Application received – CEED Morocco',
    html: `
      <h2>Application received</h2>
      <p>Thank you for submitting <strong>${startupName}</strong> to our startup program.</p>
      <p>Your application has been received and will be reviewed by our team.</p>
      <p>We will contact you if your project is selected for the next stage.</p>
    `,
  })
}
