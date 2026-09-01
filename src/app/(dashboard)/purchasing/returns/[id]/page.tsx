'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { PrintDocumentLayout, PrintLineItemsTable, PrintTotalsBlock } from '@/components/purchasing/PrintDocumentLayout'
import { getOrgProfile, getCurrentOrgId, OrgProfile } from '@/lib/purchasing/print-helpers'
import { formatRp } from '@/lib/format'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function VendorReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: returnId } = use(params)
  const supabase = createClient()
  const { t } = useLanguage()

  const [ret, setRet] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [org, setOrg] = useState<OrgProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const orgId = await getCurrentOrgId(supabase)
      if (orgId) setOrg(await getOrgProfile(supabase, orgId))

      const { data: retData } = await supabase
        .from('vendor_returns')
        .select('*, goods_receipts(receipt_date, purchase_orders(po_number, vendors(name, address, email, phone)))')
        .eq('id', returnId)
        .single()
      setRet(retData)

      const { data: lineData } = await supabase.from('return_lines').select('*, item_master(name)').eq('return_id', returnId)
      setLines(lineData || [])

      setLoading(false)
    }
    load()
  }, [returnId])

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>
  if (!ret || !org) return <div className="p-8 text-center text-zinc-500">{t('purchasing.print.notFound')}</div>

  const total = lines.reduce((s, l) => s + l.qty_returned * l.unit_cost, 0)
  const po = ret.goods_receipts?.purchase_orders
  const vendor = po?.vendors
  const vendorDetail = [vendor?.address, vendor?.email, vendor?.phone].filter(Boolean).join('\n')

  return (
    <PrintDocumentLayout
      backHref={`/purchasing/gr/${ret.gr_id}`}
      backLabel={t('common.back')}
      printLabel={t('purchasing.print.printButton')}
      docTypeLabel={t('purchasing.print.returnTitle')}
      docNumber={ret.id.split('-')[0].toUpperCase()}
      org={org}
      partyLabel={t('purchasing.print.vendorLabel')}
      partyName={vendor?.name || '—'}
      partyDetail={vendorDetail}
      metaFields={[
        { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${ret.status}`) },
        { label: t('purchasing.print.returnDateLabel'), value: format(new Date(ret.return_date), 'dd MMM yyyy') },
        ...(po?.po_number ? [{ label: t('purchasing.print.poRefLabel'), value: po.po_number }] : []),
      ]}
      notes={ret.reason}
      notesLabel={t('purchasing.print.reasonLabel')}
    >
      <PrintLineItemsTable columns={[
        { label: t('purchasing.gr.detail.colItem') },
        { label: t('purchasing.gr.return.colReturnQty'), align: 'right' },
        { label: t('purchasing.gr.detail.colUnitCost'), align: 'right' },
        { label: t('purchasing.gr.detail.colTotal'), align: 'right' },
      ]}>
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-zinc-100">
            <td className="py-3 pr-4 text-zinc-800 font-medium">{l.item_master?.name || '—'}</td>
            <td className="py-3 pr-4 text-right font-mono">{l.qty_returned}</td>
            <td className="py-3 pr-4 text-right font-mono">{formatRp(l.unit_cost)}</td>
            <td className="py-3 pr-4 text-right font-mono font-medium">{formatRp(l.qty_returned * l.unit_cost)}</td>
          </tr>
        ))}
      </PrintLineItemsTable>
      <PrintTotalsBlock totalLabel={t('purchasing.print.totalReturnedLabel')} totalValue={formatRp(total)} />
    </PrintDocumentLayout>
  )
}
