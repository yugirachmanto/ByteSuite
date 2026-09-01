'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { PrintDocumentLayout, PrintLineItemsTable } from '@/components/purchasing/PrintDocumentLayout'
import { getOrgProfile, getCurrentOrgId, OrgProfile } from '@/lib/purchasing/print-helpers'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function PrintRequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: prId } = use(params)
  const supabase = createClient()
  const { t } = useLanguage()

  const [pr, setPr] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [outlet, setOutlet] = useState<any>(null)
  const [org, setOrg] = useState<OrgProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const orgId = await getCurrentOrgId(supabase)
      if (orgId) setOrg(await getOrgProfile(supabase, orgId))

      const { data: prData } = await supabase.from('purchase_requisitions').select('*').eq('id', prId).single()
      setPr(prData)

      if (prData?.outlet_id) {
        const { data: outletData } = await supabase.from('outlets').select('name, address').eq('id', prData.outlet_id).single()
        setOutlet(outletData)
      }

      const { data: lineData } = await supabase.from('pr_lines').select('*, item_master(name)').eq('pr_id', prId)
      setLines(lineData || [])

      setLoading(false)
    }
    load()
  }, [prId])

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>
  if (!pr || !org) return <div className="p-8 text-center text-zinc-500">{t('purchasing.print.notFound')}</div>

  return (
    <PrintDocumentLayout
      backHref={`/purchasing/pr/${prId}`}
      backLabel={t('common.back')}
      printLabel={t('purchasing.print.printButton')}
      docTypeLabel={t('purchasing.print.prTitle')}
      docNumber={pr.id.split('-')[0].toUpperCase()}
      org={org}
      partyLabel={t('purchasing.print.outletLabel')}
      partyName={outlet?.name || '—'}
      partyDetail={outlet?.address}
      metaFields={[
        { label: t('purchasing.print.statusLabel'), value: t(`statusLabel.${pr.status}`) },
        ...(pr.needed_by_date ? [{ label: t('purchasing.print.neededByLabel'), value: format(new Date(pr.needed_by_date), 'dd MMM yyyy') }] : []),
        { label: t('purchasing.print.dateCreatedLabel'), value: format(new Date(pr.created_at), 'dd MMM yyyy') },
      ]}
      notes={pr.notes}
      notesLabel={t('purchasing.print.notesLabel')}
    >
      <PrintLineItemsTable columns={[
        { label: t('purchasing.pr.detail.colItem') },
        { label: t('purchasing.pr.detail.colQty'), align: 'right' },
        { label: t('purchasing.pr.detail.colUnit') },
        { label: t('purchasing.pr.detail.colNotes') },
      ]}>
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-zinc-100">
            <td className="py-3 pr-4 text-zinc-800 font-medium">{l.item_master?.name || '—'}</td>
            <td className="py-3 pr-4 text-right font-mono">{l.qty}</td>
            <td className="py-3 pr-4">{l.unit || '—'}</td>
            <td className="py-3 pr-4 text-zinc-500">{l.notes || '—'}</td>
          </tr>
        ))}
      </PrintLineItemsTable>
    </PrintDocumentLayout>
  )
}
