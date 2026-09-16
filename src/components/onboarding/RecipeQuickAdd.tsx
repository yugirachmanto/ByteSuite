'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CoaCombobox } from '@/components/ui/coa-combobox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STANDARD_UOMS } from '@/lib/constants'
import { Loader2, Plus, Trash2, Save, ChevronRight, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { CoaOption, ItemOption } from './types'

interface BomLine {
  id: string
  input_item_id: string
  name: string
  unit: string
  qty_per_unit: number
}

interface RecipeQuickAddProps {
  orgId: string
  category: 'wip' | 'finished'
  emptyLabel: string
  accounts: CoaOption[]
  items: ItemOption[]
  onItemCreated: (item: ItemOption) => void
  markDone: () => void
}

export function RecipeQuickAdd({ orgId, category, emptyLabel, accounts, items, onItemCreated, markDone }: RecipeQuickAddProps) {
  const supabase = createClient()
  const outputItems = items.filter(i => i.category === category)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('PCS')
  const [newCoaId, setNewCoaId] = useState('')
  const [creating, setCreating] = useState(false)

  const [bomLines, setBomLines] = useState<BomLine[]>([])
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!selectedId) { setBomLines([]); return }
    async function fetchBom() {
      const { data } = await supabase
        .from('bom')
        .select('id, input_item_id, unit, qty_per_unit, item_master!bom_input_item_id_fkey(name)')
        .eq('output_item_id', selectedId)
      setBomLines((data || []).map((d: any) => ({
        id: d.id,
        input_item_id: d.input_item_id,
        name: d.item_master?.name || 'Unknown',
        unit: d.unit,
        qty_per_unit: d.qty_per_unit,
      })))
    }
    fetchBom()
  }, [selectedId, supabase])

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Name is required')
      return
    }
    setCreating(true)
    try {
      const { data, error } = await supabase
        .from('item_master')
        .insert({
          org_id: orgId,
          name: newName.trim(),
          unit: newUnit,
          category,
          is_inventory: true,
          default_coa_id: newCoaId || null,
        })
        .select()
        .single()
      if (error) throw error

      toast.success(`"${data.name}" created — now add its ingredients below`)
      onItemCreated(data)
      markDone()
      setSelectedId(data.id)
      setNewName('')
      setNewUnit('PCS')
      setNewCoaId('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create item')
    } finally {
      setCreating(false)
    }
  }

  const addIngredient = (item: ItemOption) => {
    if (bomLines.some(l => l.input_item_id === item.id)) {
      toast.error('Already in the recipe')
      return
    }
    setBomLines(prev => [...prev, { id: crypto.randomUUID(), input_item_id: item.id, name: item.name, unit: item.unit, qty_per_unit: 0 }])
    setIngredientSearch('')
  }

  const removeLine = (id: string) => setBomLines(prev => prev.filter(l => l.id !== id))
  const updateQty = (id: string, qty: number) => setBomLines(prev => prev.map(l => l.id === id ? { ...l, qty_per_unit: qty } : l))
  const updateUnit = (id: string, unit: string) => setBomLines(prev => prev.map(l => l.id === id ? { ...l, unit } : l))

  const handleSaveRecipe = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await supabase.from('bom').delete().eq('output_item_id', selectedId)
      const linesToInsert = bomLines
        .filter(l => l.input_item_id && l.qty_per_unit > 0)
        .map(l => ({ org_id: orgId, output_item_id: selectedId, input_item_id: l.input_item_id, qty_per_unit: l.qty_per_unit, unit: l.unit }))
      if (linesToInsert.length > 0) {
        const { error } = await supabase.from('bom').insert(linesToInsert)
        if (error) throw error
      }
      toast.success('Recipe saved')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save recipe')
    } finally {
      setSaving(false)
    }
  }

  const availableIngredients = items
    .filter(i => i.id !== selectedId)
    .filter(i => i.name.toLowerCase().includes(ingredientSearch.toLowerCase()))
    .slice(0, 30)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3 lg:col-span-1">
        <p className="text-xs text-zinc-500 font-medium uppercase">Create New</p>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="bg-zinc-950 border-zinc-800 h-9" />
        <div className="flex gap-2">
          <select value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-2 h-9 text-sm text-zinc-100">
            {STANDARD_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <CoaCombobox coas={accounts} value={newCoaId} onChange={setNewCoaId} placeholder="Default account (optional)" typeFilter={['asset', 'expense']} />
        <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Create
        </Button>

        <div className="pt-2 border-t border-zinc-800 space-y-1 max-h-64 overflow-y-auto">
          {outputItems.length === 0 ? (
            <p className="text-xs text-zinc-600 py-2">{emptyLabel}</p>
          ) : (
            outputItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  selectedId === item.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/40'
                }`}
              >
                <span className="truncate">{item.name}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </button>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-3">
        {!selectedId ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 h-full min-h-[240px] flex items-center justify-center text-zinc-500 text-sm">
            Create or select an item to define its recipe
          </div>
        ) : (
          <>
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-zinc-400">Ingredient</TableHead>
                    <TableHead className="text-zinc-400 w-[160px]">Qty</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bomLines.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-zinc-500 py-6 text-sm">No ingredients yet — add from the list below.</TableCell></TableRow>
                  ) : (
                    bomLines.map(line => (
                      <TableRow key={line.id} className="border-zinc-800">
                        <TableCell className="text-zinc-200">{line.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              value={line.qty_per_unit || ''}
                              onChange={(e) => updateQty(line.id, parseFloat(e.target.value) || 0)}
                              className="bg-zinc-950 border-zinc-800 h-8 w-20 text-sm"
                            />
                            <select value={line.unit} onChange={(e) => updateUnit(line.id, e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-md px-1.5 h-8 text-[10px] text-zinc-100">
                              {STANDARD_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-red-400" onClick={() => removeLine(line.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <Button onClick={handleSaveRecipe} disabled={saving} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Recipe
            </Button>

            <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
              <div className="p-2.5 border-b border-zinc-800 relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <Input value={ingredientSearch} onChange={(e) => setIngredientSearch(e.target.value)} placeholder="Search items to add..." className="pl-8 bg-zinc-950 border-zinc-800 h-8 text-sm" />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {availableIngredients.map(item => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                    <span className="text-sm text-zinc-300">{item.name}</span>
                    <Button size="sm" variant="secondary" className="h-6 px-2 text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700" onClick={() => addIngredient(item)}>
                      Add
                    </Button>
                  </div>
                ))}
                {availableIngredients.length === 0 && <p className="text-center text-zinc-500 text-xs py-4">No matching items</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
