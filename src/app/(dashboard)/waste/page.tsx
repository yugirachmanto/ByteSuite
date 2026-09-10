'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useDateWindow } from '@/lib/contexts/date-window-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Loader2, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'

const REASON_LABELS: Record<string, string> = {
  spoilage: 'Spoilage',
  expired: 'Expired',
  damaged: 'Damaged',
  prep_waste: 'Prep Waste',
  other: 'Other',
}

const REASON_COLORS: Record<string, string> = {
  spoilage: 'bg-red-950/30 text-red-400 border-red-900/50',
  expired: 'bg-amber-950/30 text-amber-400 border-amber-900/50',
  damaged: 'bg-orange-950/30 text-orange-400 border-orange-900/50',
  prep_waste: 'bg-blue-950/30 text-blue-400 border-blue-900/50',
  other: 'bg-zinc-800 text-zinc-400 border-zinc-700',
}

export default function WastePage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const { startDate, endDate } = useDateWindow()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedOutletId) return
    async function fetchLogs() {
      setLoading(true)
      const { data } = await supabase
        .from('waste_log')
        .select('*, item_master(name, unit)')
        .eq('outlet_id', selectedOutletId)
        .gte('waste_date', format(startDate, 'yyyy-MM-dd'))
        .lte('waste_date', format(endDate, 'yyyy-MM-dd'))
        .order('waste_date', { ascending: false })
      setLogs(data || [])
      setLoading(false)
    }
    fetchLogs()
  }, [selectedOutletId, startDate, endDate, supabase])

  const totalCost = logs.reduce((s, l) => s + (l.total_value || 0), 0)
  const byReason = logs.reduce((acc: Record<string, number>, l) => {
    acc[l.reason] = (acc[l.reason] || 0) + (l.total_value || 0)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Waste / Spoilage</h2>
          <p className="text-zinc-400 text-sm">Log waste as it happens — separate from the weekly opname count.</p>
        </div>
        <Link href="/waste/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="mr-2 h-4 w-4" />
            Log Waste
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Waste Cost (this period)</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatRp(totalCost)}
            </div>
            <p className="text-xs text-zinc-500 mt-1">{logs.length} entr{logs.length === 1 ? 'y' : 'ies'} for {format(startDate, 'dd MMM')} – {format(endDate, 'dd MMM yyyy')}</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">By Reason</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(byReason).length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No waste logged this period.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(byReason).map(([reason, value]) => (
                  <Badge key={reason} variant="outline" className={REASON_COLORS[reason] || REASON_COLORS.other}>
                    {REASON_LABELS[reason] || reason}: {formatRp(value)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Date</TableHead>
              <TableHead className="text-zinc-400">Item</TableHead>
              <TableHead className="text-zinc-400 text-right">Qty</TableHead>
              <TableHead className="text-zinc-400 text-right">Cost</TableHead>
              <TableHead className="text-zinc-400">Reason</TableHead>
              <TableHead className="text-zinc-400">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-30" />
                  Loading waste history...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  <Trash2 className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  No waste logged for this period.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-300">{format(new Date(log.waste_date), 'dd MMM yyyy')}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">{log.item_master?.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{log.item_master?.unit}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-zinc-300 font-mono">{log.qty}</TableCell>
                  <TableCell className="text-right text-red-400/90 font-mono font-medium">{formatRp(log.total_value)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={REASON_COLORS[log.reason] || REASON_COLORS.other}>
                      {REASON_LABELS[log.reason] || log.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500 text-sm">{log.notes || '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
