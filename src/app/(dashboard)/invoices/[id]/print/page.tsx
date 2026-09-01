'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { PrintDocumentLayout, PrintLineItemsTable, PrintTotalsBlock } from '@/components/purchasing/PrintDocumentLayout'
import { getOrgProfile, getCurrentOrgId, OrgProfile } from '@/lib/purchasing/print-helpers'
import { formatRp } from '@/lib/format'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceId } = use(params)
  const supabase = createClient()
  const { t } = useLanguage()

  const [invoice, setInvoice] = useState<any>(null)
  const [vendor, setVendor] = useState<any>(null)
  const [po, setPo] = useState<any>(null)
  const [org, setOrg] = useState<OrgProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const orgId = await getCurrentOrgId(supabase)
      if (orgId) setOrg(await getOrgProfile(supabase, orgId))

      const { data: invData } = await supabase.from('invoices').select('*').eq('id', invoiceId).single()
      setInvoice(invData)

      if (invData?.vendor_id) {
        const { data: vendorData } = await supabase.from('vendors').select('name, address, email, phone').eq('id', invData.vendor_id).single()
        setVendor(vendorData)
      }

      if (invData?.po_id) {
        const { data: poData } = await supabase.from('purchase_orders').select('po_number').eq('id', invData.po_id).single()
        setPo(poData)
      }

      setLoading(false)
    }
    load()
  }, [invoiceId])

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>
  if (!invoice || !org) return <div className="p-8 text-center text-zinc-500">{t('purchasing.print.notFound')}</div>

  const lines: any[] = invoice.extracted_data?.line_items || []
  const vendorDetail = [vendor?.address, vendor?.email, vendor?.phone].filter(Boolean).join('\n')

  return (
    <PrintDocumentLayout
      backHref={`/invoices/${invoiceId}/review`}
      backLabel={t('common.back')}
      printLabel={t('purchasing.print.printButton')}
      docTypeLabel={t('purchasing.print.invoiceTitle')}
      docNumber={invoice.invoice_no || invoice.id.split('-')[0].toUpperCase()}
      org={org}
      partyLabel={t('purchasing.print.vendorLabel')}
      partyName={vendor?.name || invoice.vendor || '—'}
      partyDetail={vendorDetail}
      metaFields={[
        { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${invoice.status}`) },
        ...(invoice.invoice_date ? [{ label: t('purchasing.print.invoiceDateLabel'), value: format(new Date(invoice.invoice_date), 'dd MMM yyyy') }] : []),
        ...(po?.po_number ? [{ label: t('purchasing.print.poRefLabel'), value: po.po_number }] : []),
      ]}
    >
      <PrintLineItemsTable columns={[
        { label: t('purchasing.print.colDescription') },
        { label: t('purchasing.print.colQty'), align: 'right' },
        { label: t('purchasing.print.colUnitPrice'), align: 'right' },
        { label: t('purchasing.print.colTotal'), align: 'right' },
      ]}>
        {lines.map((l, idx) => (
          <tr key={idx} className="border-b border-zinc-100">
            <td className="py-3 pr-4 text-zinc-800 font-medium">{l.description}</td>
            <td className="py-3 pr-4 text-right font-mono">{l.qty}</td>
            <td className="py-3 pr-4 text-right font-mono">{formatRp(l.unit_price)}</td>
            <td className="py-3 pr-4 text-right font-mono font-medium">{formatRp(l.total)}</td>
          </tr>
        ))}
      </PrintLineItemsTable>
      <PrintTotalsBlock
        rows={[
          { label: t('purchasing.print.subtotalLabel'), value: formatRp(invoice.subtotal || 0) },
          ...(invoice.discount ? [{ label: t('purchasing.print.discountLabel'), value: `- ${formatRp(invoice.discount)}` }] : []),
          ...(invoice.tax_total ? [{ label: t('purchasing.print.taxLabel'), value: formatRp(invoice.tax_total) }] : []),
        ]}
        totalLabel={t('purchasing.print.grandTotalLabel')}
        totalValue={formatRp(invoice.grand_total || 0)}
      />
    </PrintDocumentLayout>
  )
}
