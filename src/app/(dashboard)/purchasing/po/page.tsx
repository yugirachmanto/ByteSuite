'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ShoppingCart, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  pending_approval: 'bg-amber-950/30 text-amber-400 border-amber-900/50',
  approved: 'bg-blue-950/30 text-blue-400 border-blue-900/50',
  released: 'bg-indigo-950/30 text-indigo-400 border-indigo-900/50',
  partially_received: 'bg-amber-950/30 text-amber-400 border-amber-900/50',
  received: 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50',
  closed: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  cancelled: 'bg-red-950/30 text-red-400 border-red-900/50',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  released: 'Released',
  partially_received: 'Partially Received',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [pos, setPos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedOutletId) return
    async function fetchPos() {
      setLoading(true)
      const { data } = await supabase
        .from('purchase_orders')
        .select('*, vendors(name), po_lines(qty, unit_price, total)')
        .eq('outlet_id', selectedOutletId)
        .order('created_at', { ascending: false })
      setPos(data || [])
      setLoading(false)
    }
    fetchPos()
  }, [selectedOutletId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-indigo-400" />
            Purchase Orders
          </h2>
          <p className="text-zinc-400 text-sm">Draft, approve and release orders to vendors.</p>
        </div>
        <Link href="/purchasing/po/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="mr-2 h-4 w-4" /> New PO
          </Button>
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">PO Number</TableHead>
              <TableHead className="text-zinc-400">Vendor</TableHead>
              <TableHead className="text-zinc-400">Date</TableHead>
              <TableHead className="text-zinc-400">Total</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="h-32 text-center text-zinc-600">Loading purchase orders…</TableCell></TableRow>
            ) : pos.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-32 text-center text-zinc-500 text-sm">No purchase orders yet.</TableCell></TableRow>
            ) : (
              pos.map((po) => {
                const total = (po.po_lines || []).reduce((s: number, l: any) => s + (l.total || 0), 0)
                return (
                  <TableRow
                    key={po.id}
                    className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                    onClick={() => router.push(`/purchasing/po/${po.id}`)}
                  >
                    <TableCell className="text-zinc-100 font-mono text-sm">{po.po_number || <span className="text-zinc-600">Draft</span>}</TableCell>
                    <TableCell className="text-zinc-300">{po.vendors?.name || '—'}</TableCell>
                    <TableCell className="text-zinc-400">{format(new Date(po.created_at), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-zinc-100 font-semibold font-mono">{formatRp(total)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[po.status] || ''}>{STATUS_LABEL[po.status] || po.status}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
