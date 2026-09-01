'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { PrintDocumentLayout, PrintLineItemsTable, PrintTotalsBlock } from '@/components/purchasing/PrintDocumentLayout'
import { getOrgProfile, getCurrentOrgId, OrgProfile } from '@/lib/purchasing/print-helpers'
import { Button } from '@/components/ui/button'
import { formatRp } from '@/lib/format'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function PrintFullPacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: poId } = use(params)
  const supabase = createClient()
  const { t } = useLanguage()

  const [org, setOrg] = useState<OrgProfile | null>(null)
  const [pr, setPr] = useState<any>(null)
  const [prLines, setPrLines] = useState<any[]>([])
  const [po, setPo] = useState<any>(null)
  const [poLines, setPoLines] = useState<any[]>([])
  const [grs, setGrs] = useState<{ gr: any; lines: any[] }[]>([])
  const [returns, setReturns] = useState<{ ret: any; lines: any[] }[]>([])
  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const orgId = await getCurrentOrgId(supabase)
      if (orgId) setOrg(await getOrgProfile(supabase, orgId))

      const { data: poData } = await supabase.from('purchase_orders').select('*, vendors(name, address, email, phone)').eq('id', poId).single()
      setPo(poData)

      const { data: poLineData } = await supabase.from('po_lines').select('*, item_master(name)').eq('po_id', poId)
      setPoLines(poLineData || [])

      if (poData?.pr_id) {
        const { data: prData } = await supabase.from('purchase_requisitions').select('*, outlets(name, address)').eq('id', poData.pr_id).single()
        setPr(prData)
        const { data: prLineData } = await supabase.from('pr_lines').select('*, item_master(name)').eq('pr_id', poData.pr_id)
        setPrLines(prLineData || [])
      }

      const { data: grData } = await supabase.from('goods_receipts').select('*').eq('po_id', poId).order('created_at')
      const grList = grData || []
      const grsWithLines = await Promise.all(grList.map(async (gr) => {
        const { data: lines } = await supabase.from('gr_lines').select('*, item_master(name)').eq('gr_id', gr.id)
        return { gr, lines: lines || [] }
      }))
      setGrs(grsWithLines)

      if (grList.length > 0) {
        const { data: returnData } = await supabase.from('vendor_returns').select('*').in('gr_id', grList.map((g) => g.id)).order('created_at')
        const returnList = returnData || []
        const returnsWithLines = await Promise.all(returnList.map(async (ret) => {
          const { data: lines } = await supabase.from('return_lines').select('*, item_master(name)').eq('return_id', ret.id)
          return { ret, lines: lines || [] }
        }))
        setReturns(returnsWithLines)
      }

      const { data: invData } = await supabase.from('invoices').select('*').eq('po_id', poId).maybeSingle()
      setInvoice(invData)

      setLoading(false)
    }
    load()
  }, [poId])

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>
  if (!po || !org) return <div className="p-8 text-center text-zinc-500">{t('purchasing.print.notFound')}</div>

  const poTotal = poLines.reduce((s, l) => s + (l.total || 0), 0)
  const vendorDetail = [po.vendors?.address, po.vendors?.email, po.vendors?.phone].filter(Boolean).join('\n')
  const invoiceLines: any[] = invoice?.extracted_data?.line_items || []

  const documents = [
    pr && (
      <PrintDocumentLayout
        key="pr"
        hideControls
        pageBreakAfter
        backHref="" backLabel="" printLabel=""
        docTypeLabel={t('purchasing.print.prTitle')}
        docNumber={pr.id.split('-')[0].toUpperCase()}
        org={org}
        partyLabel={t('purchasing.print.outletLabel')}
        partyName={pr.outlets?.name || '—'}
        partyDetail={pr.outlets?.address}
        metaFields={[
          { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${pr.status}`) },
          { label: t('purchasing.print.dateCreatedLabel'), value: format(new Date(pr.created_at), 'dd MMM yyyy') },
        ]}
        notes={pr.notes}
        notesLabel={t('purchasing.print.notesLabel')}
      >
        <PrintLineItemsTable columns={[
          { label: t('purchasing.pr.detail.colItem') },
          { label: t('purchasing.pr.detail.colQty'), align: 'right' },
          { label: t('purchasing.pr.detail.colUnit') },
        ]}>
          {prLines.map((l) => (
            <tr key={l.id} className="border-b border-zinc-100">
              <td className="py-3 pr-4 text-zinc-800 font-medium">{l.item_master?.name || '—'}</td>
              <td className="py-3 pr-4 text-right font-mono">{l.qty}</td>
              <td className="py-3 pr-4">{l.unit || '—'}</td>
            </tr>
          ))}
        </PrintLineItemsTable>
      </PrintDocumentLayout>
    ),
    <PrintDocumentLayout
      key="po"
      hideControls
      pageBreakAfter
      backHref="" backLabel="" printLabel=""
      docTypeLabel={t('purchasing.print.poTitle')}
      docNumber={po.po_number || po.id.split('-')[0].toUpperCase()}
      org={org}
      partyLabel={t('purchasing.print.vendorLabel')}
      partyName={po.vendors?.name || '—'}
      partyDetail={vendorDetail}
      metaFields={[
        { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${po.status}`) },
        { label: t('purchasing.print.orderDateLabel'), value: format(new Date(po.order_date || po.created_at), 'dd MMM yyyy') },
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
        {poLines.map((l) => (
          <tr key={l.id} className="border-b border-zinc-100">
            <td className="py-3 pr-4 text-zinc-800 font-medium">{l.item_master?.name || l.description}</td>
            <td className="py-3 pr-4 text-right font-mono">{l.qty} {l.unit}</td>
            <td className="py-3 pr-4 text-right font-mono">{formatRp(l.unit_price)}</td>
            <td className="py-3 pr-4 text-right font-mono font-medium">{formatRp(l.total)}</td>
          </tr>
        ))}
      </PrintLineItemsTable>
      <PrintTotalsBlock totalLabel={t('purchasing.po.detail.totalLabel')} totalValue={formatRp(poTotal)} />
    </PrintDocumentLayout>,
    ...grs.map(({ gr, lines }, idx) => {
      const grTotal = lines.reduce((s, l) => s + l.qty_received * l.unit_cost, 0)
      const isLastDoc = idx === grs.length - 1 && returns.length === 0 && !invoice
      return (
        <PrintDocumentLayout
          key={gr.id}
          hideControls
          pageBreakAfter={!isLastDoc}
          backHref="" backLabel="" printLabel=""
          docTypeLabel={t('purchasing.print.grTitle')}
          docNumber={gr.id.split('-')[0].toUpperCase()}
          org={org}
          partyLabel={t('purchasing.print.vendorLabel')}
          partyName={po.vendors?.name || '—'}
          partyDetail={vendorDetail}
          metaFields={[
            { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${gr.status}`) },
            { label: t('purchasing.print.receiptDateLabel'), value: format(new Date(gr.receipt_date), 'dd MMM yyyy') },
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
          <PrintTotalsBlock totalLabel={t('purchasing.gr.detail.totalLabel')} totalValue={formatRp(grTotal)} />
        </PrintDocumentLayout>
      )
    }),
    ...returns.map(({ ret, lines }, idx) => {
      const retTotal = lines.reduce((s, l) => s + l.qty_returned * l.unit_cost, 0)
      const isLastDoc = idx === returns.length - 1 && !invoice
      return (
        <PrintDocumentLayout
          key={ret.id}
          hideControls
          pageBreakAfter={!isLastDoc}
          backHref="" backLabel="" printLabel=""
          docTypeLabel={t('purchasing.print.returnTitle')}
          docNumber={ret.id.split('-')[0].toUpperCase()}
          org={org}
          partyLabel={t('purchasing.print.vendorLabel')}
          partyName={po.vendors?.name || '—'}
          partyDetail={vendorDetail}
          metaFields={[
            { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${ret.status}`) },
            { label: t('purchasing.print.returnDateLabel'), value: format(new Date(ret.return_date), 'dd MMM yyyy') },
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
          <PrintTotalsBlock totalLabel={t('purchasing.print.totalReturnedLabel')} totalValue={formatRp(retTotal)} />
        </PrintDocumentLayout>
      )
    }),
    invoice && (
      <PrintDocumentLayout
        key="invoice"
        hideControls
        pageBreakAfter={false}
        backHref="" backLabel="" printLabel=""
        docTypeLabel={t('purchasing.print.invoiceTitle')}
        docNumber={invoice.invoice_no || invoice.id.split('-')[0].toUpperCase()}
        org={org}
        partyLabel={t('purchasing.print.vendorLabel')}
        partyName={po.vendors?.name || invoice.vendor || '—'}
        partyDetail={vendorDetail}
        metaFields={[
          { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${invoice.status}`) },
          ...(invoice.invoice_date ? [{ label: t('purchasing.print.invoiceDateLabel'), value: format(new Date(invoice.invoice_date), 'dd MMM yyyy') }] : []),
        ]}
      >
        <PrintLineItemsTable columns={[
          { label: t('purchasing.print.colDescription') },
          { label: t('purchasing.print.colQty'), align: 'right' },
          { label: t('purchasing.print.colUnitPrice'), align: 'right' },
          { label: t('purchasing.print.colTotal'), align: 'right' },
        ]}>
          {invoiceLines.map((l, idx) => (
            <tr key={idx} className="border-b border-zinc-100">
              <td className="py-3 pr-4 text-zinc-800 font-medium">{l.description}</td>
              <td className="py-3 pr-4 text-right font-mono">{l.qty}</td>
              <td className="py-3 pr-4 text-right font-mono">{formatRp(l.unit_price)}</td>
              <td className="py-3 pr-4 text-right font-mono font-medium">{formatRp(l.total)}</td>
            </tr>
          ))}
        </PrintLineItemsTable>
        <PrintTotalsBlock totalLabel={t('purchasing.print.grandTotalLabel')} totalValue={formatRp(invoice.grand_total || 0)} />
      </PrintDocumentLayout>
    ),
  ].filter(Boolean)

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <div className="mx-auto max-w-3xl mb-8 flex items-center justify-between print:hidden">
        <Link href={`/purchasing/po/${poId}`}>
          <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}
          </Button>
        </Link>
        <Button onClick={() => window.print()} className="bg-indigo-600 text-white hover:bg-indigo-700">
          <Printer className="mr-2 h-4 w-4" /> {t('purchasing.print.printPacketButton')}
        </Button>
      </div>

      {documents}

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { background-color: white !important; }
          @page { margin: 0; size: auto; }
        }
      `}} />
    </div>
  )
}
