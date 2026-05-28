import fs from 'fs'
const page = fs.readFileSync('src/app/(dashboard)/invoices/[id]/review/page.tsx', 'utf8')
const lines = page.split('\n')
const coaIndex = lines.findIndex(l => l.includes('chart_of_accounts'))
if (coaIndex > -1) {
  console.log(lines.slice(Math.max(0, coaIndex - 5), coaIndex + 5).join('\n'))
}
