'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowUp, ArrowDown, Calendar, Search } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export default function StockLedgerPage() {
  const [ledger, setLedger] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchLedger() {
      setLoading(true)
      const { data, error } = await supabase
        .from('stock_ledger')
        .select(`
          *,
          item_master (
            name,
            unit
          )
        `)
        .eq('outlet_id', selectedOutletId)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setLedger(data)
      }
      setLoading(false)
    }

    fetchLedger()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOutletId])

  const getTxnBadge = (type: string) => {
    switch (type) {
      case 'IN': return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Purchase IN</Badge>
      case 'OUT': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Stock OUT</Badge>
      case 'PRODUCTION_IN': return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Production IN</Badge>
      case 'PRODUCTION_OUT': return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Production OUT</Badge>
      case 'OPNAME_ADJ': return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Adjustment</Badge>
      default: return <Badge variant="outline">{type}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="icon" className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Stock Ledger</h2>
          <p className="text-zinc-400 text-sm">Historical movement of all items in this outlet.</p>
        </div>
      </div>

      <div className="flex items-center gap-4 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input 
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm text-zinc-100 focus:border-zinc-700 focus:outline-none"
            placeholder="Search transactions..."
          />
        </div>
        <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400">
          <Calendar className="mr-2 h-4 w-4" />
          Date Range
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Timestamp</TableHead>
              <TableHead className="text-zinc-400">Item</TableHead>
              <TableHead className="text-zinc-400">Type</TableHead>
              <TableHead className="text-zinc-400 text-right">Quantity</TableHead>
              <TableHead className="text-zinc-400 text-right">Unit Cost</TableHead>
              <TableHead className="text-zinc-400 text-right">Total Value</TableHead>
              <TableHead className="text-zinc-400">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">
                  Loading ledger entries...
                </TableCell>
              </TableRow>
            ) : ledger.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">
                  No stock movements recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              ledger.map((entry) => (
                <TableRow key={entry.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-500 text-xs">
                    {format(new Date(entry.created_at), 'dd MMM yyyy, HH:mm')}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-200">{entry.item_master?.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{entry.item_master?.unit}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getTxnBadge(entry.txn_type)}</TableCell>
                  <TableCell className="text-right font-medium">
                    <div className="flex items-center justify-end gap-1">
                      {entry.qty > 0 ? <ArrowDown className="h-3 w-3 text-emerald-500" /> : <ArrowUp className="h-3 w-3 text-red-500" />}
                      <span className={entry.qty > 0 ? "text-emerald-500" : "text-red-500"}>
                        {Math.abs(entry.qty)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-zinc-400 text-xs">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(entry.unit_cost)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-100 font-bold">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(entry.total_value)}
                  </TableCell>
                  <TableCell className="text-zinc-500 text-[10px] truncate max-w-[100px]">
                    {entry.reference_type} / {entry.reference_id?.slice(0, 8)}...
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
