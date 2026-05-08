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
import { Plus, Hammer, ClipboardList, ChevronRight, Calculator } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export default function ProductionPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchLogs() {
      setLoading(true)
      const { data, error } = await supabase
        .from('production_log')
        .select(`
          *,
          item_master (
            name,
            unit
          )
        `)
        .eq('outlet_id', selectedOutletId)
        .order('production_date', { ascending: false })

      if (!error && data) {
        const userIds = [...new Set(data.map(l => l.created_by).filter(Boolean))]
        let profileMap: Record<string, string> = {}
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', userIds)
          profiles?.forEach(p => { profileMap[p.id] = p.full_name })
        }
        setLogs(data.map(l => ({ ...l, _author: profileMap[l.created_by] || 'Unknown' })))
      }
      setLoading(false)
    }

    fetchLogs()
  }, [selectedOutletId, supabase])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Production Log</h2>
          <p className="text-zinc-400 text-sm">Track WIP production batches and ingredient deductions.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/production/bom">
            <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400">
              <Calculator className="mr-2 h-4 w-4" />
              Manage BOM
            </Button>
          </Link>
          <Link href="/production/new">
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              <Plus className="mr-2 h-4 w-4" />
              Log Production
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Date</TableHead>
              <TableHead className="text-zinc-400">WIP Item</TableHead>
              <TableHead className="text-zinc-400 text-right">Qty Produced</TableHead>
              <TableHead className="text-zinc-400 text-right">Unit Cost</TableHead>
              <TableHead className="text-zinc-400 text-right">Total Batch Value</TableHead>
              <TableHead className="text-zinc-400">Logged By</TableHead>
              <TableHead className="text-zinc-400">Notes</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-zinc-500">
                  Loading production logs...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-zinc-500">
                  No production records found. Log your first batch!
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer">
                  <TableCell className="text-zinc-300">
                    {format(new Date(log.production_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">{log.item_master?.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{log.item_master?.unit}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-zinc-100">
                    {log.qty_produced}
                  </TableCell>
                  <TableCell className="text-right text-zinc-400">
                    {log.unit_cost ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(log.unit_cost) : '-'}
                  </TableCell>
                  <TableCell className="text-right text-emerald-400 font-medium">
                    {log.unit_cost ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(log.unit_cost * log.qty_produced) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-300 font-medium">
                        {(log._author || 'U').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-zinc-400">{log._author || 'Unknown'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-500 text-sm italic max-w-[200px] truncate">
                    {log.notes || '-'}
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
