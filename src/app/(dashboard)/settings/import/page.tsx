'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Upload, Download, Loader2, Save, FileSpreadsheet, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Papa from 'papaparse'

interface ParsedRow {
  item_code: string
  qty: number
  unit_cost: number
  total_value: number
  valid: boolean
  error?: string
}

export default function ImportSettingsPage() {
  const [data, setData] = useState<ParsedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { selectedOutletId } = useOutlet()

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Item Code,Quantity,Unit Cost\nSKU-001,100,15000\nSKU-002,50,25000"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "beginning_inventory_template.csv")
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
        const parsed: ParsedRow[] = results.data.map((row: any, index: number) => {
          const code = row['Item Code'] || row['item_code'] || row['ItemCode']
          const qtyStr = row['Quantity'] || row['qty'] || row['quantity']
          const costStr = row['Unit Cost'] || row['unit_cost'] || row['cost'] || row['Value']

          const qty = parseFloat(qtyStr)
          const cost = parseFloat(costStr)

          const valid = !!code && !isNaN(qty) && !isNaN(cost) && qty > 0 && cost >= 0

          let error = undefined
          if (!code) error = 'Missing Item Code'
          else if (isNaN(qty) || qty <= 0) error = 'Invalid Quantity'
          else if (isNaN(cost) || cost < 0) error = 'Invalid Unit Cost'

          return {
            item_code: code?.trim(),
            qty: isNaN(qty) ? 0 : qty,
            unit_cost: isNaN(cost) ? 0 : cost,
            total_value: (!isNaN(qty) && !isNaN(cost)) ? (qty * cost) : 0,
            valid,
            error
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
      toast.error('No valid rows to import')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/inventory/import-beginning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: selectedOutletId,
          items: validRows
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to import inventory')
      }

      toast.success(`Successfully imported ${result.imported_count} items!`)
      setData([])
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during import')
    } finally {
      setSubmitting(false)
    }
  }

  const validCount = data.filter(r => r.valid).length
  const totalValue = data.reduce((sum, r) => sum + (r.valid ? r.total_value : 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-zinc-100">Import Beginning Inventory</h3>
          <p className="text-sm text-zinc-400">Upload your initial stock quantities and values via CSV.</p>
        </div>
        <div className="flex gap-2">
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
                <span className="text-zinc-500">Total Asset Value: <strong className="text-zinc-100 font-mono">
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalValue)}
                </strong></span>
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
                Import {validCount} Items
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-900/80">
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Item Code</TableHead>
                  <TableHead className="text-zinc-400 text-right">Quantity</TableHead>
                  <TableHead className="text-zinc-400 text-right">Unit Cost</TableHead>
                  <TableHead className="text-zinc-400 text-right">Total Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i} className={`border-zinc-800 ${row.valid ? 'hover:bg-zinc-800/30' : 'bg-red-950/10'}`}>
                    <TableCell>
                      {row.valid ? (
                        <span className="inline-flex items-center rounded bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500">
                          Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400" title={row.error}>
                          Error: {row.error}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-zinc-300">{row.item_code}</TableCell>
                    <TableCell className="text-right text-zinc-300 font-mono">{row.qty.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-zinc-400 font-mono">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(row.unit_cost)}
                    </TableCell>
                    <TableCell className="text-right text-zinc-100 font-mono font-medium">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(row.total_value)}
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
          <p className="text-xs text-zinc-600">Ensure it has Item Code, Quantity, and Unit Cost columns</p>
        </div>
      )}
    </div>
  )
}
