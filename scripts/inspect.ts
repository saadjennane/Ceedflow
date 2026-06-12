import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await supa
    .from('external_startups')
    .select('name, sectors, stage, status, city, country, founding_year, total_funding, latest_round, lead_investor, other_investors, founders, website, linkedin, notable_clients, employee_count')
    .limit(5)
  if (error) {
    console.error(error)
    process.exit(1)
  }
  console.log(JSON.stringify(data, null, 2))
}

main()
