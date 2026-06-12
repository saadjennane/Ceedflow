/**
 * Inspect scrape state:
 * - Find name duplicates in DB
 * - Print the last sync run's error_log
 * - Find IDs that were errored/skipped from the log file
 *
 * Run: npx tsx scripts/check-and-recover.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'

config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log('=== DB count ===')
  const { count } = await supa.from('external_startups').select('*', { count: 'exact', head: true })
  console.log(`Total startups: ${count}`)

  console.log('\n=== Last sync run ===')
  const { data: lastRun } = await supa
    .from('external_startups_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single()
  console.log(`Status: ${lastRun?.status}`)
  console.log(`Pages: ${lastRun?.pages_scanned}`)
  console.log(`Seen: ${lastRun?.startups_seen} · Inserted: ${lastRun?.startups_inserted} · Updated: ${lastRun?.startups_updated} · Errors: ${lastRun?.errors}`)
  if (lastRun?.error_log) {
    console.log('\nError log:')
    console.log(lastRun.error_log)
  }

  console.log('\n=== Name duplicates ===')
  // Fetch all in batches
  const all: { id: string; external_id: string; name: string }[] = []
  let from = 0
  const BATCH = 1000
  while (true) {
    const { data } = await supa
      .from('external_startups')
      .select('id, external_id, name')
      .range(from, from + BATCH - 1)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < BATCH) break
    from += BATCH
  }
  console.log(`Loaded ${all.length} startups`)

  const byName: Record<string, { id: string; external_id: string }[]> = {}
  for (const s of all) {
    const key = (s.name || '').trim().toLowerCase()
    if (!key) continue
    if (!byName[key]) byName[key] = []
    byName[key].push({ id: s.id, external_id: s.external_id })
  }
  const dupes = Object.entries(byName).filter(([, arr]) => arr.length > 1)
  console.log(`Name duplicates: ${dupes.length}`)
  for (const [name, arr] of dupes.slice(0, 20)) {
    console.log(`  "${name}" → ${arr.length}x: ${arr.map(a => a.external_id).join(', ')}`)
  }

  console.log('\n=== Errored / failed IDs from log ===')
  const logPath = '/tmp/scrape-thepulse-full.log'
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, 'utf8').split('\n')
    const errored: string[] = []
    for (const line of lines) {
      // matches: "    error on 1234: HTTP 404 for ..."
      const m = line.match(/error on (\d+):/i)
      if (m) errored.push(m[1])
    }
    const uniq = Array.from(new Set(errored))
    console.log(`Errored IDs (${uniq.length}): ${uniq.join(', ')}`)
  } else {
    console.log('No log file at /tmp/scrape-thepulse-full.log')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
