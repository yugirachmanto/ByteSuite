'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Plus, Trash2, Save } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { StepProps } from './types'

interface Row {
  id: string
  item_id: string
  name: string
  unit: string
  qty: number
  unit_cost: number
}

export function BeginningInventoryStep({ orgId, items, markDone }: StepProps) {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const [rows, setRows] = useState<Row[]>([])
  const [pickerId, setPickerId] = useState('')
  const [saving, setSaving] = useState(false)

  const inventoryItems = items.filter(i => i.is_inventory)
  const outletName = outlets.find(o => o.id === selectedOutletId)?.name

  const addRow = () => {
    const item = inventoryItems.find(i => i.id === pickerId)
    if (!item) return
    if (rows.some(r => r.item_id === item.id)) {
      toast.error('Item already added')
      return
    }
    setRows(prev => [...prev, { id: crypto.randomUUID(), item_id: item.id, name: item.name, unit: item.unit, qty: 0, unit_cost: 0 }])
    setPickerId('')
  }

  const updateRow = (id: string, field: 'qty' | 'unit_cost', value: number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id))

  const handleSubmit = async () => {
    if (!selectedOutletId) {
      toast.error('Select an outlet first (top of the app)')
      return
    }
    const validRows = rows.filter(r => r.qty > 0)
    if (validRows.length === 0) {
      toast.error('Add at least one item with a quantity')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('import_beginning_balance', {
        p_org_id: orgId,
        p_outlet_id: selectedOutletId,
        p_items: validRows.map(r => ({ item_id: r.item_id, qty: r.qty, unit_cost: r.unit_cost })),
      })
      if (error) throw error

      toast.success(`Imported ${validRows.length} opening balances for ${outletName}`)
      markDone()
      setRows([])
    } catch (err: any) {
      toast.error(err.message || 'Failed to import beginning balance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Beginning Inventory Balance</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Set opening stock and cost for <span className="text-zinc-300 font-medium">{outletName || 'the selected outlet'}</span>.
          Got a large list already? <Link href="/settings/import" className="text-indigo-400 hover:underline">bulk import via CSV instead →</Link>
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div className="flex gap-2">
          <select value={pickerId} onChange={(e) => setPickerId(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100">
            <option value="">Select an item...</option>
            {inventoryItems.filter(i => !rows.some(r => r.item_id === i.id)).map(i => (
              <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
            ))}
          </select>
          <Button onClick={addRow} disabled={!pickerId} className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Item</TableHead>
              <TableHead className="text-zinc-400 w-[140px]">Quantity</TableHead>
              <TableHead className="text-zinc-400 w-[160px]">Unit Cost</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 py-8 text-sm">No opening balances added yet.</TableCell></TableRow>
            ) : (
              rows.map(row => (
                <TableRow key={row.id} className="border-zinc-800">
                  <TableCell className="text-zinc-200">{row.name} <span className="text-zinc-500 text-xs">({row.unit})</span></TableCell>
                  <TableCell>
                    <Input type="number" value={row.qty || ''} onChange={(e) => updateRow(row.id, 'qty', parseFloat(e.target.value) || 0)} className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={row.unit_cost || ''} onChange={(e) => updateRow(row.id, 'unit_cost', parseFloat(e.target.value) || 0)} className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-red-400" onClick={() => removeRow(row.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Button onClick={handleSubmit} disabled={saving || rows.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Import Balances
      </Button>
    </div>
  )
}
