import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  fetchFilteredApplications,
  pickPrimaryFounder,
  readFiltersFromParams,
} from '@/lib/application-filters'

/**
 * GET /api/applications/export
 * Streams an .xlsx file matching the same filters as the admin list (status,
 * sector, stage, priority, search, min rating, tags). Columns are kept tight
 * per user spec: startup name, status, primary founder name / email / phone.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filters = readFiltersFromParams(request.nextUrl.searchParams)
  const rows = await fetchFilteredApplications(supabase, filters)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'The Builders by CEED'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Candidatures')

  sheet.columns = [
    { header: 'Startup', key: 'startup', width: 32 },
    { header: 'Statut', key: 'status', width: 18 },
    { header: 'Fondateur principal', key: 'founderName', width: 28 },
    { header: 'Email', key: 'founderEmail', width: 34 },
    { header: 'Téléphone', key: 'founderPhone', width: 20 },
  ]

  // Style the header row: bold, subtle background, freeze it.
  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  header.alignment = { vertical: 'middle', horizontal: 'left' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const app of rows) {
    const primary = pickPrimaryFounder(app)
    sheet.addRow({
      startup: app.startup_name || '',
      status: app.status || '',
      founderName: primary?.full_name || '',
      founderEmail: primary?.email || '',
      founderPhone: primary?.phone || '',
    })
  }

  // Add a light bottom border to every data row for readability.
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    row.eachCell(cell => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
      cell.alignment = { vertical: 'middle' }
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `candidatures_${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
