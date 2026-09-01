'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { ArrowLeft, Plus, Trash2, Loader2, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'

interface Line {
  item_id: string
  qty: number
  unit: string
  notes: string
}

interface Item {
  id: string
  name: string
  unit: string
  purchase_unit: string | null
}

export default function NewRequisitionPage() {
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [items, setItems] = useState<Item[]>([])
  const [neededByDate, setNeededByDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty: 1, unit: '', notes: '' }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchItems() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) return
      const { data } = await supabase.from('item_master').select('id, name, unit, purchase_unit').eq('org_id', profile.org_id).order('name')
      setItems(data || [])
    }
    fetchItems()
  }, [])

  const addLine = () => setLines([...lines, { item_id: '', qty: 1, unit: '', notes: '' }])
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx))
  const updateLine = (idx: number, field: keyof Line, value: any) => {
    const updated = [...lines]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === 'item_id') {
      const item = items.find((i) => i.id === value)
      if (item) updated[idx].unit = item.purchase_unit || item.unit
    }
    setLines(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validLines = lines.filter((l) => l.item_id && l.qty > 0)
    if (validLines.length === 0) {
      toast.error('Add at least one item with a quantity.')
      return
    }
    if (!selectedOutletId) {
      toast.error('Select an outlet first.')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: pr, error: prError } = await supabase
        .from('purchase_requisitions')
        .insert({
          outlet_id: selectedOutletId,
          status: 'pending_approval',
          needed_by_date: neededByDate || null,
          notes: notes || null,
          requested_by: user?.id,
        })
        .select('id')
        .single()

      if (prError) throw prError

      const { error: linesError } = await supabase.from('pr_lines').insert(
        validLines.map((l) => ({ pr_id: pr.id, item_id: l.item_id, qty: l.qty, unit: l.unit, notes: l.notes || null }))
      )
      if (linesError) throw linesError

      toast.success('Requisition submitted for approval.')
      router.push(`/purchasing/pr/${pr.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create requisition')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/purchasing/pr" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Requisitions
      </Link>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">New Purchase Requisition</h1>
            <p className="text-xs text-zinc-400">List what's needed — vendor and pricing come later at PO stage.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Needed By</label>
              <DatePicker value={neededByDate} onChange={setNeededByDate} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for this request…"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">Items Needed <span className="text-zinc-500 font-normal">(quantities in Purchase Unit)</span></label>
              <Button type="button" size="sm" variant="outline" onClick={addLine} className="border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5">
                  <select
                    value={line.item_id}
                    onChange={(e) => updateLine(idx, 'item_id', e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg h-9 text-sm px-2 text-zinc-100"
                  >
                    <option value="">Select item…</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.qty}
                    onChange={(e) => updateLine(idx, 'qty', parseFloat(e.target.value) || 0)}
                    className="w-24 bg-zinc-900 border border-zinc-800 rounded-lg h-9 text-sm px-2 text-zinc-100"
                    placeholder="Qty"
                  />
                  <span className="w-16 text-xs text-zinc-500">{line.unit || '—'}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(idx)} className="h-9 w-9 text-zinc-500 hover:text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Link href="/purchasing/pr">
              <Button type="button" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
            </Link>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit for Approval
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
