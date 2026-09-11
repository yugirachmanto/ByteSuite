'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeStageInfo, type ProcurementChain } from '@/lib/procurement/stage'
import { StageStrip } from './StageStrip'
import { Loader2 } from 'lucide-react'

interface ProcurementTrackerProps {
  poId: string
  label?: string
}

export function ProcurementTracker({ poId, label }: ProcurementTrackerProps) {
  const supabase = createClient()
  const [chain, setChain] = useState<ProcurementChain | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchChain() {
      setLoading(true)
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('id, status, po_number, pr_id')
        .eq('id', poId)
        .single()

      if (!po) { if (!cancelled) setLoading(false); return }

      const [prRes, receiptsRes, invoiceRes] = await Promise.all([
        po.pr_id
          ? supabase.from('purchase_requisitions').select('id, status').eq('id', po.pr_id).single()
          : Promise.resolve({ data: null }),
        supabase.from('goods_receipts').select('id, status').eq('po_id', poId).eq('status', 'posted'),
        supabase.from('invoices').select('id, status').eq('po_id', poId).maybeSingle(),
      ])

      if (cancelled) return
      setChain({
        pr: prRes.data,
        po: { id: po.id, status: po.status, po_number: po.po_number },
        receipts: receiptsRes.data || [],
        invoice: invoiceRes.data,
      })
      setLoading(false)
    }
    fetchChain()
    return () => { cancelled = true }
  }, [poId])

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex items-center text-zinc-600 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading pipeline...
      </div>
    )
  }

  if (!chain) return null

  const stages = computeStageInfo(chain)

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      {label && <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-3">{label}</p>}
      <StageStrip stages={stages} size="default" />
    </div>
  )
}
