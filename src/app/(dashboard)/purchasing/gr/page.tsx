'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useLanguage } from '@/lib/contexts/language-context'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PackageCheck } from 'lucide-react'
import { format } from 'date-fns'

export default function GoodsReceiptsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const { t } = useLanguage()
  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedOutletId) return
    async function fetchReceipts() {
      setLoading(true)
      const { data } = await supabase
        .from('goods_receipts')
        .select('*, purchase_orders(po_number, vendors(name)), gr_lines(qty_received)')
        .eq('outlet_id', selectedOutletId)
        .order('created_at', { ascending: false })
      setReceipts(data || [])
      setLoading(false)
    }
    fetchReceipts()
  }, [selectedOutletId])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-indigo-400" />
          {t('purchasing.gr.list.title')}
        </h2>
        <p className="text-zinc-400 text-sm">{t('purchasing.gr.list.subtitle')}</p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">{t('purchasing.gr.list.colDate')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.gr.list.colPoNumber')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.gr.list.colVendor')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.gr.list.colUnitsReceived')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.gr.list.colStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="h-32 text-center text-zinc-600">{t('purchasing.gr.list.loading')}</TableCell></TableRow>
            ) : receipts.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-32 text-center text-zinc-500 text-sm">{t('purchasing.gr.list.empty')}</TableCell></TableRow>
            ) : (
              receipts.map((gr) => {
                const qty = (gr.gr_lines || []).reduce((s: number, l: any) => s + (l.qty_received || 0), 0)
                return (
                  <TableRow key={gr.id} className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer" onClick={() => router.push(`/purchasing/gr/${gr.id}`)}>
                    <TableCell className="text-zinc-300">{format(new Date(gr.receipt_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-zinc-100 font-mono text-sm">{gr.purchase_orders?.po_number || '—'}</TableCell>
                    <TableCell className="text-zinc-300">{gr.purchase_orders?.vendors?.name || '—'}</TableCell>
                    <TableCell className="text-zinc-300 font-mono">{qty}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={gr.status === 'voided' ? 'bg-red-950/30 text-red-400 border-red-900/50' : 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50'}>
                        {t(`statusLabel.${gr.status}`)}
                      </Badge>
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
