'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, ShoppingCart, Loader2, PackagePlus, FileText, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
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

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: poId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useLanguage()

  const [po, setPo] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [matchedInvoice, setMatchedInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const fetchPo = async () => {
    setLoading(true)
    const { data: poData } = await supabase.from('purchase_orders').select('*, vendors(name)').eq('id', poId).single()
    setPo(poData)

    const { data: lineData } = await supabase.from('po_lines').select('*, item_master(name)').eq('po_id', poId)
    setLines(lineData || [])

    const { data: grData } = await supabase.from('goods_receipts').select('*, gr_lines(qty_received)').eq('po_id', poId).order('created_at', { ascending: false })
    setReceipts(grData || [])

    const { data: invData } = await supabase.from('invoices').select('id, invoice_no').eq('po_id', poId).maybeSingle()
    setMatchedInvoice(invData)

    setLoading(false)
  }

  useEffect(() => { fetchPo() }, [poId])

  const handleApprove = async () => {
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('purchase_orders')
      .update({ status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() })
      .eq('id', poId)
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success(t('purchasing.po.detail.successApproved'))
    fetchPo()
  }

  const handleRelease = async () => {
    setBusy(true)
    const poNumber = `PO-${format(new Date(), 'yyyyMMdd')}-${Math.floor(1000 + Math.random() * 9000)}`
    const { error } = await supabase.from('purchase_orders').update({ status: 'released', po_number: poNumber }).eq('id', poId)
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success(t('purchasing.po.detail.successReleased', { number: poNumber }))
    fetchPo()
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">{t('purchasing.po.detail.loading')}</div>
  if (!po) return (
    <div className="py-20 text-center space-y-4">
      <p className="text-zinc-400">{t('purchasing.po.detail.notFound')}</p>
      <Link href="/purchasing/po"><Button variant="outline" className="border-zinc-800 text-zinc-300">{t('purchasing.po.list.title')}</Button></Link>
    </div>
  )

  const total = lines.reduce((s, l) => s + (l.total || 0), 0)
  const canReceive = ['released', 'partially_received'].includes(po.status)
  const hasReceivedAny = lines.some((l) => l.received_qty > 0)
  const canMatchInvoice = hasReceivedAny && !matchedInvoice

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="space-y-1">
          <Link href="/purchasing/po" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="h-4 w-4" /> {t('purchasing.po.detail.backToList')}
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-indigo-400" />
            {po.po_number || t('purchasing.po.detail.draftTitle')}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={STATUS_BADGE[po.status] || ''}>{t(`statusLabel.${po.status}`)}</Badge>
            <span className="text-xs text-zinc-500">{po.vendors?.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {['draft', 'pending_approval'].includes(po.status) && (
            <Button onClick={handleApprove} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('purchasing.po.detail.approve')}
            </Button>
          )}
          {po.status === 'approved' && (
            <Button onClick={handleRelease} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('purchasing.po.detail.release')}
            </Button>
          )}
          {canReceive && (
            <Button onClick={() => router.push(`/purchasing/po/${poId}/receive`)} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs gap-1.5">
              <PackagePlus className="h-3.5 w-3.5" /> {t('purchasing.po.detail.receiveGoods')}
            </Button>
          )}
          {canMatchInvoice && (
            <Button onClick={() => router.push(`/purchasing/po/${poId}/match-invoice`)} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" /> {t('purchasing.po.detail.matchInvoice')}
            </Button>
          )}
          {matchedInvoice && (
            <Button onClick={() => router.push(`/invoices/${matchedInvoice.id}/review`)} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" /> {t('purchasing.po.detail.viewMatchedInvoice')}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">{t('purchasing.po.detail.colItem')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.po.detail.colOrdered')} <span className="text-zinc-600 font-normal">{t('purchasing.po.detail.purchaseUnitHint')}</span></TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.po.detail.colReceived')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.po.detail.colReturned')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.po.detail.colUnitPrice')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.po.detail.colTotal')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id} className="border-zinc-800">
                <TableCell className="text-zinc-100">{line.item_master?.name || line.description}</TableCell>
                <TableCell className="text-zinc-300 font-mono">{line.qty} {line.unit}</TableCell>
                <TableCell className="text-zinc-300 font-mono">{line.received_qty}</TableCell>
                <TableCell className="text-zinc-300 font-mono">{line.returned_qty}</TableCell>
                <TableCell className="text-zinc-400 font-mono">{formatRp(line.unit_price)}</TableCell>
                <TableCell className="text-zinc-100 font-semibold font-mono">{formatRp(line.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end p-4 border-t border-zinc-800 text-sm">
          <span className="text-zinc-400 mr-3">{t('purchasing.po.detail.totalLabel')}</span>
          <span className="text-zinc-100 font-bold font-mono">{formatRp(total)}</span>
        </div>
      </div>

      {receipts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">{t('purchasing.po.detail.goodsReceiptsTitle')}</h3>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800/60">
            {receipts.map((gr) => {
              const qty = (gr.gr_lines || []).reduce((s: number, l: any) => s + (l.qty_received || 0), 0)
              return (
                <div key={gr.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <button onClick={() => router.push(`/purchasing/gr/${gr.id}`)} className="text-zinc-200 hover:text-indigo-400 transition-colors">
                    {format(new Date(gr.receipt_date), 'dd MMM yyyy')} — {t('purchasing.po.detail.unitsReceived', { qty })}
                  </button>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={gr.status === 'voided' ? 'bg-red-950/30 text-red-400 border-red-900/50' : 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50'}>
                      {t(`statusLabel.${gr.status}`)}
                    </Badge>
                    {gr.status === 'posted' && (
                      <button
                        onClick={() => router.push(`/purchasing/gr/${gr.id}/return`)}
                        className="text-xs text-zinc-400 hover:text-amber-400 flex items-center gap-1"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> {t('purchasing.po.detail.createReturn')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
