'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { History, Loader2, ChevronRight } from 'lucide-react'
import { formatRp } from '@/lib/format'
import { format } from 'date-fns'

interface ShiftRow {
  id: string
  status: string
  cashier_name: string | null
  opened_at: string
  closed_at: string | null
  opening_float: number
  closing_counted: number | null
  expected_cash: number | null
  variance: number | null
}

export default function ShiftHistoryPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchShifts() {
      if (!selectedOutletId) return
      setLoading(true)
      const { data: shiftRows } = await supabase
        .from('pos_shifts')
        .select('id, status, cashier_id, opened_at, closed_at, opening_float, closing_counted, expected_cash, variance')
        .eq('outlet_id', selectedOutletId)
        .order('opened_at', { ascending: false })
        .limit(100)

      const cashierIds = Array.from(new Set((shiftRows || []).map(s => s.cashier_id).filter(Boolean)))
      const { data: cashiers } = cashierIds.length > 0
        ? await supabase.from('user_profiles').select('id, full_name').in('id', cashierIds)
        : { data: [] as any[] }
      const cashierMap = new Map((cashiers || []).map(c => [c.id, c.full_name]))

      setShifts((shiftRows || []).map(s => ({
        id: s.id,
        status: s.status,
        cashier_name: cashierMap.get(s.cashier_id) || null,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        opening_float: s.opening_float,
        closing_counted: s.closing_counted,
        expected_cash: s.expected_cash,
        variance: s.variance,
      })))
      setLoading(false)
    }
    fetchShifts()
  }, [supabase, selectedOutletId])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <History className="h-6 w-6 text-indigo-400" /> Riwayat Shift
        </h2>
        <p className="text-zinc-400 text-sm">Rekonsiliasi kas dan penjualan setiap shift POS.</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden backdrop-blur-sm">
          <Table>
            <TableHeader className="bg-zinc-900/50 border-zinc-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-zinc-400">Dibuka</TableHead>
                <TableHead className="text-zinc-400">Ditutup</TableHead>
                <TableHead className="text-zinc-400">Kasir</TableHead>
                <TableHead className="text-zinc-400 text-right">Modal Awal</TableHead>
                <TableHead className="text-zinc-400 text-right">Dihitung</TableHead>
                <TableHead className="text-zinc-400 text-center">Selisih</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-zinc-500 italic">
                    Belum ada riwayat shift.
                  </TableCell>
                </TableRow>
              ) : (
                shifts.map((s) => (
                  <TableRow key={s.id} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors group">
                    <TableCell className="text-zinc-300 text-sm">{format(new Date(s.opened_at), 'dd MMM yyyy, HH:mm')}</TableCell>
                    <TableCell className="text-zinc-300 text-sm">
                      {s.closed_at ? format(new Date(s.closed_at), 'dd MMM yyyy, HH:mm') : (
                        <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">Berjalan</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm">{s.cashier_name || '—'}</TableCell>
                    <TableCell className="text-right text-zinc-300 font-mono text-sm">{formatRp(s.opening_float)}</TableCell>
                    <TableCell className="text-right text-zinc-300 font-mono text-sm">
                      {s.closing_counted != null ? formatRp(s.closing_counted) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {s.status === 'closed' && s.variance != null ? (
                        s.variance === 0 ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Balanced</Badge>
                        ) : s.variance > 0 ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">Over {formatRp(s.variance)}</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">Short {formatRp(Math.abs(s.variance))}</Badge>
                        )
                      ) : (
                        <span className="text-zinc-600 text-xs italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/pos/shift-report/${s.id}`} target="_blank">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 group-hover:text-zinc-100 transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
