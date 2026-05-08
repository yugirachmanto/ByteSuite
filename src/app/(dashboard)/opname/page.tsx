'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Plus, ClipboardList, TrendingDown, TrendingUp, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export default function OpnamePage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchLogs() {
      setLoading(true)
      const { data, error } = await supabase
        .from('opname_log')
        .select(`
          *,
          item_master (
            name,
            unit
          )
        `)
        .eq('outlet_id', selectedOutletId)
        .order('opname_date', { ascending: false })

      if (!error && data) {
        setLogs(data)
      }
      setLoading(false)
    }

    fetchLogs()
  }, [selectedOutletId, supabase])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Stock Opname</h2>
          <p className="text-zinc-400 text-sm">Review weekly physical count history and variances.</p>
        </div>
        <Link href="/opname/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="mr-2 h-4 w-4" />
            New Physical Count
          </Button>
        </Link>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Opname Date</TableHead>
              <TableHead className="text-zinc-400">Item</TableHead>
              <TableHead className="text-zinc-400 text-right">System Qty</TableHead>
              <TableHead className="text-zinc-400 text-right">Physical Qty</TableHead>
              <TableHead className="text-zinc-400 text-right">Variance</TableHead>
              <TableHead className="text-zinc-400 text-right">Value Adjustment</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">
                  Loading opname history...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">
                  No physical counts recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-300">
                    {format(new Date(log.opname_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">{log.item_master?.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{log.item_master?.unit}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-zinc-400">
                    {log.system_qty}
                  </TableCell>
                  <TableCell className="text-right text-zinc-100 font-medium">
                    {log.physical_qty}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    <div className="flex items-center justify-end gap-1">
                      {log.variance > 0 ? (
                        <span className="text-emerald-500">+{log.variance}</span>
                      ) : log.variance < 0 ? (
                        <span className="text-red-500">{log.variance}</span>
                      ) : (
                        <span className="text-zinc-500">0</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={log.variance_value >= 0 ? "text-emerald-500/80" : "text-red-500/80"}>
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(log.variance_value || 0)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-zinc-700" />
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
