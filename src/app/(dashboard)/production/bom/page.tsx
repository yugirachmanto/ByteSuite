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
import { Plus, Trash2, Save, ArrowLeft, Loader2, Info, ChevronRight, Search } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function BOMPage() {
  const [allItems, setAllItems] = useState<any[]>([])
  const [wipItems, setWipItems] = useState<any[]>([])
  
  const [selectedWipId, setSelectedWipId] = useState<string | null>(null)
  const [bomLines, setBomLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [wipSearch, setWipSearch] = useState('')
  const [ingredientSearch, setIngredientSearch] = useState('')
  
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: items } = await supabase
        .from('item_master')
        .select('*')
        .order('name')
      
      if (items) {
        setAllItems(items)
        setWipItems(items.filter(i => i.category === 'wip'))
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
        .select(`
          *,
          item_master!bom_input_item_id_fkey (
            name,
            unit
          )
        `)
        .eq('output_item_id', selectedWipId)
      
      if (data) {
        setBomLines(data.map(d => ({
          id: d.id,
          input_item_id: d.input_item_id,
          name: d.item_master?.name,
          unit: d.item_master?.unit,
          qty_per_unit: d.qty_per_unit
        })))
      }
    }
    fetchBOM()
  }, [selectedWipId, supabase])

  const addIngredient = (item: any) => {
    // Prevent adding if already in BOM or if it's the WIP item itself
    if (bomLines.some(l => l.input_item_id === item.id)) {
      toast.error('Item is already in the BOM')
      return
    }
    if (item.id === selectedWipId) {
      toast.error('Cannot add the WIP item to its own BOM')
      return
    }

    setBomLines(prev => [...prev, { 
      id: crypto.randomUUID(), 
      input_item_id: item.id, 
      name: item.name,
      unit: item.unit,
      qty_per_unit: 0 
    }])
    setIngredientSearch('') // clear search
  }

  const removeLine = (id: string) => {
    setBomLines(prev => prev.filter(l => l.id !== id))
  }

  const updateLineQty = (id: string, qty: number) => {
    setBomLines(prev => prev.map(l => l.id === id ? { ...l, qty_per_unit: qty } : l))
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
        .map(line => ({
          output_item_id: selectedWipId,
          input_item_id: line.input_item_id,
          qty_per_unit: line.qty_per_unit
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

  const filteredWip = wipItems.filter(i => i.name.toLowerCase().includes(wipSearch.toLowerCase()))
  
  // Available ingredients = all items except the current WIP, filtered by search
  const availableIngredients = allItems
    .filter(i => i.id !== selectedWipId)
    .filter(i => i.name.toLowerCase().includes(ingredientSearch.toLowerCase()))

  if (loading) return <div className="flex h-[60vh] items-center justify-center text-zinc-500"><Loader2 className="h-8 w-8 animate-spin" /></div>

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
        {/* Left: WIP Selection */}
        <Card className="lg:col-span-1 border-zinc-800 bg-zinc-900/50 flex flex-col h-[700px]">
          <CardHeader className="pb-3 border-b border-zinc-800">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">WIP Items</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search WIP..."
                value={wipSearch}
                onChange={e => setWipSearch(e.target.value)}
                className="pl-9 bg-zinc-950 border-zinc-800 h-9 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            <div className="flex flex-col">
              {filteredWip.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500 text-center">No WIP items found.</div>
              ) : (
                filteredWip.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedWipId(item.id)}
                    className={`flex items-center justify-between px-4 py-3 text-sm transition-colors border-b border-zinc-800/50 last:border-0 ${
                      selectedWipId === item.id 
                        ? "bg-zinc-800 text-zinc-100 font-bold" 
                        : "text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200"
                    }`}
                  >
                    <span className="truncate">{item.name}</span>
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${selectedWipId === item.id ? "rotate-0" : "-rotate-90 opacity-20"}`} />
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: BOM Definition */}
        <div className="lg:col-span-3 space-y-6">
          {!selectedWipId ? (
            <Card className="border-zinc-800 bg-zinc-900/50 h-[700px] flex flex-col items-center justify-center text-zinc-500 space-y-4">
              <Info className="h-12 w-12 opacity-20" />
              <p>Select a WIP item from the sidebar to manage its BOM</p>
            </Card>
          ) : (
            <>
              {/* Recipe Table */}
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader className="flex flex-row items-center justify-between border-b border-zinc-800/50 py-4">
                  <div className="flex items-center gap-4">
                    <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Current Recipe</CardTitle>
                    <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-3 py-1 rounded-full flex items-center gap-2">
                      <span>{wipItems.find(i => i.id === selectedWipId)?.name}</span>
                      <span className="text-blue-500/50">|</span>
                      <span>1 {wipItems.find(i => i.id === selectedWipId)?.unit}</span>
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {bomLines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-amber-500/70 bg-amber-500/5 text-sm italic">
                      <p>No ingredients in recipe. Search and add items below.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="border-zinc-800">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-zinc-500 text-xs font-bold uppercase">Ingredient</TableHead>
                          <TableHead className="text-zinc-500 text-xs font-bold uppercase w-[200px]">Qty Required</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bomLines.map((line) => (
                          <TableRow key={line.id} className="border-zinc-800 hover:bg-zinc-800/20">
                            <TableCell className="font-medium text-zinc-200">
                              {line.name || 'Unknown Item'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  value={line.qty_per_unit || ''}
                                  onChange={(e) => updateLineQty(line.id, parseFloat(e.target.value) || 0)}
                                  className="bg-zinc-950 border-zinc-800 h-9 text-sm w-24 font-mono text-right"
                                />
                                <span className="text-xs text-zinc-500 font-medium uppercase min-w-[30px]">{line.unit}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-600 hover:text-red-400 hover:bg-red-400/10" onClick={() => removeLine(line.id)}>
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

              {/* Add Ingredient Section */}
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader className="pb-3 border-b border-zinc-800/50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Add Ingredient</CardTitle>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <Input
                        placeholder="Search items to add..."
                        value={ingredientSearch}
                        onChange={e => setIngredientSearch(e.target.value)}
                        className="pl-9 bg-zinc-950 border-zinc-800 h-9 text-sm"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 h-[300px] overflow-auto">
                  <Table>
                    <TableBody>
                      {availableIngredients.slice(0, 50).map(item => {
                        const inBom = bomLines.some(l => l.input_item_id === item.id)
                        return (
                          <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors">
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-zinc-300">{item.name}</span>
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.category}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                size="sm" 
                                variant={inBom ? "ghost" : "secondary"}
                                disabled={inBom}
                                onClick={() => addIngredient(item)}
                                className={inBom ? "text-emerald-500 opacity-50" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}
                              >
                                {inBom ? 'Added' : 'Add'}
                                {!inBom && <Plus className="ml-2 h-3 w-3" />}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {availableIngredients.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} className="h-24 text-center text-zinc-500">
                            No matching items found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
