'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StageStrip } from '@/components/procurement/StageStrip'
import { computeStageInfo, type StageInfo } from '@/lib/procurement/stage'
import { Workflow } from 'lucide-react'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'
import { cn } from '@/lib/utils'

type FilterKey = 'all' | 'needs_receiving' | 'needs_invoice' | 'complete'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_receiving', label: 'Needs Receiving' },
  { key: 'needs_invoice', label: 'Needs Invoice' },
  { key: 'complete', label: 'Complete' },
]

interface Row {
  po: { id: string; status: string; po_number: string | null; vendor_name: string; created_at: string; total: number }
  stages: StageInfo[]
}

function classify(stages: StageInfo[]): FilterKey {
  const gr = stages.find(s => s.key === 'gr')!
  const invoice = stages.find(s => s.key === 'invoice')!
  if (invoice.status === 'done') return 'complete'
  if (gr.status !== 'done') return 'needs_receiving'
  return 'needs_invoice'
}

export default function ProcurementPipelinePage() {
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    if (!selectedOutletId) return
    async function fetchPipeline() {
      setLoading(true)

      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('id, status, po_number, pr_id, created_at, vendors(name), po_lines(total)')
        .eq('outlet_id', selectedOutletId)
        .order('created_at', { ascending: false })

      if (!pos || pos.length === 0) { setRows([]); setLoading(false); return }

      const poIds = pos.map(p => p.id)
      const prIds = pos.map(p => p.pr_id).filter(Boolean) as string[]

      const [prsRes, receiptsRes, invoicesRes] = await Promise.all([
        prIds.length > 0
          ? supabase.from('purchase_requisitions').select('id, status').in('id', prIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('goods_receipts').select('id, po_id, status').in('po_id', poIds).eq('status', 'posted'),
        supabase.from('invoices').select('id, po_id, status').in('po_id', poIds),
      ])

      const prById = new Map((prsRes.data || []).map((pr: any) => [pr.id, pr]))
      const receiptsByPo = new Map<string, any[]>()
      for (const gr of receiptsRes.data || []) {
        const list = receiptsByPo.get(gr.po_id) || []
        list.push(gr)
        receiptsByPo.set(gr.po_id, list)
      }
      const invoiceByPo = new Map((invoicesRes.data || []).map((inv: any) => [inv.po_id, inv]))

      const computed: Row[] = pos.map((po: any) => {
        const chain = {
          pr: po.pr_id ? (prById.get(po.pr_id) || null) : null,
          po: { id: po.id, status: po.status, po_number: po.po_number },
          receipts: receiptsByPo.get(po.id) || [],
          invoice: invoiceByPo.get(po.id) || null,
        }
        const total = (po.po_lines || []).reduce((s: number, l: any) => s + (l.total || 0), 0)
        return {
          po: { id: po.id, status: po.status, po_number: po.po_number, vendor_name: po.vendors?.name || '—', created_at: po.created_at, total },
          stages: computeStageInfo(chain),
        }
      })

      setRows(computed)
      setLoading(false)
    }
    fetchPipeline()
  }, [selectedOutletId])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter(r => classify(r.stages) === filter)
  }, [rows, filter])

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: rows.length, needs_receiving: 0, needs_invoice: 0, complete: 0 }
    for (const r of rows) c[classify(r.stages)]++
    return c
  }, [rows])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Workflow className="h-6 w-6 text-indigo-400" />
            Procurement Pipeline
          </h2>
          <p className="text-zinc-400 text-sm">See every purchase order and where it stands from requisition to invoice.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-lg border px-3 h-8 text-xs font-medium transition-colors',
              filter === f.key ? 'bg-zinc-100 border-zinc-100 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            )}
          >
            {f.label} <span className="ml-1.5 opacity-60">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">PO Number</TableHead>
              <TableHead className="text-zinc-400">Vendor</TableHead>
              <TableHead className="text-zinc-400">Date</TableHead>
              <TableHead className="text-zinc-400">Total</TableHead>
              <TableHead className="text-zinc-400">Pipeline</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="h-32 text-center text-zinc-600">Loading...</TableCell></TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-32 text-center text-zinc-500 text-sm">No purchase orders found.</TableCell></TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow
                  key={row.po.id}
                  className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                  onClick={() => router.push(`/purchasing/po/${row.po.id}`)}
                >
                  <TableCell className="text-zinc-100 font-mono text-sm">{row.po.po_number || <span className="text-zinc-600">Draft</span>}</TableCell>
                  <TableCell className="text-zinc-300">{row.po.vendor_name}</TableCell>
                  <TableCell className="text-zinc-400">{format(new Date(row.po.created_at), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-zinc-100 font-semibold font-mono">{formatRp(row.po.total)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <StageStrip stages={row.stages} size="compact" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
