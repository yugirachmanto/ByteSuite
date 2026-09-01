'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Undo2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function CreateReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: grId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [gr, setGr] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      setOrgId(profile?.org_id || null)

      const { data: grData } = await supabase.from('goods_receipts').select('*, purchase_orders(po_number, vendors(name))').eq('id', grId).single()
      setGr(grData)

      const { data: grLines } = await supabase.from('gr_lines').select('*, po_lines(returned_qty), item_master(name)').eq('gr_id', grId)
      setLines(
        (grLines || [])
          .filter((l: any) => (l.po_lines?.returned_qty || 0) < l.qty_received - 0.0001)
          .map((l: any) => ({
            gr_line_id: l.id,
            item_id: l.item_id,
            item_name: l.item_master?.name || '—',
            available: l.qty_received - (l.po_lines?.returned_qty || 0),
            qty_returned: 0,
            coa_id: l.unit_cost ? null : null, // resolved below from item_master default
          }))
      )

      // resolve default coa per item for the return's expense/reversal line
      const itemIds = (grLines || []).map((l: any) => l.item_id)
      if (itemIds.length > 0) {
        const { data: itemData } = await supabase.from('item_master').select('id, default_coa_id').in('id', itemIds)
        const coaMap = new Map((itemData || []).map((i) => [i.id, i.default_coa_id]))
        setLines((prev) => prev.map((l) => ({ ...l, coa_id: coaMap.get(l.item_id) || null })))
      }

      setLoading(false)
    }
    init()
  }, [grId])

  const updateLine = (idx: number, field: string, value: any) => {
    const updated = [...lines]
    updated[idx] = { ...updated[idx], [field]: value }
    setLines(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validLines = lines.filter((l) => l.qty_returned > 0)
    if (validLines.length === 0) {
      toast.error('Enter a return quantity for at least one line.')
      return
    }
    if (!selectedOutletId || !orgId) {
      toast.error('Outlet or organization not resolved.')
      return
    }
    if (validLines.some((l) => !l.coa_id)) {
      toast.error('One or more items has no default account configured.')
      return
    }

    setSaving(true)
    try {
      const { data: returnId, error } = await supabase.rpc('post_vendor_return', {
        p_gr_id: grId,
        p_outlet_id: selectedOutletId,
        p_org_id: orgId,
        p_return_date: returnDate,
        p_reason: reason || null,
        p_lines: validLines.map((l) => ({
          gr_line_id: l.gr_line_id,
          item_id: l.item_id,
          qty_returned: l.qty_returned,
          coa_id: l.coa_id,
        })),
      })

      if (error) throw error

      toast.success('Return posted — stock and GR/IR clearing updated.')
      router.push(`/purchasing/gr/${grId}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to post return')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">Loading…</div>
  if (lines.length === 0) return (
    <div className="py-20 text-center space-y-4">
      <p className="text-zinc-400">Nothing left to return from this receipt.</p>
      <Link href={`/purchasing/gr/${grId}`}><Button variant="outline" className="border-zinc-800 text-zinc-300">Back to Receipt</Button></Link>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href={`/purchasing/gr/${grId}`} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Receipt
      </Link>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Undo2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Return to Vendor</h1>
            <p className="text-xs text-zinc-400">{gr?.purchase_orders?.vendors?.name} — {gr?.purchase_orders?.po_number}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Return Date</label>
            <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)}
              className="w-full sm:w-48 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Items to Return</label>
            {lines.map((line, idx) => (
              <div key={line.gr_line_id} className="grid grid-cols-12 gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-3 items-center">
                <span className="col-span-5 text-sm text-zinc-100">{line.item_name}</span>
                <span className="col-span-3 text-xs text-zinc-500">Available: {line.available}</span>
                <input
                  type="number" min="0" max={line.available} step="any" value={line.qty_returned}
                  onChange={(e) => updateLine(idx, 'qty_returned', parseFloat(e.target.value) || 0)}
                  className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg h-9 text-sm px-2 text-zinc-100" placeholder="Return qty"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Reason</label>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. damaged in transit, wrong item…"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Link href={`/purchasing/gr/${grId}`}>
              <Button type="button" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
            </Link>
            <Button type="submit" disabled={saving} className="bg-amber-600 hover:bg-amber-500 text-white gap-2 font-medium">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Post Return
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
