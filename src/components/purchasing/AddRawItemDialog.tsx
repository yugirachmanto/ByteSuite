'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CoaCombobox } from '@/components/ui/coa-combobox'
import { STANDARD_UOMS } from '@/lib/constants'
import { Loader2, Layers, ShoppingCart, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'

// Storage unit -> { purchase unit, storage units per 1 purchase unit }.
// conversion_factor here means converted_qty = purchase_qty * conversion_factor
// (verified against post_invoice/post_goods_receipt — e.g. buying 2 KG of a
// GR-stocked item must add 2000 GR of stock, so GR's factor is 1000, not 0.001).
const UOM_AUTO_CONVERSIONS: Record<string, { purchase_unit: string; conversion_factor: number }> = {
  GR: { purchase_unit: 'KG', conversion_factor: 1000 },
  KG: { purchase_unit: 'KG', conversion_factor: 1 },
  ML: { purchase_unit: 'L', conversion_factor: 1000 },
  L: { purchase_unit: 'L', conversion_factor: 1 },
  MG: { purchase_unit: 'KG', conversion_factor: 1000000 },
}

interface CoaOption {
  id: string
  code: string
  name: string
  is_header?: boolean
}

interface AddRawItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  accounts: CoaOption[]
  onCreated: (item: any) => void
}

export function AddRawItemDialog({ open, onOpenChange, orgId, accounts, onCreated }: AddRawItemDialogProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('GR')
  const [purchaseUnit, setPurchaseUnit] = useState('KG')
  const [conversionFactor, setConversionFactor] = useState(1000)
  const [defaultCoaId, setDefaultCoaId] = useState('')

  const reset = () => {
    setName('')
    setUnit('GR')
    setPurchaseUnit('KG')
    setConversionFactor(1000)
    setDefaultCoaId('')
  }

  const handleSave = async () => {
    if (!name.trim() || !unit || !purchaseUnit) {
      toast.error('Item name, storage unit, and purchase unit are required.')
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('item_master')
        .insert({
          org_id: orgId,
          name: name.trim(),
          unit,
          purchase_unit: purchaseUnit,
          conversion_factor: conversionFactor || 1,
          category: 'raw',
          default_coa_id: defaultCoaId || null,
          is_inventory: true,
        })
        .select()
        .single()

      if (error) throw error

      toast.success(`"${data.name}" added to Raw Material items.`)
      onCreated(data)
      reset()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Add Raw Material Item</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Not in the list yet? Add it here — it becomes available for purchasing right away.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium uppercase">Item Name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-900 border-zinc-800 h-9"
              placeholder="e.g. Tepung Terigu"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium uppercase">Default Account (Optional)</label>
            <CoaCombobox coas={accounts} value={defaultCoaId} onChange={setDefaultCoaId} placeholder="No Default Account" />
          </div>

          <div className="pt-2 border-t border-zinc-800 space-y-3">
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest flex items-center gap-2">
              <Layers className="h-3 w-3 text-blue-500" /> Unit of Measure
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] p-2.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-400">
                  <ShoppingCart className="h-3.5 w-3.5" /> Purchase Unit
                </label>
                <Input
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 h-8 text-sm"
                  placeholder="e.g. KG"
                />
                <p className="text-[9px] text-zinc-500 leading-snug">What you order from vendors</p>
              </div>

              <div className="space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                  <PackageCheck className="h-3.5 w-3.5" /> Storage Unit
                </label>
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
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 h-8 text-sm text-zinc-100 focus:outline-none"
                >
                  {STANDARD_UOMS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <p className="text-[9px] text-zinc-500 leading-snug">What stock is tracked in</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 bg-zinc-950/50 border border-zinc-800/70 rounded-lg py-2.5">
              <span className="text-xs text-zinc-500 font-mono">1</span>
              <span className="text-xs font-semibold text-indigo-400">{purchaseUnit || '—'}</span>
              <span className="text-zinc-600 font-mono">=</span>
              <Input
                type="number"
                value={conversionFactor}
                onChange={(e) => setConversionFactor(parseFloat(e.target.value) || 1)}
                className="bg-zinc-900 border-zinc-800 h-7 w-20 text-xs text-center"
              />
              <span className="text-xs font-semibold text-emerald-400">{unit || '—'}</span>
            </div>
            <p className="text-[9px] text-zinc-500 italic text-center">
              Conversion rate — how many Storage Units are in 1 Purchase Unit.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
