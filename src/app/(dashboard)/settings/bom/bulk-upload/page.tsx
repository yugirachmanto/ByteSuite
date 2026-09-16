'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Upload, Download, Loader2, Save, FileSpreadsheet, Trash2, ArrowLeft, Layers } from 'lucide-react'
import { toast } from 'sonner'
import Papa from 'papaparse'

interface ParsedLine {
  ingredientName: string
  qty: number
  unit: string
  error?: string
  notFound: boolean
}

interface ParsedRecipe {
  outputName: string
  outputCategory: 'wip' | 'finished'
  outputUnit: string
  batchYieldQty: number
  lines: ParsedLine[]
  isNewItem: boolean
  willReplace: boolean
  error?: string
}

export default function BomBulkUploadPage() {
  const supabase = createClient()
  const [recipes, setRecipes] = useState<ParsedRecipe[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [existingItemNames, setExistingItemNames] = useState<Map<string, string>>(new Map())
  const [existingBomOutputNames, setExistingBomOutputNames] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function fetchExisting() {
      const { data: items } = await supabase.from('item_master').select('id, name, category')
      const map = new Map<string, string>()
      for (const i of items || []) map.set(i.name, i.category)
      setExistingItemNames(map)

      const { data: bomRows } = await supabase.from('bom').select('output_item_id, item_master!bom_output_item_id_fkey(name)')
      const outputs = new Set<string>()
      for (const row of (bomRows || []) as any[]) {
        const name = row.item_master?.name
        if (name) outputs.add(name)
      }
      setExistingBomOutputNames(outputs)
    }
    fetchExisting()
  }, [supabase])

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," +
      "Output Item Name,Output Category,Output Unit,Batch Yield Qty,Ingredient Name,Ingredient Qty,Ingredient Unit\n" +
      "Bumbu Dasar Merah,WIP,KG,1,Cabai Merah,600,GR\n" +
      "Bumbu Dasar Merah,WIP,KG,1,Bawang Merah,300,GR\n" +
      "Bumbu Dasar Merah,WIP,KG,1,Bawang Putih,100,GR\n" +
      "Nasi Goreng Spesial,Product,PCS,1,Nasi Putih,300,GR\n" +
      "Nasi Goreng Spesial,Product,PCS,1,Bumbu Dasar Merah,50,GR\n" +
      "Nasi Goreng Spesial,Product,PCS,1,Telur Ayam,1,PCS"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "bulk_bom_template.csv")
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
        const grouped = new Map<string, ParsedRecipe>()

        for (const row of results.data as any[]) {
          const outputName = (row['Output Item Name'] || row['output_name'] || '').trim()
          const rawCategory = (row['Output Category'] || row['output_category'] || '').trim().toLowerCase()
          const outputUnit = (row['Output Unit'] || row['output_unit'] || '').trim()
          const batchYieldStr = row['Batch Yield Qty'] || row['batch_yield_qty']
          const ingredientName = (row['Ingredient Name'] || row['ingredient_name'] || '').trim()
          const ingredientQtyStr = row['Ingredient Qty'] || row['ingredient_qty']
          const ingredientUnit = (row['Ingredient Unit'] || row['ingredient_unit'] || '').trim()

          if (!outputName) continue

          if (!grouped.has(outputName)) {
            const batchYieldQty = parseFloat(batchYieldStr)
            const outputCategory: 'wip' | 'finished' = rawCategory === 'wip' ? 'wip' : 'finished'
            let recipeError: string | undefined
            if (isNaN(batchYieldQty) || batchYieldQty <= 0) {
              recipeError = 'Invalid or missing Batch Yield Qty'
            }
            const existingCategory = existingItemNames.get(outputName)
            grouped.set(outputName, {
              outputName,
              outputCategory,
              outputUnit,
              batchYieldQty: isNaN(batchYieldQty) ? 0 : batchYieldQty,
              lines: [],
              isNewItem: !existingItemNames.has(outputName),
              willReplace: existingBomOutputNames.has(outputName),
              error: recipeError
            })
          }

          const recipe = grouped.get(outputName)!
          const ingredientQty = parseFloat(ingredientQtyStr)
          let lineError: string | undefined
          if (!ingredientName) lineError = 'Missing ingredient name'
          else if (isNaN(ingredientQty) || ingredientQty <= 0) lineError = 'Invalid ingredient qty'

          const notFound = !!ingredientName && !existingItemNames.has(ingredientName)

          recipe.lines.push({
            ingredientName,
            qty: isNaN(ingredientQty) ? 0 : ingredientQty,
            unit: ingredientUnit,
            error: lineError,
            notFound
          })
        }

        setRecipes(Array.from(grouped.values()))
        setLoading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
      error: (error) => {
        toast.error('Failed to parse CSV: ' + error.message)
        setLoading(false)
      }
    })
  }

  const isRecipeValid = (r: ParsedRecipe) =>
    !r.error && r.lines.length > 0 && r.lines.every(l => !l.error && !l.notFound)

  const handleSubmit = async () => {
    const validRecipes = recipes.filter(isRecipeValid)
    if (validRecipes.length === 0) {
      toast.error('No valid recipes to upload')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/bom/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipes: validRecipes.map(r => ({
            output_name: r.outputName,
            output_category: r.outputCategory,
            output_unit: r.outputUnit,
            batch_yield_qty: r.batchYieldQty,
            lines: r.lines.map(l => ({ ingredient_name: l.ingredientName, qty: l.qty, unit: l.unit }))
          }))
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to upload recipes')

      toast.success(`Successfully imported ${result.recipe_count} recipe(s)!`)
      setRecipes([])
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during upload')
    } finally {
      setSubmitting(false)
    }
  }

  const validCount = recipes.filter(isRecipeValid).length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings/bom">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Bulk Upload BOM / Resep</h2>
          <p className="text-zinc-400 text-sm">Tambahkan resep WIP atau Produk sekaligus lewat CSV.</p>
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
        <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
      </div>

      {loading && (
        <div className="flex h-48 items-center justify-center text-zinc-500 rounded-md border border-zinc-800 bg-zinc-900/50">
          <Loader2 className="h-5 w-5 animate-spin mr-2 opacity-30" />
          Parsing file...
        </div>
      )}

      {!loading && recipes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-300">Preview Summary</p>
              <div className="flex gap-6 mt-1 text-sm">
                <span className="text-zinc-500">Total Resep: <strong className="text-zinc-100">{recipes.length}</strong></span>
                <span className="text-emerald-500">Valid: <strong>{validCount}</strong></span>
                <span className="text-red-400">Errors: <strong>{recipes.length - validCount}</strong></span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="border-zinc-800 text-zinc-400" onClick={() => setRecipes([])}>
                <Trash2 className="h-4 w-4 mr-2" /> Clear
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={validCount === 0 || submitting}
                onClick={handleSubmit}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Upload {validCount} Resep
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {recipes.map((r, i) => {
              const valid = isRecipeValid(r)
              return (
                <div key={i} className={`rounded-lg border overflow-hidden ${!valid ? 'border-red-900/50 bg-red-950/10' : 'border-zinc-800 bg-zinc-900/50'}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-indigo-400" />
                      <span className="font-medium text-zinc-100">{r.outputName}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{r.outputCategory === 'wip' ? 'WIP' : 'Produk'}</span>
                      <span className="text-xs text-zinc-500">Yield: {r.batchYieldQty} {r.outputUnit}</span>
                      {r.isNewItem && <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400">Item Baru</span>}
                      {r.willReplace && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">Akan Menggantikan Resep Lama</span>}
                    </div>
                    {r.error && (
                      <span className="text-xs text-red-400">{r.error}</span>
                    )}
                  </div>
                  <div className="divide-y divide-zinc-800/40">
                    {r.lines.map((l, j) => (
                      <div key={j} className={`flex items-center justify-between px-4 py-2 text-sm ${l.error || l.notFound ? 'bg-red-950/10' : ''}`}>
                        <span className={l.notFound ? 'text-red-400' : 'text-zinc-300'}>
                          {l.ingredientName || <span className="italic text-zinc-600">—</span>}
                          {l.notFound && <span className="ml-2 text-xs">(Bahan tidak ditemukan)</span>}
                          {l.error && <span className="ml-2 text-xs text-red-400">({l.error})</span>}
                        </span>
                        <span className="text-zinc-500 font-mono text-xs">
                          {l.qty} {l.unit} · per {r.outputUnit || 'unit'}: {r.batchYieldQty > 0 ? (l.qty / r.batchYieldQty).toFixed(4) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && recipes.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-900/30 text-zinc-500">
          <Upload className="mb-4 h-8 w-8 opacity-20" />
          <p className="mb-1 text-sm font-medium">Upload CSV untuk mulai</p>
          <p className="text-xs text-zinc-600">Item output (WIP/Produk) yang belum ada akan otomatis dibuat — bahan/ingredient harus sudah terdaftar</p>
        </div>
      )}
    </div>
  )
}
