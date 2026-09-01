'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, PackageCheck, Loader2, AlertTriangle, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'

export default function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: grId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useLanguage()

  const [gr, setGr] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const fetchGr = async () => {
    setLoading(true)
    const { data: grData } = await supabase.from('goods_receipts').select('*, purchase_orders(po_number, vendors(name))').eq('id', grId).single()
    setGr(grData)

    const { data: lineData } = await supabase.from('gr_lines').select('*, item_master(name)').eq('gr_id', grId)
    setLines(lineData || [])
    setLoading(false)
  }

  useEffect(() => { fetchGr() }, [grId])

  const handleVoid = async () => {
    setVoiding(true)
    const { error } = await supabase.rpc('void_goods_receipt', { p_gr_id: grId })
    setVoiding(false)
    setVoidDialogOpen(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('purchasing.gr.detail.successVoided'))
      fetchGr()
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">{t('purchasing.gr.detail.loading')}</div>
  if (!gr) return (
    <div className="py-20 text-center space-y-4">
      <p className="text-zinc-400">{t('purchasing.gr.detail.notFound')}</p>
      <Link href="/purchasing/gr"><Button variant="outline" className="border-zinc-800 text-zinc-300">{t('purchasing.gr.detail.backToGrList')}</Button></Link>
    </div>
  )

  const total = lines.reduce((s, l) => s + l.qty_received * l.unit_cost, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="space-y-1">
          <Link href="/purchasing/gr" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="h-4 w-4" /> {t('purchasing.gr.detail.backToList')}
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-indigo-400" />
            {t('purchasing.gr.detail.title')}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={gr.status === 'voided' ? 'bg-red-950/30 text-red-400 border-red-900/50' : 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50'}>
              {t(`statusLabel.${gr.status}`)}
            </Badge>
            <span className="text-xs text-zinc-500">
              {gr.purchase_orders?.po_number} — {gr.purchase_orders?.vendors?.name} — {format(new Date(gr.receipt_date), 'dd MMM yyyy')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {gr.status === 'posted' && (
            <>
              <Button onClick={() => router.push(`/purchasing/gr/${grId}/return`)} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs gap-1.5">
                <Undo2 className="h-3.5 w-3.5" /> {t('purchasing.gr.detail.createReturn')}
              </Button>
              <Button variant="outline" onClick={() => setVoidDialogOpen(true)} className="border-zinc-700 text-red-400 hover:bg-red-500/10 text-xs">
                {t('purchasing.gr.detail.voidButton')}
              </Button>
            </>
          )}
        </div>
      </div>

      {gr.notes && <p className="text-sm text-zinc-400">{gr.notes}</p>}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">{t('purchasing.gr.detail.colItem')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.gr.detail.colQtyReceived')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.gr.detail.colUnitCost')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.gr.detail.colTotal')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id} className="border-zinc-800">
                <TableCell className="text-zinc-100">{line.item_master?.name || '—'}</TableCell>
                <TableCell className="text-zinc-300 font-mono">{line.qty_received}</TableCell>
                <TableCell className="text-zinc-400 font-mono">{formatRp(line.unit_cost)}</TableCell>
                <TableCell className="text-zinc-100 font-semibold font-mono">{formatRp(line.qty_received * line.unit_cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end p-4 border-t border-zinc-800 text-sm">
          <span className="text-zinc-400 mr-3">{t('purchasing.gr.detail.totalLabel')}</span>
          <span className="text-zinc-100 font-bold font-mono">{formatRp(total)}</span>
        </div>
      </div>

      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />{t('purchasing.gr.detail.voidDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>{t('purchasing.gr.detail.voidDialogDesc')}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>{t('common.cancel')}</AlertDialogCancel>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleVoid} disabled={voiding}>
              {voiding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('purchasing.gr.detail.voidReceiptButton')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
