const fs = require('fs')
const page = fs.readFileSync('src/app/(dashboard)/invoices/[id]/review/page.tsx', 'utf8')
const lines = page.split('\n')
const p = lines.findIndex(l => l.includes('const handlePost = async ()'))
if (p > -1) {
  console.log(lines.slice(Math.max(0, p - 5), p + 50).join('\n'))
}
