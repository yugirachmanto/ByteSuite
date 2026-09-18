import Papa from 'papaparse'

/**
 * CSV parser — delegates to PapaParse for correct quoted-comma handling
 * (a hand-rolled regex here previously broke on any row combining an
 * unquoted multi-word field with a properly-quoted field containing a
 * comma, e.g. `Kecap Ikan,"Sauce, Syrup & Condiment"`). Header names are
 * lowercased/trimmed to match this file's existing lookup convention
 * (`r.category`, `r.coa_code`, etc.).
 */
export function parseCSV(text: string) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true })
  return (result.data as Record<string, string>[]).map((row) => {
    const obj: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      obj[key.trim().toLowerCase()] = typeof value === 'string' ? value.trim() : value
    }
    return obj
  })
}

export function generateItemTemplate() {
  const headers = ['code', 'name', 'category', 'unit', 'purchase_unit', 'conversion_factor', 'reorder_level', 'coa_code', 'is_inventory']
  const example = ['RAW-001', 'Fillet Paha Ayam', 'raw', 'GR', 'KG', '1000', '500', '1100-001', 'true']

  return [headers.join(','), example.join(',')].join('\n')
}
