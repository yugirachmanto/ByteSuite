'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Package,
  TrendingUp,
  Layers,
  Loader2,
} from 'lucide-react'
import { format } from 'date-fns'

export default function ItemDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  const [item, setItem] = useState<any>(null)
  const [balance, setBalance] = useState<any>(null)
  const [ledger, setLedger] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedOutletId || !params.id) return

    async function fetchData() {
      setLoading(true)

      // Fetch item master
      const { data: itemData } = await supabase
        .from('item_master')
        .select('*')
        .eq('id', params.id)
        .single()

      // Fetch inventory balance
      const { data: balanceData } = await supabase
        .from('inventory_balance')
        .select('*')
        .eq('outlet_id', selectedOutletId)
        .eq('item_id', params.id)
        .single()

      // Fetch stock ledger for this item
      const { data: ledgerData } = await supabase
        .from('stock_ledger')
        .select('*')
        .eq('outlet_id', selectedOutletId)
        .eq('item_id', params.id)
        .order('created_at', { ascending: false })

      setItem(itemData)
      setBalance(balanceData)
      setLedger(ledgerData || [])
      setLoading(false)
    }

    fetchData()
  }, [selectedOutletId, params.id])

  const getTxnBadge = (type: string) => {
    switch (type) {
      case 'IN': return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Purchase IN</Badge>
      case 'OUT': return <Badge className="bg-red-500/10 text-red-400 border-red-500/20">Stock OUT</Badge>
      case 'PRODUCTION_IN': return <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">Production IN</Badge>
      case 'PRODUCTION_OUT': return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">Production OUT</Badge>
      case 'OPNAME_ADJ': return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Adjustment</Badge>
      default: return <Badge variant="outline">{type}</Badge>
    }
  }

  const getCategoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      raw: 'Raw Material',
      wip: 'WIP',
      packaging: 'Packaging',
      finished: 'Finished Goods',
    }
    return map[cat] || cat
  }

  const avgUnitCost = balance && balance.qty_on_hand > 0
    ? balance.inventory_value / balance.qty_on_hand
    : 0

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-zinc-400">Item not found.</p>
        <Button variant="ghost" onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-zinc-400">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">{item.name}</h2>
            <Badge variant="outline" className="text-zinc-400 border-zinc-700">{getCategoryLabel(item.category)}</Badge>
            {item.code && (
              <span className="text-xs text-zinc-600 font-mono">#{item.code}</span>
            )}
          </div>
          <p className="text-zinc-400 text-sm mt-0.5">Stock movement history for this item in the current outlet.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Qty On Hand</CardTitle>
            <Package className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-100">
              {balance?.qty_on_hand ?? 0}
              <span className="text-sm font-normal text-zinc-500 ml-2">{item.unit}</span>
            </div>
            {item.reorder_level > 0 && (
              <p className={`text-xs mt-1 ${(balance?.qty_on_hand ?? 0) <= item.reorder_level ? 'text-amber-500' : 'text-zinc-500'}`}>
                Reorder at {item.reorder_level} {item.unit}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Inventory Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(balance?.inventory_value ?? 0)}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Avg cost: {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(avgUnitCost)} / {item.unit}
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Movements</CardTitle>
            <Layers className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-100">{ledger.length}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {ledger.filter(e => e.txn_type === 'IN').length} in · {ledger.filter(e => e.txn_type === 'OUT').length} out
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="border-b border-zinc-800 py-3">
          <CardTitle className="text-sm font-medium text-zinc-400">Stock Movement History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-zinc-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-zinc-400">Date</TableHead>
                <TableHead className="text-zinc-400">Type</TableHead>
                <TableHead className="text-zinc-400 text-right">Qty</TableHead>
                <TableHead className="text-zinc-400 text-right">Unit Cost</TableHead>
                <TableHead className="text-zinc-400 text-right">Total Value</TableHead>
                <TableHead className="text-zinc-400">Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                    No stock movements recorded for this item yet.
                  </TableCell>
                </TableRow>
              ) : (
                ledger.map((entry) => (
                  <TableRow key={entry.id} className="border-zinc-800 hover:bg-zinc-800/30">
                    <TableCell className="text-zinc-400 text-xs">
                      {format(new Date(entry.created_at), 'dd MMM yyyy, HH:mm')}
                    </TableCell>
                    <TableCell>{getTxnBadge(entry.txn_type)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {entry.qty > 0
                          ? <ArrowDown className="h-3 w-3 text-emerald-500" />
                          : <ArrowUp className="h-3 w-3 text-red-500" />
                        }
                        <span className={entry.qty > 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                          {Math.abs(entry.qty)} {item.unit}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-zinc-400 text-xs">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(entry.unit_cost)}
                    </TableCell>
                    <TableCell className="text-right text-zinc-100 font-bold text-sm">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(entry.total_value)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{entry.reference_type}</span>
                        <span className="text-xs text-zinc-600 font-mono">{entry.reference_id?.slice(0, 8)}...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
