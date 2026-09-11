'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { CoaCombobox } from '@/components/ui/coa-combobox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STANDARD_UOMS } from '@/lib/constants'
import { Loader2, Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { StepProps } from './types'

const UOM_AUTO_CONVERSIONS: Record<string, { purchase_unit: string; conversion_factor: number }> = {
  GR: { purchase_unit: 'KG', conversion_factor: 1000 },
  KG: { purchase_unit: 'KG', conversion_factor: 1 },
  ML: { purchase_unit: 'L', conversion_factor: 1000 },
  L: { purchase_unit: 'L', conversion_factor: 1 },
  MG: { purchase_unit: 'KG', conversion_factor: 1000000 },
}

export function ItemsStep({ orgId, accounts, items, onItemCreated, markDone }: StepProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('GR')
  const [purchaseUnit, setPurchaseUnit] = useState('KG')
  const [conversionFactor, setConversionFactor] = useState(1000)
  const [defaultCoaId, setDefaultCoaId] = useState('')
  const [isInventory, setIsInventory] = useState(true)

  const rawItems = items.filter(i => i.category === 'raw' || i.category === 'packaging')

  const reset = () => {
    setName('')
    setUnit('GR')
    setPurchaseUnit('KG')
    setConversionFactor(1000)
    setDefaultCoaId('')
    setIsInventory(true)
  }

  const handleAdd = async () => {
    if (!name.trim() || (isInventory && (!unit || !purchaseUnit))) {
      toast.error('Item name and units are required')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('item_master')
        .insert({
          org_id: orgId,
          name: name.trim(),
          unit: isInventory ? unit : (purchaseUnit || 'PCS'),
          purchase_unit: purchaseUnit || 'PCS',
          conversion_factor: isInventory ? (conversionFactor || 1) : 1,
          category: 'raw',
          default_coa_id: defaultCoaId || null,
          is_inventory: isInventory,
        })
        .select()
        .single()

      if (error) throw error

      toast.success(`"${data.name}" added`)
      onItemCreated(data)
      markDone()
      reset()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Add your raw materials & packaging</h2>
        <p className="text-sm text-zinc-400 mt-1">
          These are what you purchase — flour, meat, produce, cups, boxes. You&apos;ll build WIP recipes
          and product recipes from these in the next steps.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium uppercase">Item Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tepung Terigu"
              className="bg-zinc-950 border-zinc-800 h-9"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium uppercase">Default Account</label>
            <CoaCombobox coas={accounts} value={defaultCoaId} onChange={setDefaultCoaId} placeholder="Select account..." />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5">
          <div className="pr-4">
            <p className="text-xs font-medium text-zinc-200">Track as Inventory</p>
            <p className="text-[10px] text-zinc-500">
              {isInventory ? 'Stock will be tracked with quantity and cost.' : 'Expensed directly on purchase — no stock tracking.'}
            </p>
          </div>
          <Switch checked={isInventory} onCheckedChange={setIsInventory} />
        </div>

        {isInventory && (
          <div className="grid grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500 font-medium uppercase">Purchase Unit</label>
              <Input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} className="bg-zinc-950 border-zinc-800 h-9" placeholder="KG" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500 font-medium uppercase">Storage Unit</label>
              <select
                value={unit}
                onChange={(e) => {
                  const newUnit = e.target.value
                  const auto = UOM_AUTO_CONVERSIONS[newUnit]
                  setUnit(newUnit)
                  if (auto) {
                    setPurchaseUnit(auto.purchase_unit)
                    setConversionFactor(auto.conversion_factor)
                  }
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2 h-9 text-sm text-zinc-100"
              >
                {STANDARD_UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500 font-medium uppercase">1 {purchaseUnit || '—'} =</label>
              <Input
                type="number"
                value={conversionFactor}
                onChange={(e) => setConversionFactor(parseFloat(e.target.value) || 1)}
                className="bg-zinc-950 border-zinc-800 h-9"
              />
            </div>
          </div>
        )}

        <Button onClick={handleAdd} disabled={saving || !name.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add Item
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Unit</TableHead>
              <TableHead className="text-zinc-400">Inventory</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rawItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-20 text-center text-zinc-500">
                  <Package className="mx-auto h-6 w-6 mb-1 opacity-20" />
                  No items added yet.
                </TableCell>
              </TableRow>
            ) : (
              rawItems.map(item => (
                <TableRow key={item.id} className="border-zinc-800">
                  <TableCell className="text-zinc-200 font-medium">{item.name}</TableCell>
                  <TableCell className="text-zinc-400">{item.unit}</TableCell>
                  <TableCell className="text-zinc-400">{item.is_inventory ? 'Tracked' : 'Direct expense'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
