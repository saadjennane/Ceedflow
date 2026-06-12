import { writeFileSync } from 'fs'
async function main() {
  const url = 'https://www.thepulse.ma/startup/1093'
  const html = await fetch(url, { headers: { 'User-Agent': 'TheBridge-CEED-Internal-Bot/1.0 (contact: info@ceed-morocco.org)' } }).then(r => r.text())
  writeFileSync('/tmp/thepulse-startup-1093.html', html)
  console.log('saved', html.length, 'bytes to /tmp/thepulse-startup-1093.html')
}
main()
