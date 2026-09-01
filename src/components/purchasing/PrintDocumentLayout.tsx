'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer } from 'lucide-react'
import type { OrgProfile } from '@/lib/purchasing/print-helpers'

interface MetaField {
  label: string
  value: string
}

interface PrintDocumentLayoutProps {
  backHref: string
  backLabel: string
  printLabel: string
  docTypeLabel: string
  docNumber: string
  org: OrgProfile
  statusBadge?: React.ReactNode
  partyLabel: string
  partyName: string
  partyDetail?: string | null
  metaFields: MetaField[]
  notes?: string | null
  notesLabel?: string
  children: React.ReactNode
  /** Full-packet mode: suppress the per-document controls bar and force a page break after this document. */
  hideControls?: boolean
  pageBreakAfter?: boolean
}

export function PrintDocumentLayout({
  backHref,
  backLabel,
  printLabel,
  docTypeLabel,
  docNumber,
  org,
  statusBadge,
  partyLabel,
  partyName,
  partyDetail,
  metaFields,
  notes,
  notesLabel,
  children,
  hideControls,
  pageBreakAfter,
}: PrintDocumentLayoutProps) {
  return (
    <div className={hideControls ? undefined : 'min-h-screen bg-zinc-950 p-4 md:p-8'}>
      {!hideControls && (
        <div className="mx-auto max-w-3xl mb-8 flex items-center justify-between print:hidden">
          <Link href={backHref}>
            <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100">
              <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
            </Button>
          </Link>
          <Button onClick={() => window.print()} className="bg-indigo-600 text-white hover:bg-indigo-700">
            <Printer className="mr-2 h-4 w-4" /> {printLabel}
          </Button>
        </div>
      )}

      <div
        className="mx-auto max-w-3xl bg-white text-zinc-900 rounded-lg p-8 md:p-16 shadow-lg print:shadow-none print:p-0"
        style={pageBreakAfter ? { pageBreakAfter: 'always' } : undefined}
      >
        <div className="flex justify-between items-start border-b border-zinc-200 pb-8 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-indigo-900 mb-2">{docTypeLabel}</h1>
            <p className="text-zinc-500 font-medium font-mono">#{docNumber}</p>
            {statusBadge && <div className="mt-2">{statusBadge}</div>}
          </div>
          <div className="text-right">
            {org.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo_url} alt={org.name} className="h-10 ml-auto mb-2 object-contain" />
            )}
            <p className="font-bold text-lg">{org.name}</p>
            {org.address && <p className="text-sm text-zinc-500 whitespace-pre-line">{org.address}</p>}
            {org.phone && <p className="text-sm text-zinc-500">{org.phone}</p>}
            {org.npwp && <p className="text-sm text-zinc-500">NPWP: {org.npwp}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">{partyLabel}</p>
            <p className="font-semibold text-lg">{partyName || '—'}</p>
            {partyDetail && <p className="text-zinc-500 text-sm mt-1 whitespace-pre-line">{partyDetail}</p>}
          </div>
          <div className="text-right">
            <div className="space-y-1 text-sm">
              {metaFields.map((f) => (
                <div key={f.label} className="flex justify-end gap-4">
                  <span className="text-zinc-500">{f.label}:</span>
                  <span className="font-medium">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {children}

        {notes && (
          <div className="mt-10 pt-6 border-t border-zinc-100">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">{notesLabel}</p>
            <p className="text-sm text-zinc-600 whitespace-pre-line">{notes}</p>
          </div>
        )}
      </div>

      {!hideControls && (
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            body { background-color: white !important; }
            @page { margin: 0; size: auto; }
          }
        `}} />
      )}
    </div>
  )
}

export function PrintLineItemsTable({ columns, children }: { columns: { label: string; align?: 'left' | 'right' }[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-left border-collapse mb-8">
      <thead>
        <tr className="border-b-2 border-zinc-200 text-xs font-bold text-zinc-600 uppercase tracking-wider">
          {columns.map((c) => (
            <th key={c.label} className={`py-3 pr-4 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

export function PrintTotalsBlock({ rows, totalLabel, totalValue }: { rows?: { label: string; value: string }[]; totalLabel: string; totalValue: string }) {
  return (
    <div className="flex justify-end mb-4">
      <div className="w-64 space-y-2">
        {rows?.map((r) => (
          <div key={r.label} className="flex justify-between text-sm text-zinc-600">
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
        <div className="flex justify-between text-lg font-bold text-indigo-900 pt-2 border-t border-zinc-200">
          <span>{totalLabel}</span>
          <span>{totalValue}</span>
        </div>
      </div>
    </div>
  )
}
