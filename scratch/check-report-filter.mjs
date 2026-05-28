import fs from 'fs'
const page = fs.readFileSync('src/app/(dashboard)/accounting/reports/page.tsx', 'utf8')
const lines = page.split('\n')
const p = lines.findIndex(l => l.includes('const assets ='))
if (p > -1) {
  console.log(lines.slice(Math.max(0, p - 5), p + 5).join('\n'))
}
