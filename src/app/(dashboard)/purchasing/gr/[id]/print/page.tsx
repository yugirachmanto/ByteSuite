'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { PrintDocumentLayout, PrintLineItemsTable, PrintTotalsBlock } from '@/components/purchasing/PrintDocumentLayout'
import { getOrgProfile, getCurrentOrgId, OrgProfile } from '@/lib/purchasing/print-helpers'
import { formatRp } from '@/lib/format'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function PrintGoodsReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: grId } = use(params)
  const supabase = createClient()
  const { t } = useLanguage()

  const [gr, setGr] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [org, setOrg] = useState<OrgProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const orgId = await getCurrentOrgId(supabase)
      if (orgId) setOrg(await getOrgProfile(supabase, orgId))

      const { data: grData } = await supabase.from('goods_receipts').select('*, purchase_orders(po_number, vendors(name, address, email, phone))').eq('id', grId).single()
      setGr(grData)

      const { data: lineData } = await supabase.from('gr_lines').select('*, item_master(name)').eq('gr_id', grId)
      setLines(lineData || [])

      setLoading(false)
    }
    load()
  }, [grId])

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>
  if (!gr || !org) return <div className="p-8 text-center text-zinc-500">{t('purchasing.print.notFound')}</div>

  const total = lines.reduce((s, l) => s + l.qty_received * l.unit_cost, 0)
  const vendor = gr.purchase_orders?.vendors
  const vendorDetail = [vendor?.address, vendor?.email, vendor?.phone].filter(Boolean).join('\n')

  return (
    <PrintDocumentLayout
      backHref={`/purchasing/gr/${grId}`}
      backLabel={t('common.back')}
      printLabel={t('purchasing.print.printButton')}
      docTypeLabel={t('purchasing.print.grTitle')}
      docNumber={gr.id.split('-')[0].toUpperCase()}
      org={org}
      partyLabel={t('purchasing.print.vendorLabel')}
      partyName={vendor?.name || '—'}
      partyDetail={vendorDetail}
      metaFields={[
        { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${gr.status}`) },
        { label: t('purchasing.print.receiptDateLabel'), value: format(new Date(gr.receipt_date), 'dd MMM yyyy') },
        ...(gr.purchase_orders?.po_number ? [{ label: t('purchasing.print.poRefLabel'), value: gr.purchase_orders.po_number }] : []),
      ]}
      notes={gr.notes}
      notesLabel={t('purchasing.print.notesLabel')}
    >
      <PrintLineItemsTable columns={[
        { label: t('purchasing.gr.detail.colItem') },
        { label: t('purchasing.gr.detail.colQtyReceived'), align: 'right' },
        { label: t('purchasing.gr.detail.colUnitCost'), align: 'right' },
        { label: t('purchasing.gr.detail.colTotal'), align: 'right' },
      ]}>
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-zinc-100">
            <td className="py-3 pr-4 text-zinc-800 font-medium">{l.item_master?.name || '—'}</td>
            <td className="py-3 pr-4 text-right font-mono">{l.qty_received}</td>
            <td className="py-3 pr-4 text-right font-mono">{formatRp(l.unit_cost)}</td>
            <td className="py-3 pr-4 text-right font-mono font-medium">{formatRp(l.qty_received * l.unit_cost)}</td>
          </tr>
        ))}
      </PrintLineItemsTable>
      <PrintTotalsBlock totalLabel={t('purchasing.gr.detail.totalLabel')} totalValue={formatRp(total)} />
    </PrintDocumentLayout>
  )
}
