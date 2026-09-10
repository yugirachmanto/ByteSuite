'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { ArrowLeft, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

const REASONS = [
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'expired', label: 'Expired' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'prep_waste', label: 'Prep Waste' },
  { value: 'other', label: 'Other' },
]

export default function NewWastePage() {
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState<number>(0)
  const [wasteDate, setWasteDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [reason, setReason] = useState('spoilage')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    async function init() {
      if (!selectedOutletId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) { setLoading(false); return }
      setOrgId(profile.org_id)

      // Only inventory-tracked items with stock on hand can be wasted —
      // direct-expense items never have an inventory_balance row.
      const { data } = await supabase
        .from('inventory_balance')
        .select('item_id, qty_on_hand, item_master(id, name, unit)')
        .eq('outlet_id', selectedOutletId)
        .gt('qty_on_hand', 0)
      const rows = (data || []) as any[]
      setItems(rows.sort((a, b) => (a.item_master?.name || '').localeCompare(b.item_master?.name || '')))
      setLoading(false)
    }
    init()
  }, [selectedOutletId])

  const selectedItem = items.find((i) => i.item_id === itemId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemId) {
      toast.error('Select an item to log waste for.')
      return
    }
    if (!qty || qty <= 0) {
      toast.error('Enter a quantity greater than 0.')
      return
    }
    if (!selectedOutletId || !orgId) {
      toast.error('Outlet or organization not resolved.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('post_waste', {
        p_outlet_id: selectedOutletId,
        p_org_id: orgId,
        p_item_id: itemId,
        p_qty: qty,
        p_waste_date: wasteDate,
        p_reason: reason,
        p_notes: notes || null,
      })

      if (error) throw error

      toast.success('Waste logged.')
      // Reset for the next item — kitchen staff often report several in a row.
      setItemId('')
      setQty(0)
      setNotes('')
      router.push('/waste')
    } catch (err: any) {
      toast.error(err.message || 'Failed to log waste')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">Loading…</div>

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Link href="/waste" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Waste
      </Link>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Log Waste</h1>
            <p className="text-xs text-zinc-400">Only items tracked as inventory can be logged here.</p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-500 italic py-6 text-center">No inventory-tracked items with stock on hand at this outlet.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Item</label>
              <select
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 h-10 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select item…</option>
                {items.map((i) => (
                  <option key={i.item_id} value={i.item_id}>{i.item_master?.name} ({i.qty_on_hand} {i.item_master?.unit} on hand)</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Quantity {selectedItem && <span className="text-zinc-500 font-normal">({selectedItem.item_master?.unit})</span>}
                </label>
                <Input
                  type="number" min="0" step="any" value={qty || ''}
                  onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
                  max={selectedItem?.qty_on_hand}
                  className="bg-zinc-950 border-zinc-800 h-10 text-zinc-100"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Date</label>
                <DatePicker value={wasteDate} onChange={setWasteDate} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 h-10 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Notes (Optional)</label>
              <textarea
                rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. found spoiled during prep"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <Link href="/waste">
                <Button type="button" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
              </Link>
              <Button type="submit" disabled={submitting} className="bg-red-600 hover:bg-red-500 text-white gap-2 font-medium">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Log Waste
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
