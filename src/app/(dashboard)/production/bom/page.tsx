'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Plus, Trash2, Save, ArrowLeft, Loader2, Info, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function BOMPage() {
  const [wipItems, setWipItems] = useState<any[]>([])
  const [rawItems, setRawItems] = useState<any[]>([])
  const [selectedWipId, setSelectedWipId] = useState<string | null>(null)
  const [bomLines, setBomLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: items } = await supabase
        .from('item_master')
        .select('*')
      
      if (items) {
        setWipItems(items.filter(i => i.category === 'wip'))
        setRawItems(items.filter(i => i.category === 'raw'))
      }
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  useEffect(() => {
    if (!selectedWipId) {
      setBomLines([])
      return
    }

    async function fetchBOM() {
      const { data, error } = await supabase
        .from('bom')
        .select('*')
        .eq('output_item_id', selectedWipId)
      
      if (data) {
        setBomLines(data)
      }
    }
    fetchBOM()
  }, [selectedWipId, supabase])

  const addLine = () => {
    setBomLines(prev => [...prev, { 
      id: crypto.randomUUID(), 
      output_item_id: selectedWipId, 
      input_item_id: '', 
      qty_per_unit: 0, 
      unit: '' 
    }])
  }

  const removeLine = (id: string) => {
    setBomLines(prev => prev.filter(l => l.id !== id))
  }

  const updateLine = (id: string, field: string, value: any) => {
    setBomLines(prev => prev.map(l => {
      if (l.id === id) {
        const updated = { ...l, [field]: value }
        if (field === 'input_item_id') {
          const item = rawItems.find(r => r.id === value)
          if (item) updated.unit = item.unit
        }
        return updated
      }
      return l
    }))
  }

  const handleSave = async () => {
    if (!selectedWipId) return
    setSaving(true)
    try {
      // 1. Delete existing BOM for this item
      await supabase.from('bom').delete().eq('output_item_id', selectedWipId)
      
      // 2. Insert new lines
      const linesToInsert = bomLines
        .filter(l => l.input_item_id && l.qty_per_unit > 0)
        .map(({ id, ...line }) => ({
          ...line,
          output_item_id: selectedWipId
        }))

      if (linesToInsert.length > 0) {
        const { error } = await supabase.from('bom').insert(linesToInsert)
        if (error) throw error
      }

      toast.success('BOM updated successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save BOM')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex h-[60vh] items-center justify-center text-zinc-500">Loading master data...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/production">
            <Button variant="ghost" size="icon" className="text-zinc-400">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Bill of Materials (BOM)</h2>
            <p className="text-zinc-400 text-sm">Define recipe ingredients for your WIP items.</p>
          </div>
        </div>
        <Button 
          className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          disabled={!selectedWipId || saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save BOM
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">WIP Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col">
              {wipItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedWipId(item.id)}
                  className={`flex items-center justify-between px-4 py-3 text-sm transition-colors border-b border-zinc-800/50 last:border-0 ${
                    selectedWipId === item.id 
                      ? "bg-zinc-800 text-zinc-100 font-bold" 
                      : "text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200"
                  }`}
                >
                  {item.name}
                  <ChevronRight className={`h-4 w-4 transition-transform ${selectedWipId === item.id ? "rotate-0" : "-rotate-90 opacity-20"}`} />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between border-b border-zinc-800/50 py-4">
            <div className="flex items-center gap-4">
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Ingredients Setup</CardTitle>
              {selectedWipId && (
                <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                  {wipItems.find(i => i.id === selectedWipId)?.name} (1 {wipItems.find(i => i.id === selectedWipId)?.unit})
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" className="h-8 border-zinc-800 bg-zinc-900" onClick={addLine} disabled={!selectedWipId}>
              <Plus className="mr-2 h-3 w-3" />
              Add Ingredient
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedWipId ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
                <Info className="h-8 w-8 opacity-20" />
                <p>Select a WIP item from the sidebar to manage its BOM</p>
              </div>
            ) : bomLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2 text-sm italic">
                <p>No ingredients defined for this item yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-zinc-500 text-xs font-bold uppercase">Raw Material</TableHead>
                    <TableHead className="text-zinc-500 text-xs font-bold uppercase w-[150px]">Qty Required</TableHead>
                    <TableHead className="text-zinc-500 text-xs font-bold uppercase w-[100px]">Unit</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bomLines.map((line) => (
                    <TableRow key={line.id} className="border-zinc-800 hover:bg-zinc-800/20">
                      <TableCell>
                        <select
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700"
                          value={line.input_item_id || ''}
                          onChange={(e) => updateLine(line.id, 'input_item_id', e.target.value)}
                        >
                          <option value="">Select ingredient...</option>
                          {rawItems.map(raw => (
                            <option key={raw.id} value={raw.id}>{raw.name}</option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.qty_per_unit}
                          onChange={(e) => updateLine(line.id, 'qty_per_unit', parseFloat(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 h-9 text-sm"
                        />
                      </TableCell>
                      <TableCell className="text-zinc-500 text-sm font-medium">
                        {line.unit || '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-600 hover:text-red-400" onClick={() => removeLine(line.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
