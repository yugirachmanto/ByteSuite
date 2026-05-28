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
  TableRow,
  TableFooter
} from '@/components/ui/table'
import { Plus, Trash2, Save, ArrowLeft, Loader2, Info, ChevronRight, Search } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { STANDARD_UOMS } from '@/lib/constants'

const convertQty = (qty: number, fromUnit: string, toUnit: string): number => {
  const from = (fromUnit || '').toUpperCase().trim()
  const to = (toUnit || '').toUpperCase().trim()
  if (from === to) return qty

  // Conversions TO base unit
  if (from === 'GR' && to === 'KG') return qty / 1000
  if (from === 'KG' && to === 'GR') return qty * 1000
  
  if (from === 'ML' && to === 'L') return qty / 1000
  if (from === 'L' && to === 'ML') return qty * 1000

  if (from === 'MG' && to === 'GR') return qty / 1000
  if (from === 'GR' && to === 'MG') return qty * 1000
  
  if (from === 'MG' && to === 'KG') return qty / 1000000
  if (from === 'KG' && to === 'MG') return qty * 1000000
  
  return qty
}

export default function BOMPage() {
  const [allItems, setAllItems] = useState<any[]>([])
  const [wipItems, setWipItems] = useState<any[]>([])
  
  const [selectedWipId, setSelectedWipId] = useState<string | null>(null)
  const [bomLines, setBomLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  
  const [wipSearch, setWipSearch] = useState('')
  const [ingredientSearch, setIngredientSearch] = useState('')
  
  const [targetYield, setTargetYield] = useState<number>(1)
  const [targetYieldUnit, setTargetYieldUnit] = useState<string>('PCS')
  const [costs, setCosts] = useState<Record<string, number>>({})
  
  const [orgId, setOrgId] = useState<string | null>(null)
  const [coa, setCoa] = useState<any[]>([])
  const [newWipModalOpen, setNewWipModalOpen] = useState(false)
  const [newWipData, setNewWipData] = useState({
    name: '',
    unit: 'PCS',
    default_coa_id: '',
  })
  const [savingWip, setSavingWip] = useState(false)
  
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('org_id')
          .eq('id', user.id)
          .single()
        if (profile) {
          setOrgId(profile.org_id)
        }
      }

      const { data: items } = await supabase
        .from('item_master')
        .select('*')
        .order('name')
      
      if (items) {
        setAllItems(items)
        setWipItems(items.filter(i => i.category === 'wip' || i.category === 'finished'))
      }

      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      if (accounts) {
        setCoa(accounts)
      }

      setLoading(false)
    }
    fetchData()
  }, [supabase])

  // Fetch costs when outlet changes
  useEffect(() => {
    if (!selectedOutletId) return
    async function fetchCosts() {
      const { data: inv } = await supabase
        .from('inventory_balance')
        .select('item_id, qty_on_hand, inventory_value')
        .eq('outlet_id', selectedOutletId)
      
      if (inv) {
        const costMap: Record<string, number> = {}
        inv.forEach(i => {
          costMap[i.item_id] = i.qty_on_hand > 0 ? (i.inventory_value / i.qty_on_hand) : 0
        })
        setCosts(costMap)
      }
    }
    fetchCosts()
  }, [selectedOutletId, supabase])

  const handleCreateWIP = async () => {
    if (!newWipData.name || !newWipData.unit) {
      toast.error('Name and unit are required')
      return
    }

    setSavingWip(true)
    try {
      const { data, error } = await supabase
        .from('item_master')
        .insert({
          org_id: orgId,
          name: newWipData.name,
          unit: newWipData.unit,
          category: 'wip',
          is_inventory: true,
          default_coa_id: newWipData.default_coa_id || null
        })
        .select()
        .single()

      if (error) throw error

      setAllItems(prev => [data, ...prev])
      setWipItems(prev => [data, ...prev])
      setSelectedWipId(data.id)
      setNewWipModalOpen(false)
      setNewWipData({ name: '', unit: 'PCS', default_coa_id: '' })
      toast.success(`WIP "${data.name}" created! You can now define its BOM below.`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create WIP item')
    } finally {
      setSavingWip(false)
    }
  }

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
          base_unit: d.item_master?.unit,
          unit: d.unit || d.item_master?.unit,
          qty_per_unit: d.qty_per_unit
        })))
        const wipUnit = wipItems.find(i => i.id === selectedWipId)?.unit || 'PCS'
        setTargetYieldUnit(wipUnit)
        setTargetYield(1)
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
      base_unit: item.unit,
      unit: item.unit,
      qty_per_unit: 0 
    }])
    setIngredientSearch('') // clear search
  }

  const removeLine = (id: string) => {
    setBomLines(prev => prev.filter(l => l.id !== id))
  }

  const wipBaseUnit = wipItems.find(i => i.id === selectedWipId)?.unit || 'PCS'
  const yieldInBaseUnit = convertQty(targetYield || 1, targetYieldUnit, wipBaseUnit)

  const updateLineQty = (id: string, displayQty: number) => {
    const qtyPerUnit = displayQty / (yieldInBaseUnit || 1)
    setBomLines(prev => prev.map(l => l.id === id ? { ...l, qty_per_unit: qtyPerUnit } : l))
  }

  const updateLineUnit = (id: string, newUnit: string) => {
    setBomLines(prev => prev.map(l => l.id === id ? { ...l, unit: newUnit } : l))
  }

  // Calculate totals
  const totalRecipeCost = bomLines.reduce((sum, line) => {
    const costPerBaseUnit = costs[line.input_item_id] || 0
    const qtyInBaseUnit = convertQty((line.qty_per_unit || 0) * (yieldInBaseUnit || 1), line.unit, line.base_unit)
    return sum + (qtyInBaseUnit * costPerBaseUnit)
  }, 0)
  
  const costPerUnit = yieldInBaseUnit > 0 ? totalRecipeCost / yieldInBaseUnit : 0

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
          org_id: orgId,
          output_item_id: selectedWipId,
          input_item_id: line.input_item_id,
          qty_per_unit: line.qty_per_unit,
          unit: line.unit
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

  const handleDeleteBOM = async (itemId: string) => {
    setDeleting(true)
    try {
      const { error } = await supabase.from('bom').delete().eq('output_item_id', itemId)
      if (error) throw error
      if (selectedWipId === itemId) setBomLines([])
      setDeleteTargetId(null)
      toast.success('BOM deleted successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete BOM')
    } finally {
      setDeleting(false)
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
          <Link href="/settings">
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
            <div className="flex items-center justify-between mb-3">
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Output Items</CardTitle>
              <Button 
                onClick={() => setNewWipModalOpen(true)}
                size="sm"
                className="h-7 px-2 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-850 text-zinc-300 flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> New WIP
              </Button>
            </div>
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
                  <div
                    key={item.id}
                    className={`group flex items-center justify-between border-b border-zinc-800/50 last:border-0 transition-colors ${
                      selectedWipId === item.id
                        ? 'bg-zinc-800'
                        : 'hover:bg-zinc-800/30'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedWipId(item.id)}
                      className={`flex flex-1 items-center justify-between px-4 py-3 text-sm ${
                        selectedWipId === item.id
                          ? 'text-zinc-100 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span className="truncate">{item.name}</span>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${selectedWipId === item.id ? 'rotate-0' : '-rotate-90 opacity-20'}`} />
                    </button>

                    {/* Per-row delete */}
                    {deleteTargetId === item.id ? (
                      <div className="flex items-center gap-1 pr-2 shrink-0">
                        <button
                          disabled={deleting}
                          onClick={() => handleDeleteBOM(item.id)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                        </button>
                        <button
                          disabled={deleting}
                          onClick={() => setDeleteTargetId(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTargetId(item.id) }}
                        className="mr-2 shrink-0 p-1.5 rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
                        title="Delete BOM"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Batch Yield:</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={targetYield || ''}
                          onChange={(e) => setTargetYield(parseFloat(e.target.value) || 1)}
                          className="w-20 h-7 text-xs bg-zinc-950 border-zinc-800 text-right font-mono"
                        />
                        <select
                          value={targetYieldUnit}
                          onChange={(e) => setTargetYieldUnit(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-md px-2 h-7 text-[10px] text-zinc-100 focus:outline-none uppercase"
                        >
                          {STANDARD_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-3 py-1 rounded-full flex items-center gap-2 ml-2">
                        <span>{wipItems.find(i => i.id === selectedWipId)?.name}</span>
                        <span className="text-blue-500/50">|</span>
                        <span>{wipBaseUnit}</span>
                      </span>
                    </div>
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
                          <TableHead className="text-zinc-500 text-xs font-bold uppercase w-[180px]">Qty for {targetYield || 1}</TableHead>
                          <TableHead className="text-zinc-500 text-xs font-bold uppercase text-right">Unit Cost</TableHead>
                          <TableHead className="text-zinc-500 text-xs font-bold uppercase text-right">Total Cost</TableHead>
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
                                  value={line.qty_per_unit ? Number((line.qty_per_unit * (yieldInBaseUnit || 1)).toFixed(4)) : ''}
                                  onChange={(e) => updateLineQty(line.id, parseFloat(e.target.value) || 0)}
                                  className="bg-zinc-950 border-zinc-800 h-9 text-sm w-24 font-mono text-right"
                                />
                                <select
                                  value={line.unit}
                                  onChange={(e) => updateLineUnit(line.id, e.target.value)}
                                  className="bg-zinc-950 border border-zinc-800 rounded-md px-2 h-9 text-[10px] text-zinc-100 focus:outline-none uppercase"
                                >
                                  {STANDARD_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-zinc-400">
                              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(costs[line.input_item_id] || 0)}
                              <span className="text-[10px] text-zinc-600 ml-1">/{line.base_unit}</span>
                            </TableCell>
                            <TableCell className="text-right font-medium text-zinc-200">
                              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
                                (costs[line.input_item_id] || 0) * convertQty((line.qty_per_unit || 0) * (yieldInBaseUnit || 1), line.unit, line.base_unit)
                              )}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-600 hover:text-red-400 hover:bg-red-400/10" onClick={() => removeLine(line.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter className="bg-zinc-900/50 border-t border-zinc-800">
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={3} className="text-right font-medium text-zinc-400">Total Batch Cost:</TableCell>
                          <TableCell className="text-right font-bold text-emerald-400">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalRecipeCost)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-transparent border-t-0">
                          <TableCell colSpan={3} className="text-right font-medium text-zinc-500">Estimated Cost per 1 {wipItems.find(i => i.id === selectedWipId)?.unit}:</TableCell>
                          <TableCell className="text-right font-medium text-zinc-300">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(costPerUnit)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableFooter>
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

      {/* Create New WIP Modal */}
      <Dialog open={newWipModalOpen} onOpenChange={setNewWipModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-md text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Create New WIP Item</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a new semi-finished / WIP item to define its recipe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">WIP Name</label>
              <Input 
                value={newWipData.name}
                onChange={e => setNewWipData({...newWipData, name: e.target.value})}
                placeholder="e.g. Adonan Croissant, Coffee Base"
                className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100 placeholder-zinc-650"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Recipe Unit</label>
                <select 
                  value={newWipData.unit}
                  onChange={e => setNewWipData({...newWipData, unit: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100 focus:outline-none"
                >
                  {STANDARD_UOMS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Default COA (Optional)</label>
                <select 
                  value={newWipData.default_coa_id}
                  onChange={e => setNewWipData({...newWipData, default_coa_id: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100 focus:outline-none"
                >
                  <option value="">No Default Account</option>
                  {coa.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewWipModalOpen(false)} className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
              Cancel
            </Button>
            <Button onClick={handleCreateWIP} disabled={savingWip} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              {savingWip ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save & Start BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
