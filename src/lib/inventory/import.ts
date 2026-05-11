
/**
 * Simple CSV parser that handles quotes and commas
 */
export function parseCSV(text: string) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  if (lines.length === 0) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const result = []

  for (let i = 1; i < lines.length; i++) {
    const obj: any = {}
    // Basic regex to handle commas inside quotes
    const currentLine = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || []
    
    // Fallback to simple split if regex fails or mismatch
    const values = currentLine.length === headers.length 
      ? currentLine.map(v => v.replace(/^"|"$/g, '').trim())
      : lines[i].split(',').map(v => v.trim())

    headers.forEach((header, index) => {
      obj[header] = values[index] || ''
    })
    result.push(obj)
  }
  return result
}

export function generateItemTemplate() {
  const headers = ['code', 'name', 'category', 'unit', 'purchase_unit', 'conversion_factor', 'reorder_level', 'coa_code']
  const example = ['RAW-001', 'Fillet Paha Ayam', 'raw', 'GR', 'KG', '1000', '500', '1100-001']
  
  return [headers.join(','), example.join(',')].join('\n')
}
