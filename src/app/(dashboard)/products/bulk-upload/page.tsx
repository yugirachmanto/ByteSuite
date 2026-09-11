'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Upload, Download, Loader2, Save, FileSpreadsheet, Trash2, ArrowLeft } from 'lucide-react'
import { formatRp } from '@/lib/format'
import { toast } from 'sonner'
import Papa from 'papaparse'

interface ParsedRow {
  name: string
  code: string
  unit: string
  pos_category: string
  selling_price: number | null
  valid: boolean
  error?: string
  possibleDuplicate: boolean
}

export default function BulkUploadProductsPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [data, setData] = useState<ParsedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function fetchExistingNames() {
      const { data: items } = await supabase
        .from('item_master')
        .select('name')

      setExistingNames(new Set((items || []).map(i => i.name?.toLowerCase().trim())))
    }
    fetchExistingNames()
  }, [supabase])

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Name,Code,Unit,POS Category,Selling Price\nNasi Goreng Spesial,,PCS,Mains,35000\nEs Teh Manis,,PCS,Beverages,8000"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "bulk_products_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: ParsedRow[] = results.data.map((row: any) => {
          const name = (row['Name'] || row['name'] || '').trim()
          const code = (row['Code'] || row['code'] || '').trim()
          const unit = (row['Unit'] || row['unit'] || '').trim()
          const posCategory = (row['POS Category'] || row['pos_category'] || row['PosCategory'] || '').trim()
          const priceStr = row['Selling Price'] || row['selling_price'] || row['Price']

          let sellingPrice: number | null = null
          let error: string | undefined = undefined

          if (!name) {
            error = 'Missing Name'
          }

          if (priceStr !== undefined && priceStr !== null && String(priceStr).trim() !== '') {
            const parsedPrice = parseFloat(priceStr)
            if (isNaN(parsedPrice) || parsedPrice < 0) {
              error = error || 'Invalid Selling Price'
            } else {
              sellingPrice = parsedPrice
            }
          }

          const possibleDuplicate = !!name && existingNames.has(name.toLowerCase())

          return {
            name,
            code,
            unit,
            pos_category: posCategory,
            selling_price: sellingPrice,
            valid: !error,
            error,
            possibleDuplicate
          }
        })

        setData(parsed)
        setLoading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
      error: (error) => {
        toast.error('Failed to parse CSV: ' + error.message)
        setLoading(false)
      }
    })
  }

  const handleSubmit = async () => {
    if (!selectedOutletId) {
      toast.error('Please select an outlet first')
      return
    }

    const validRows = data.filter(r => r.valid)
    if (validRows.length === 0) {
      toast.error('No valid rows to upload')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/products/bulk-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: selectedOutletId,
          items: validRows.map(r => ({
            name: r.name,
            code: r.code,
            unit: r.unit,
            pos_category: r.pos_category,
            selling_price: r.selling_price
          }))
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload products')
      }

      toast.success(`Successfully created ${result.created_count} products!`)
      setData([])
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during upload')
    } finally {
      setSubmitting(false)
    }
  }

  const validCount = data.filter(r => r.valid).length
  const duplicateCount = data.filter(r => r.valid && r.possibleDuplicate).length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/products">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Bulk Upload Products</h2>
          <p className="text-zinc-400 text-sm">Add multiple menu items at once via CSV.</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" onClick={handleDownloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Template
        </Button>
        <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={() => fileInputRef.current?.click()}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Select CSV File
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv"
          onChange={handleFileUpload}
        />
      </div>

      {loading && (
        <div className="flex h-48 items-center justify-center text-zinc-500 rounded-md border border-zinc-800 bg-zinc-900/50">
          <Loader2 className="h-5 w-5 animate-spin mr-2 opacity-30" />
          Parsing file...
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-300">Preview Summary</p>
              <div className="flex gap-6 mt-1 text-sm">
                <span className="text-zinc-500">Total Rows: <strong className="text-zinc-100">{data.length}</strong></span>
                <span className="text-emerald-500">Valid: <strong>{validCount}</strong></span>
                <span className="text-red-400">Errors: <strong>{data.length - validCount}</strong></span>
                <span className="text-amber-500">Possible Duplicates: <strong>{duplicateCount}</strong></span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="border-zinc-800 text-zinc-400" onClick={() => setData([])}>
                <Trash2 className="h-4 w-4 mr-2" /> Clear
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={validCount === 0 || submitting}
                onClick={handleSubmit}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Upload {validCount} Products
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-900/80">
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Name</TableHead>
                  <TableHead className="text-zinc-400">Code</TableHead>
                  <TableHead className="text-zinc-400">Unit</TableHead>
                  <TableHead className="text-zinc-400">POS Category</TableHead>
                  <TableHead className="text-zinc-400 text-right">Selling Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i} className={`border-zinc-800 ${!row.valid ? 'bg-red-950/10' : row.possibleDuplicate ? 'bg-amber-950/10' : 'hover:bg-zinc-800/30'}`}>
                    <TableCell>
                      {!row.valid ? (
                        <span className="inline-flex items-center rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400" title={row.error}>
                          Error: {row.error}
                        </span>
                      ) : row.possibleDuplicate ? (
                        <span className="inline-flex items-center rounded bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500">
                          Possible Duplicate
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500">
                          Valid
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-100">{row.name}</TableCell>
                    <TableCell className="font-mono text-zinc-300">{row.code || <span className="text-zinc-600 italic">—</span>}</TableCell>
                    <TableCell className="text-zinc-400">{row.unit || <span className="text-zinc-600 italic">PCS (default)</span>}</TableCell>
                    <TableCell className="text-zinc-400">{row.pos_category || <span className="text-zinc-600 italic">—</span>}</TableCell>
                    <TableCell className="text-right text-zinc-100 font-mono">
                      {row.selling_price != null ? formatRp(row.selling_price) : <span className="text-zinc-600 italic text-xs">Not set</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {!loading && data.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-900/30 text-zinc-500">
          <Upload className="mb-4 h-8 w-8 opacity-20" />
          <p className="mb-1 text-sm font-medium">Upload CSV to begin</p>
          <p className="text-xs text-zinc-600">Only Name is required — Code, Unit, POS Category, and Selling Price are optional</p>
        </div>
      )}
    </div>
  )
}
