'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  ArrowLeft, 
  Upload, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  ArrowRight,
  Database,
  Calculator,
  ExternalLink,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  RefreshCw,
  Layers
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatRp } from '@/lib/format'

interface ParsedRow {
  product_name: string
  category: string
  quantity: number
  unit_price: number
  net_amount: number
  payment_method: string
  discount_amount: number
  tax_amount: number
  cogs_per_unit: number
  isValid: boolean
  error?: string
}

interface ValidationResponse {
  is_valid: boolean
  unmapped_categories: string[]
  unmapped_payments: string[]
  unmapped_ppn_keluaran: string[]
}

interface PreviewJournalRow {
  side: 'debit' | 'credit'
  coa_id: string
  coa_code: string
  coa_name: string
  debit: number
  credit: number
  description: string
}

const FIELD_SPECS = [
  { key: 'product_name', label: 'Product Name', required: true, aliases: ['product', 'item', 'nama produk', 'nama_produk', 'name'] },
  { key: 'category', label: 'Category', required: true, aliases: ['kategori', 'category', 'product_category', 'product-category', 'kategori produk'] },
  { key: 'quantity', label: 'Quantity', required: true, aliases: ['quantity', 'qty', 'jumlah', 'pax', 'volume'] },
  { key: 'unit_price', label: 'Unit Price', required: true, aliases: ['price', 'harga', 'unit price', 'unit_price', 'harga satuan'] },
  { key: 'net_amount', label: 'Net Amount', required: true, aliases: ['amount', 'net amount', 'net_amount', 'total', 'grand total', 'grand_total', 'netto'] },
  { key: 'payment_method', label: 'Payment Method', required: true, aliases: ['payment', 'payment method', 'payment_method', 'pembayaran', 'cara bayar', 'metode pembayaran'] },
  { key: 'discount_amount', label: 'Discount Amount', required: false, aliases: ['discount', 'discount amount', 'discount_amount', 'potongan', 'diskon'] },
  { key: 'tax_amount', label: 'Tax Amount', required: false, aliases: ['tax', 'tax amount', 'tax_amount', 'ppn', 'pajak'] },
  { key: 'cogs_per_unit', label: 'COGS per Unit', required: false, aliases: ['cogs', 'cogs per unit', 'cogs_per_unit', 'hpp', 'hpp satuan', 'cost'] }
]

export default function ImportPosSalesPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [orgId, setOrgId] = useState<string | null>(null)
  
  // Importer Steps: 'upload' | 'mapping' | 'preview' | 'validation' | 'journal'
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'validation' | 'journal'>('upload')
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  
  // CSV Raw Parsing State
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({}) // Target -> CSV Header
  
  // Final Parsed Records
  const [parsedRecords, setParsedRecords] = useState<ParsedRow[]>([])
  
  // Import Batch State
  const [importDate, setImportDate] = useState('')
  const [shift, setShift] = useState<string>('')
  const [importId, setImportId] = useState<string | null>(null)
  
  // Verification & Posting State
  const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null)
  const [journalPreview, setJournalPreview] = useState<PreviewJournalRow[]>([])
  const [posting, setPosting] = useState(false)

  // Resolve Org ID
  useEffect(() => {
    async function getOrg() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      if (profile) setOrgId(profile.org_id)
    }
    getOrg()
  }, [supabase])

  // Helper to robustly parse a CSV line (handling double quotes)
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const handleDownloadTemplate = () => {
    const csvContent = "product_name,category,quantity,unit_price,net_amount,payment_method,discount_amount,tax_amount,cogs_per_unit,date\n" +
      "Nasi Goreng Special,Makanan,2,50000,99000,Cash,10000,9000,20000,2026-05-22\n" +
      "Es Teh Manis,Minuman,3,15000,49500,GoPay,0,4500,0,2026-05-22\n" +
      "Kopi Latte,Minuman,1,30000,33000,OVO,0,3000,10000,2026-05-22"
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", "pos_sales_import_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Handle Initial File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setLoading(true)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string
        const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
        
        if (lines.length < 2) {
          throw new Error('CSV file is empty or missing data rows.')
        }

        // Parse Headers
        const headers = parseCSVLine(lines[0])
        setCsvHeaders(headers)

        // Parse Data Rows
        const rows: string[][] = []
        for (let i = 1; i < lines.length; i++) {
          const rowParts = parseCSVLine(lines[i])
          // Skip empty or mismatching rows
          if (rowParts.length === headers.length && rowParts.some(p => p !== '')) {
            rows.push(rowParts)
          }
        }
        setCsvRows(rows)

        // Automatic mapping detection based on aliases (robust match by cleansing keys, labels, aliases and CSV headers)
        const initialMap: Record<string, string> = {}
        FIELD_SPECS.forEach(spec => {
          const matchedHeader = headers.find(h => {
            const cleanH = h.toLowerCase().replace(/[\s_-]/g, '')
            const cleanKey = spec.key.toLowerCase().replace(/[\s_-]/g, '')
            const cleanLabel = spec.label.toLowerCase().replace(/[\s_-]/g, '')
            
            if (cleanH === cleanKey || cleanH === cleanLabel) return true
            
            return spec.aliases.some(alias => alias.toLowerCase().replace(/[\s_-]/g, '') === cleanH)
          })
          if (matchedHeader) {
            initialMap[spec.key] = matchedHeader
          }
        })
        setHeaderMap(initialMap)

        // Transition to mapping confirmation step
        setStep('mapping')
      } catch (err: any) {
        toast.error(err.message || 'Failed to parse CSV file')
        setFileName('')
      } finally {
        setLoading(false)
      }
    }
    reader.readAsText(file)
  }

  // Confirm Column Mapping and Parse Rows
  const handleConfirmMapping = () => {
    // Check if all required fields are mapped
    const missing = FIELD_SPECS.filter(spec => spec.required && !headerMap[spec.key])
    if (missing.length > 0) {
      toast.error(`Please map all required columns: ${missing.map(m => m.label).join(', ')}`)
      return
    }

    setLoading(true)
    try {
      const targetIndices: Record<string, number> = {}
      Object.entries(headerMap).forEach(([key, csvHeader]) => {
        targetIndices[key] = csvHeaders.indexOf(csvHeader)
      })

      // Try to find Date column index in raw CSV headers if present
      const dateHeader = csvHeaders.find(h => ['date', 'tanggal', 'created_at', 'time', 'waktu'].includes(h.toLowerCase()))
      const dateIndex = dateHeader ? csvHeaders.indexOf(dateHeader) : -1

      const records: ParsedRow[] = []
      let detectedDate = ''

      csvRows.forEach((row, idx) => {
        const product_name = row[targetIndices['product_name']]
        const category = row[targetIndices['category']]
        const quantity = parseFloat(row[targetIndices['quantity']])
        const unit_price = parseFloat(row[targetIndices['unit_price']])
        const net_amount = parseFloat(row[targetIndices['net_amount']])
        const payment_method = row[targetIndices['payment_method']]

        const discount_amount = targetIndices['discount_amount'] !== undefined ? parseFloat(row[targetIndices['discount_amount']]) || 0 : 0
        const tax_amount = targetIndices['tax_amount'] !== undefined ? parseFloat(row[targetIndices['tax_amount']]) || 0 : 0
        const cogs_per_unit = targetIndices['cogs_per_unit'] !== undefined ? parseFloat(row[targetIndices['cogs_per_unit']]) || 0 : 0

        // Track date if found
        if (dateIndex !== -1 && row[dateIndex] && !detectedDate) {
          detectedDate = row[dateIndex].split(' ')[0] // Extract date part only
        }

        let isValid = true
        let error = ''

        if (!product_name) {
          isValid = false
          error = 'Product name is empty'
        } else if (!category) {
          isValid = false
          error = 'Category is empty'
        } else if (isNaN(quantity) || quantity <= 0) {
          isValid = false
          error = 'Quantity must be positive'
        } else if (isNaN(unit_price) || unit_price < 0) {
          isValid = false
          error = 'Unit price must be positive'
        } else if (isNaN(net_amount) || net_amount < 0) {
          isValid = false
          error = 'Net amount must be positive'
        } else if (!payment_method) {
          isValid = false
          error = 'Payment method is empty'
        }

        records.push({
          product_name,
          category,
          quantity,
          unit_price,
          net_amount,
          payment_method,
          discount_amount,
          tax_amount,
          cogs_per_unit,
          isValid,
          error
        })
      })

      setParsedRecords(records)
      
      // Default to detected date, or today's date formatted as YYYY-MM-DD
      const dateDefault = detectedDate && !isNaN(Date.parse(detectedDate)) 
        ? detectedDate 
        : new Date().toISOString().split('T')[0]
      setImportDate(dateDefault)

      setStep('preview')
    } catch (err: any) {
      toast.error('Data parsing failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Upload Draft to DB & Run validate_pos_import()
  const handleUploadAndValidate = async () => {
    if (!selectedOutletId) {
      toast.error('No outlet selected. Please select an active outlet first.')
      return
    }
    if (!importDate) {
      toast.error('Please specify the POS Sales Date.')
      return
    }
    if (!orgId) {
      toast.error('Auth Profile not resolved. Please refresh.')
      return
    }

    const invalid = parsedRecords.some(r => !r.isValid)
    if (invalid) {
      toast.error('Please resolve validation errors in the preview list first')
      return
    }

    setLoading(true)
    let createdImportId: string | null = null

    try {
      // 1. Insert header
      const { data: header, error: headerErr } = await supabase
        .from('pos_imports')
        .insert({
          org_id: orgId,
          outlet_id: selectedOutletId,
          import_date: importDate,
          shift: shift || null,
          source_file: fileName,
          status: 'draft'
        })
        .select()
        .single()

      if (headerErr) throw headerErr
      createdImportId = header.id
      setImportId(createdImportId)

      // 2. Insert lines
      const lineData = parsedRecords.map(r => ({
        import_id: createdImportId,
        org_id: orgId,
        outlet_id: selectedOutletId,
        product_name: r.product_name,
        pos_category: r.category,
        quantity: r.quantity,
        unit_price: r.unit_price,
        subtotal: r.quantity * r.unit_price,
        discount_amount: r.discount_amount,
        tax_amount: r.tax_amount,
        net_amount: r.net_amount,
        payment_method: r.payment_method,
        cogs_per_unit: r.cogs_per_unit,
        cogs_total: r.quantity * r.cogs_per_unit
      }))

      const { error: linesErr } = await supabase
        .from('pos_import_lines')
        .insert(lineData)

      if (linesErr) throw linesErr

      // 3. Call validate_pos_import RPC
      const { data: valData, error: valErr } = await supabase
        .rpc('validate_pos_import', { p_import_id: createdImportId })

      if (valErr) throw valErr

      const res = valData as ValidationResponse
      setValidationResult(res)

      if (res.is_valid) {
        // Automatically fetch journal preview if perfectly valid
        const { data: previewData, error: previewErr } = await supabase
          .rpc('preview_pos_journal', { p_import_id: createdImportId })

        if (previewErr) throw previewErr
        setJournalPreview((previewData || []) as PreviewJournalRow[])
        setStep('journal')
        toast.success('Sales data successfully validated! Previewing journal entry.')
      } else {
        setStep('validation')
        toast.warning('Mappings missing. Mappings must be updated before posting.')
      }
    } catch (err: any) {
      toast.error('Import process failed: ' + err.message)
      // Cleanup Draft on Failure
      if (createdImportId) {
        await supabase.from('pos_imports').delete().eq('id', createdImportId)
        setImportId(null)
      }
    } finally {
      setLoading(false)
    }
  }

  // Delete Draft on Validation Fail & Restart
  const handleCancelDraft = async () => {
    if (!importId) return
    setLoading(true)
    try {
      await supabase.from('pos_imports').delete().eq('id', importId)
      toast.info('Draft import discarded successfully')
      setImportId(null)
      setValidationResult(null)
      setJournalPreview([])
      setStep('preview')
    } catch (err: any) {
      toast.error('Failed to clear draft: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Post Draft to Ledger via post_pos_import()
  const handlePostGL = async () => {
    if (!importId) return
    setPosting(true)
    try {
      const { error } = await supabase.rpc('post_pos_import', { p_import_id: importId })
      if (error) throw error

      toast.success('Journal Posted Successfully! Double entries recorded in GL.')
      router.push('/accounting/journal')
    } catch (err: any) {
      toast.error('Posting to GL Failed: ' + err.message)
    } finally {
      setPosting(false)
    }
  }

  // Reset State and Go Back to Upload
  const handleReset = () => {
    setStep('upload')
    setFileName('')
    setCsvHeaders([])
    setCsvRows([])
    setHeaderMap({})
    setParsedRecords([])
    setImportId(null)
    setValidationResult(null)
    setJournalPreview([])
  }

  // Aggregate Figures for UI Summary
  const totalQuantity = parsedRecords.reduce((sum, r) => sum + r.quantity, 0)
  const totalGrossRevenue = parsedRecords.reduce((sum, r) => sum + (r.quantity * r.unit_price), 0)
  const totalDiscount = parsedRecords.reduce((sum, r) => sum + r.discount_amount, 0)
  const totalTax = parsedRecords.reduce((sum, r) => sum + r.tax_amount, 0)
  const totalNetRevenue = parsedRecords.reduce((sum, r) => sum + r.net_amount, 0)
  const totalCogs = parsedRecords.reduce((sum, r) => sum + (r.quantity * r.cogs_per_unit), 0)

  const debitSum = journalPreview.reduce((sum, row) => sum + row.debit, 0)
  const creditSum = journalPreview.reduce((sum, row) => sum + row.credit, 0)
  const outletName = outlets.find(o => o.id === selectedOutletId)?.name

  return (
    <div className="-m-8 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-zinc-950 text-zinc-200">
      
      {/* ── TOP BAR ── */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/60 px-6 bg-zinc-900/30">
        <div className="flex items-center gap-3">
          {step === 'upload' ? (
            <Link href="/accounting/journal">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-zinc-100">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-zinc-100" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">POS Sales CSV Importer</span>
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700 font-mono">
              Step: {step.toUpperCase()}
            </span>
          </div>
        </div>

        {outletName && (
          <span className="rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300">
            {outletName}
          </span>
        )}
      </div>

      {/* ── FLOW PROCESS STEPS CHEVRONS ── */}
      <div className="flex shrink-0 items-center border-b border-zinc-800/50 bg-zinc-950 text-[10px] uppercase font-bold tracking-wider text-zinc-650 h-8 px-6 gap-4">
        <div className={`flex items-center gap-1.5 ${step === 'upload' ? 'text-zinc-100' : 'text-zinc-500'}`}>
          <Upload className="h-3 w-3" /> Upload
        </div>
        <ArrowRight className="h-2.5 w-2.5 text-zinc-800" />
        <div className={`flex items-center gap-1.5 ${step === 'mapping' ? 'text-zinc-100' : 'text-zinc-500'}`}>
          <Layers className="h-3 w-3" /> Column Map
        </div>
        <ArrowRight className="h-2.5 w-2.5 text-zinc-800" />
        <div className={`flex items-center gap-1.5 ${step === 'preview' ? 'text-zinc-100' : 'text-zinc-500'}`}>
          <FileText className="h-3 w-3" /> Preview Sheet
        </div>
        <ArrowRight className="h-2.5 w-2.5 text-zinc-800" />
        <div className={`flex items-center gap-1.5 ${step === 'validation' ? 'text-amber-400' : 'text-zinc-500'}`}>
          <Database className="h-3 w-3" /> Map Verification
        </div>
        <ArrowRight className="h-2.5 w-2.5 text-zinc-800" />
        <div className={`flex items-center gap-1.5 ${step === 'journal' ? 'text-emerald-400' : 'text-zinc-500'}`}>
          <Calculator className="h-3 w-3" /> Posting Preview
        </div>
      </div>

      {/* ── MAIN WORKSPACE BODY ── */}
      <div className="flex-1 overflow-hidden p-6 bg-zinc-950">

        {/* 1. UPLOAD CSV FILE STEP */}
        {step === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full items-start">
            <div className="lg:col-span-2 h-full flex flex-col justify-center max-h-[480px]">
              <label
                htmlFor="pos-csv-file"
                className="group relative flex h-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/10 hover:bg-zinc-900/20 hover:border-zinc-700 transition-all duration-300"
              >
                <div className="absolute inset-4 rounded-lg border border-dashed border-zinc-800/80 group-hover:border-zinc-700/80 transition-colors" />
                <div className="relative flex flex-col items-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-500 group-hover:text-zinc-200 border border-zinc-850 group-hover:scale-105 transition-all">
                    {loading ? <Loader2 className="h-7 w-7 animate-spin text-zinc-400" /> : <Upload className="h-7 w-7" />}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-zinc-200">Import POS Sales Sheet</h3>
                    <p className="mt-1.5 text-xs text-zinc-500 max-w-sm">Drop your daily POS sales summary (.csv) sheet or click here to browse your folders.</p>
                  </div>
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-850 bg-zinc-900 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-150 transition">
                    Browse Local File
                  </span>
                </div>
                <input 
                  id="pos-csv-file" 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={handleFileChange} 
                  disabled={loading}
                />
              </label>
            </div>

            <div className="flex flex-col gap-4">
              <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Download Template</CardTitle>
                  <CardDescription className="text-zinc-500">Need the correct column structure? Download our standard format sheet.</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <Button 
                    onClick={handleDownloadTemplate} 
                    className="w-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 flex justify-center items-center gap-2"
                  >
                    <Download className="h-4 w-4" /> Download Standard CSV
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm flex-1">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Requirements Check</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500 space-y-3 leading-relaxed">
                  <p>Our system integrates raw sales CSV streams and maps them to General Ledger double entries securely:</p>
                  <div className="space-y-1.5">
                    <span className="font-semibold text-zinc-400 uppercase tracking-widest block text-[9px]">Required Columns:</span>
                    <ul className="list-disc list-inside pl-1 space-y-1">
                      <li>Product Name (item, nama)</li>
                      <li>Category (kategori)</li>
                      <li>Quantity & Unit Price</li>
                      <li>Net Amount (total value)</li>
                      <li>Payment Method (Cash, GoPay, OVO)</li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-zinc-850 space-y-1">
                    <span className="font-semibold text-zinc-400 uppercase tracking-widest block text-[9px]">Aggregated Double Entry Split:</span>
                    <p>Calculates and reports DPP revenue vs PPN Keluaran splits automatically based on tax records.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* 2. MAPPING COLUMN HEADERS STEP */}
        {step === 'mapping' && (
          <div className="flex flex-col h-full gap-4 max-w-4xl mx-auto">
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="text-zinc-200">Confirm Column Header Mapping</CardTitle>
                <CardDescription className="text-zinc-500">
                  Verify how headers parsed from your CSV file correspond to required database fields. Modify selectors as needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-auto pr-2">
                  {FIELD_SPECS.map(spec => {
                    const currentVal = headerMap[spec.key] || ''
                    return (
                      <div key={spec.key} className="flex flex-col gap-1.5 border-b border-zinc-850 pb-3 last:border-0">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-zinc-300">
                            {spec.label} {spec.required && <span className="text-red-400">*</span>}
                          </label>
                          {!spec.required && <span className="text-[10px] text-zinc-500 italic">Optional</span>}
                        </div>
                        <select
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                          value={currentVal}
                          onChange={(e) => setHeaderMap({ ...headerMap, [spec.key]: e.target.value })}
                        >
                          <option value="">Select CSV Column...</option>
                          {csvHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mt-2">
                  <Button variant="ghost" className="text-zinc-400" onClick={handleReset}>Cancel</Button>
                  <Button className="bg-zinc-100 text-zinc-900 hover:bg-white" onClick={handleConfirmMapping} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Confirm & Preview Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 3. PARSED CSV ROWS PREVIEW & METADATA ENTRY */}
        {step === 'preview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
            
            {/* Left Column - Meta Panel */}
            <div className="flex flex-col gap-4 overflow-auto">
              <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shrink-0">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-zinc-400">POS Batch Specifications</CardTitle>
                  <CardDescription className="text-zinc-500">Provide batch details for importing.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400 font-semibold uppercase">POS Sales Date</label>
                    <Input 
                      type="date"
                      className="bg-zinc-950 border-zinc-800 text-zinc-200"
                      value={importDate}
                      onChange={(e) => setImportDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400 font-semibold uppercase">Shift Scope (Optional)</label>
                    <select
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-150 focus:outline-none focus:border-zinc-700"
                      value={shift}
                      onChange={(e) => setShift(e.target.value)}
                    >
                      <option value="">Full Day (Default)</option>
                      <option value="Morning">Morning Shift</option>
                      <option value="Evening">Evening Shift</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-zinc-850 space-y-2">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Sheet Import Summary</span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-zinc-900/40 p-2 rounded border border-zinc-850">
                        <span className="text-zinc-500 block">Total Qty</span>
                        <span className="font-bold text-zinc-200 font-mono">{totalQuantity.toFixed(0)}</span>
                      </div>
                      <div className="bg-zinc-900/40 p-2 rounded border border-zinc-850">
                        <span className="text-zinc-500 block">Total Net Value</span>
                        <span className="font-bold text-emerald-400 font-mono">{formatRp(totalNetRevenue)}</span>
                      </div>
                      <div className="bg-zinc-900/40 p-2 rounded border border-zinc-850">
                        <span className="text-zinc-500 block">Total Tax (PPN)</span>
                        <span className="font-bold text-zinc-350 font-mono">{formatRp(totalTax)}</span>
                      </div>
                      <div className="bg-zinc-900/40 p-2 rounded border border-zinc-850">
                        <span className="text-zinc-500 block">Total Cost (COGS)</span>
                        <span className="font-bold text-zinc-350 font-mono">{formatRp(totalCogs)}</span>
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={handleUploadAndValidate}
                    disabled={loading}
                    className="w-full bg-zinc-100 text-zinc-900 hover:bg-white mt-4"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                    Validate Configuration
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Table Scrollable Preview */}
            <div className="lg:col-span-2 flex flex-col h-full overflow-hidden border border-zinc-800 rounded-xl bg-zinc-900/20">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/40 shrink-0 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-350">CSV Contents Preview</h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Showing all parsed transactions before database validation.</p>
                </div>
                <span className="text-xs text-zinc-400 font-mono font-bold bg-zinc-850 border border-zinc-800 px-2 py-0.5 rounded">
                  {parsedRecords.length} Rows
                </span>
              </div>

              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader className="bg-zinc-900/50 sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent border-zinc-800">
                      <TableHead className="text-zinc-400 py-2">Product Name</TableHead>
                      <TableHead className="text-zinc-400 py-2">Category</TableHead>
                      <TableHead className="text-zinc-400 text-right py-2">Qty</TableHead>
                      <TableHead className="text-zinc-400 text-right py-2">Unit Price</TableHead>
                      <TableHead className="text-zinc-400 text-right py-2">Tax (PPN)</TableHead>
                      <TableHead className="text-zinc-400 text-right py-2">Net Total</TableHead>
                      <TableHead className="text-zinc-400 py-2">Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRecords.map((r, idx) => (
                      <TableRow key={idx} className="border-zinc-850 hover:bg-zinc-900/10">
                        <TableCell className="font-medium text-zinc-200 text-xs py-2">{r.product_name}</TableCell>
                        <TableCell className="text-zinc-400 text-xs py-2">{r.category}</TableCell>
                        <TableCell className="text-right text-zinc-300 font-mono text-xs py-2">{r.quantity}</TableCell>
                        <TableCell className="text-right text-zinc-350 font-mono text-xs py-2">{formatRp(r.unit_price)}</TableCell>
                        <TableCell className="text-right text-amber-500/80 font-mono text-xs py-2">{formatRp(r.tax_amount)}</TableCell>
                        <TableCell className="text-right text-emerald-400 font-mono text-xs py-2">{formatRp(r.net_amount)}</TableCell>
                        <TableCell className="text-zinc-300 font-mono text-xs py-2">{r.payment_method}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>
        )}

        {/* 4. VALIDATION BLOCKED SCREEN (UNMAPPED COAS) */}
        {step === 'validation' && validationResult && (
          <div className="flex flex-col h-full max-w-3xl mx-auto overflow-auto gap-6">
            <Card className="border-zinc-850 bg-red-950/10 border-red-500/20">
              <CardHeader className="flex flex-row items-start gap-4 pb-2">
                <div className="h-10 w-10 shrink-0 bg-red-500/10 border border-red-500/30 flex items-center justify-center rounded-xl text-red-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-red-400 text-base">Configuration Mappings Blocked</CardTitle>
                  <CardDescription className="text-zinc-450">
                    We parsed the daily summary successfully, but missing account mapping codes prevent ledger balance entries from recording.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4 border-t border-red-900/10">
                
                {/* Unmapped Categories Warning */}
                {validationResult.unmapped_categories.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-400" /> Missing Category Accounts:
                    </span>
                    <div className="flex flex-wrap gap-2 pl-6">
                      {validationResult.unmapped_categories.map((cat, i) => (
                        <span key={i} className="text-xs bg-red-500/5 border border-red-500/20 text-red-300 px-3 py-1 rounded-md font-mono">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unmapped Payments Warning */}
                {validationResult.unmapped_payments.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-850/50">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-400" /> Missing Payment clearing Accounts:
                    </span>
                    <div className="flex flex-wrap gap-2 pl-6">
                      {validationResult.unmapped_payments.map((pmt, i) => (
                        <span key={i} className="text-xs bg-red-500/5 border border-red-500/20 text-red-300 px-3 py-1 rounded-md font-mono">
                          {pmt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unmapped Tax Account Warning */}
                {validationResult.unmapped_ppn_keluaran.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-850/50">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-400" /> Missing Output Tax (PPN Keluaran) COA:
                    </span>
                    <p className="text-xs text-zinc-500 pl-6 leading-relaxed">
                      Sales rows include PPN tax amounts, but no Hutang PPN account is configured under the <span className="font-semibold text-zinc-400">ppn_keluaran</span> role in default system accounts mapping rules.
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-zinc-800">
                  <Button 
                    variant="outline"
                    className="border-zinc-800 text-zinc-450 hover:bg-zinc-900 flex-1 gap-2" 
                    onClick={handleCancelDraft}
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" /> Discard Current Draft
                  </Button>
                  
                  <Link href="/settings/accounting/pos-mapping" target="_blank" className="flex-1">
                    <Button className="w-full bg-zinc-100 text-zinc-900 hover:bg-white gap-2 font-semibold">
                      Configure POS Mapping <ExternalLink className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-850 flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-zinc-500 animate-pulse" />
                  <div className="text-xs text-zinc-500 leading-relaxed">
                    <p>Once you save mappings in settings (opens in a new tab), close it and click "Re-Validate Draft" to proceed without re-uploading.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-800 text-zinc-300 shrink-0 ml-auto"
                    onClick={async () => {
                      if (!importId) return
                      setLoading(true)
                      try {
                        const { data: valData, error: valErr } = await supabase
                          .rpc('validate_pos_import', { p_import_id: importId })
                        if (valErr) throw valErr
                        const res = valData as ValidationResponse
                        setValidationResult(res)
                        if (res.is_valid) {
                          const { data: previewData, error: previewErr } = await supabase
                            .rpc('preview_pos_journal', { p_import_id: importId })
                          if (previewErr) throw previewErr
                          setJournalPreview((previewData || []) as PreviewJournalRow[])
                          setStep('journal')
                          toast.success('Validation passed perfectly! Ready to post.')
                        } else {
                          toast.error('Mappings are still incomplete. Please double check.')
                        }
                      } catch (err: any) {
                        toast.error(err.message)
                      } finally {
                        setLoading(false)
                      }
                    }}
                  >
                    Re-Validate Draft
                  </Button>
                </div>

              </CardContent>
            </Card>
          </div>
        )}

        {/* 5. POSTING GENERAL LEDGER DOUBLE ENTRY PREVIEW */}
        {step === 'journal' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
            
            {/* Left Column: Metrics & Meta details */}
            <div className="flex flex-col gap-4 overflow-auto shrink-0">
              <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Posting Ledger Batch Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="space-y-1.5 border-b border-zinc-850 pb-3">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">General Ledger Date</span>
                    <span className="text-sm font-mono text-zinc-200">{importDate}</span>
                  </div>

                  <div className="space-y-1.5 border-b border-zinc-850 pb-3">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Shift Assignment</span>
                    <span className="text-sm text-zinc-200">{shift || 'Full Day Daily Aggregation'}</span>
                  </div>

                  <div className="space-y-1.5 border-b border-zinc-850 pb-3">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Audited Balance Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 bg-emerald-500 rounded-full animate-ping" />
                      <span className="text-xs font-bold text-emerald-400">Debit Credits Balance Verified</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      onClick={handlePostGL}
                      disabled={posting}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.01] text-white gap-2 font-bold shadow-lg shadow-emerald-950/20 border-t border-emerald-400/20 h-11"
                    >
                      {posting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
                      Post General Ledger Entries
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
                <CardHeader className="py-3">
                  <CardTitle className="text-xs font-bold uppercase text-zinc-450 tracking-wider">Balance Audit Ledger</CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-2 font-mono">
                  <div className="flex justify-between border-b border-zinc-850 pb-2">
                    <span className="text-zinc-500">Total Debit (Receivables)</span>
                    <span className="text-emerald-400 font-bold">{formatRp(debitSum)}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-850 pb-2">
                    <span className="text-zinc-500">Total Credit (Revenue + Tax)</span>
                    <span className="text-zinc-300 font-bold">{formatRp(creditSum)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400 font-semibold pt-1">
                    <span>Discrepancy Variance</span>
                    <span className={Math.abs(debitSum - creditSum) < 0.01 ? "text-emerald-400" : "text-red-400"}>
                      {formatRp(Math.abs(debitSum - creditSum))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Ledger Entry Sheet (Standard Double Entry Style) */}
            <div className="lg:col-span-2 flex flex-col h-full overflow-hidden border border-zinc-800 rounded-xl bg-zinc-900/20">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/40 shrink-0 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-350">Double-Entry Journal Preview</h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Calculated ledger lines showing revenues nets (DPP) vs PPN Keluaran splits.</p>
                </div>
                <span className="text-xs text-zinc-400 font-mono font-bold bg-zinc-850 border border-zinc-800 px-2.5 py-1 rounded">
                  {journalPreview.length} GL lines
                </span>
              </div>

              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader className="bg-zinc-900/50 sticky top-0 z-10 border-b border-zinc-800">
                    <TableRow className="hover:bg-transparent border-zinc-800">
                      <TableHead className="text-zinc-400 py-2.5 w-[140px]">Account Code</TableHead>
                      <TableHead className="text-zinc-400 py-2.5">Account Name / Description</TableHead>
                      <TableHead className="text-zinc-400 text-right py-2.5 w-[150px]">Debit (DR)</TableHead>
                      <TableHead className="text-zinc-400 text-right py-2.5 w-[150px]">Credit (CR)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalPreview.map((row, idx) => {
                      const isCredit = row.side === 'credit'
                      return (
                        <TableRow key={idx} className="border-zinc-850 hover:bg-zinc-900/10 h-10">
                          <TableCell className="font-mono text-xs py-2 text-zinc-400">{row.coa_code}</TableCell>
                          <TableCell className="py-2 text-xs">
                            <div className={isCredit ? "pl-6 text-zinc-350" : "font-semibold text-zinc-200"}>
                              {row.coa_name}
                              <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">{row.description}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs py-2 text-emerald-400">
                            {row.debit > 0 ? formatRp(row.debit) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs py-2 text-zinc-300">
                            {row.credit > 0 ? formatRp(row.credit) : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
