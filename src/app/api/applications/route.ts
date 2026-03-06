import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendAdminNotification, sendApplicantConfirmation } from '@/lib/email'
import type { ApplicationFormData } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const data: ApplicationFormData = await request.json()
    const supabase = await createServiceRoleClient()

    // Insert application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert({
        startup_name: data.startup_name,
        creation_date: data.creation_date,
        website: data.website,
        linkedin_page: data.linkedin_page,
        logo_url: data.logo_url,
        sector: data.sector,
        source: data.source,
        description: data.description,
        customers: data.customers,
        business_model: data.business_model,
        business_model_type: data.business_model_type,
        stage: data.stage,
        revenue_last_12_months: data.revenue_last_12_months,
        projected_revenue_next_12_months: data.projected_revenue_next_12_months,
        employees: data.employees,
        users_or_customers: data.users_or_customers,
        raised_funds: data.raised_funds,
        funds_amount: data.funds_amount,
        fundraising_plan: data.fundraising_plan,
        patent_status: data.patent_status,
        total_investment: data.total_investment,
        status: 'New',
        priority: 'Normal',
      })
      .select('id')
      .single()

    if (appError) {
      console.error('Application insert error:', appError)
      return NextResponse.json({ error: appError.message }, { status: 500 })
    }

    // Insert founders
    const foundersData = data.founders.map((f) => ({
      application_id: application.id,
      full_name: f.full_name,
      email: f.email,
      phone: f.phone,
      role: f.role,
      linkedin: f.linkedin || null,
      is_primary: f.is_primary,
    }))

    const { error: foundersError } = await supabase.from('founders').insert(foundersData)
    if (foundersError) {
      console.error('Founders insert error:', foundersError)
    }

    // Send emails (non-blocking)
    const primaryEmail = data.founders[0]?.email
    try {
      await Promise.all([
        sendAdminNotification({
          startupName: data.startup_name,
          stage: data.stage,
          sector: data.sector,
          applicationId: application.id,
        }),
        primaryEmail ? sendApplicantConfirmation(primaryEmail, data.startup_name) : Promise.resolve(),
      ])
    } catch (emailErr) {
      console.error('Email error (non-fatal):', emailErr)
    }

    return NextResponse.json({ applicationId: application.id })
  } catch (err) {
    console.error('Submission error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
