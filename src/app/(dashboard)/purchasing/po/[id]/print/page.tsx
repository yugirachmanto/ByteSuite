'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { PrintDocumentLayout, PrintLineItemsTable, PrintTotalsBlock } from '@/components/purchasing/PrintDocumentLayout'
import { getOrgProfile, getCurrentOrgId, OrgProfile } from '@/lib/purchasing/print-helpers'
import { formatRp } from '@/lib/format'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function PrintPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: poId } = use(params)
  const supabase = createClient()
  const { t } = useLanguage()

  const [po, setPo] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [org, setOrg] = useState<OrgProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const orgId = await getCurrentOrgId(supabase)
      if (orgId) setOrg(await getOrgProfile(supabase, orgId))

      const { data: poData } = await supabase.from('purchase_orders').select('*, vendors(name, address, email, phone)').eq('id', poId).single()
      setPo(poData)

      const { data: lineData } = await supabase.from('po_lines').select('*, item_master(name)').eq('po_id', poId)
      setLines(lineData || [])

      setLoading(false)
    }
    load()
  }, [poId])

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>
  if (!po || !org) return <div className="p-8 text-center text-zinc-500">{t('purchasing.print.notFound')}</div>

  const total = lines.reduce((s, l) => s + (l.total || 0), 0)
  const vendorDetail = [po.vendors?.address, po.vendors?.email, po.vendors?.phone].filter(Boolean).join('\n')

  return (
    <PrintDocumentLayout
      backHref={`/purchasing/po/${poId}`}
      backLabel={t('common.back')}
      printLabel={t('purchasing.print.printButton')}
      docTypeLabel={t('purchasing.print.poTitle')}
      docNumber={po.po_number || po.id.split('-')[0].toUpperCase()}
      org={org}
      partyLabel={t('purchasing.print.vendorLabel')}
      partyName={po.vendors?.name || '—'}
      partyDetail={vendorDetail}
      metaFields={[
        { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${po.status}`) },
        { label: t('purchasing.print.orderDateLabel'), value: format(new Date(po.order_date || po.created_at), 'dd MMM yyyy') },
        ...(po.expected_date ? [{ label: t('purchasing.print.expectedDateLabel'), value: format(new Date(po.expected_date), 'dd MMM yyyy') }] : []),
      ]}
      notes={po.notes}
      notesLabel={t('purchasing.print.notesLabel')}
    >
      <PrintLineItemsTable columns={[
        { label: t('purchasing.po.detail.colItem') },
        { label: t('purchasing.po.detail.colOrdered'), align: 'right' },
        { label: t('purchasing.po.detail.colUnitPrice'), align: 'right' },
        { label: t('purchasing.po.detail.colTotal'), align: 'right' },
      ]}>
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-zinc-100">
            <td className="py-3 pr-4 text-zinc-800 font-medium">{l.item_master?.name || l.description}</td>
            <td className="py-3 pr-4 text-right font-mono">{l.qty} {l.unit}</td>
            <td className="py-3 pr-4 text-right font-mono">{formatRp(l.unit_price)}</td>
            <td className="py-3 pr-4 text-right font-mono font-medium">{formatRp(l.total)}</td>
          </tr>
        ))}
      </PrintLineItemsTable>
      <PrintTotalsBlock totalLabel={t('purchasing.po.detail.totalLabel')} totalValue={formatRp(total)} />
    </PrintDocumentLayout>
  )
}
