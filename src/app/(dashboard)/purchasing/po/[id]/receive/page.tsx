'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useLanguage } from '@/lib/contexts/language-context'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { ArrowLeft, PackagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ReceiveGoodsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: poId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const { t } = useLanguage()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [po, setPo] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      setOrgId(profile?.org_id || null)

      const { data: poData } = await supabase.from('purchase_orders').select('*, vendors(name)').eq('id', poId).single()
      setPo(poData)

      const { data: lineData } = await supabase.from('po_lines').select('*, item_master(name)').eq('po_id', poId)
      setLines(
        (lineData || [])
          .filter((l: any) => l.received_qty < l.qty - 0.0001)
          .map((l: any) => ({
            po_line_id: l.id,
            item_id: l.item_id,
            item_name: l.item_master?.name || l.description,
            unit: l.unit,
            remaining: l.qty - l.received_qty,
            qty_received: l.qty - l.received_qty,
            unit_cost: l.unit_price,
            coa_id: l.coa_id,
            is_inventory: l.is_inventory,
          }))
      )
      setLoading(false)
    }
    init()
  }, [poId])

  const updateLine = (idx: number, field: string, value: any) => {
    const updated = [...lines]
    updated[idx] = { ...updated[idx], [field]: value }
    setLines(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validLines = lines.filter((l) => l.qty_received > 0)
    if (validLines.length === 0) {
      toast.error(t('purchasing.po.receive.errEnterQty'))
      return
    }
    if (!selectedOutletId || !orgId) {
      toast.error(t('purchasing.po.receive.errNotResolved'))
      return
    }

    setSaving(true)
    try {
      const { data: grId, error } = await supabase.rpc('post_goods_receipt', {
        p_po_id: poId,
        p_outlet_id: selectedOutletId,
        p_org_id: orgId,
        p_receipt_date: receiptDate,
        p_notes: notes || null,
        p_lines: validLines.map((l) => ({
          po_line_id: l.po_line_id,
          item_id: l.item_id,
          qty_received: l.qty_received,
          unit_cost: l.unit_cost,
          coa_id: l.coa_id,
          is_inventory: l.is_inventory,
        })),
      })

      if (error) throw error

      toast.success(t('purchasing.po.receive.successPosted'))
      router.push(`/purchasing/gr/${grId}`)
    } catch (err: any) {
      toast.error(err.message || t('purchasing.po.receive.errFailedPost'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">{t('purchasing.po.receive.loading')}</div>
  if (lines.length === 0) return (
    <div className="py-20 text-center space-y-4">
      <p className="text-zinc-400">{t('purchasing.po.receive.emptyTitle')}</p>
      <Link href={`/purchasing/po/${poId}`}><Button variant="outline" className="border-zinc-800 text-zinc-300">{t('purchasing.po.receive.backToPo')}</Button></Link>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href={`/purchasing/po/${poId}`} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft className="h-4 w-4" /> {t('purchasing.po.receive.backTo', { poNumber: po?.po_number || t('purchasing.po.receive.poFallback') })}
      </Link>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <PackagePlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{t('purchasing.po.receive.title')}</h1>
            <p className="text-xs text-zinc-400">{t('purchasing.po.receive.subtitle', { vendor: po?.vendors?.name || '' })}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{t('purchasing.po.receive.receiptDateLabel')}</label>
            <DatePicker value={receiptDate} onChange={setReceiptDate} className="sm:w-48" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">{t('purchasing.po.receive.itemsLabel')} <span className="text-zinc-500 font-normal">{t('purchasing.po.receive.purchaseUnitHint')}</span></label>
            <div className="grid grid-cols-12 gap-2 px-3">
              <span className="col-span-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.receive.colItem')}</span>
              <span className="col-span-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.receive.colOrdered')}</span>
              <span className="col-span-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.receive.colReceivedQty')}</span>
              <span className="col-span-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.receive.colUnitCost')}</span>
            </div>
            {lines.map((line, idx) => (
              <div key={line.po_line_id} className="grid grid-cols-12 gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-3 items-center">
                <span className="col-span-4 text-sm text-zinc-100">{line.item_name}</span>
                <span className="col-span-2 text-xs text-zinc-500">{t('purchasing.po.receive.orderedHint', { qty: line.remaining, unit: line.unit })}</span>
                <input
                  type="number" min="0" max={line.remaining} step="any" value={line.qty_received}
                  onChange={(e) => updateLine(idx, 'qty_received', parseFloat(e.target.value) || 0)}
                  className="col-span-3 bg-zinc-900 border border-zinc-800 rounded-lg h-9 text-sm px-2 text-zinc-100" placeholder={t('purchasing.po.receive.receivedQtyPlaceholder')}
                />
                <input
                  type="number" min="0" step="any" value={line.unit_cost}
                  onChange={(e) => updateLine(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                  className="col-span-3 bg-zinc-900 border border-zinc-800 rounded-lg h-9 text-sm px-2 text-zinc-100" placeholder={t('purchasing.po.receive.unitCostPlaceholder')}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{t('purchasing.po.receive.notesLabel')}</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Link href={`/purchasing/po/${poId}`}>
              <Button type="button" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">{t('common.cancel')}</Button>
            </Link>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 font-medium">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('purchasing.po.receive.submitButton')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
