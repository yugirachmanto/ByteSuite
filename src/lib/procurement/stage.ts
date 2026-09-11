export type StageStatus = 'done' | 'current' | 'pending' | 'blocked' | 'skipped'

export interface StageInfo {
  key: 'pr' | 'po' | 'gr' | 'invoice'
  label: string
  sublabel: string
  status: StageStatus
  href?: string
}

export interface ProcurementChain {
  pr: { id: string; status: string } | null
  po: { id: string; status: string; po_number: string | null }
  receipts: { id: string; status: string }[]
  invoice: { id: string; status: string } | null
}

const PO_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  released: 'Released',
  partially_received: 'Partially Received',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const PR_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted',
}

const INVOICE_LABELS: Record<string, string> = {
  pending: 'Pending',
  extracted: 'Extracted',
  reviewed: 'In Review',
  posted: 'Posted',
  rejected: 'Rejected',
}

// Mirrors canReceive/canMatchInvoice in purchasing/po/[id]/page.tsx — same
// PO-status gates that already drive the Receive Goods / Match Invoice
// buttons there, so the tracker never claims an action is available when the
// page it links to wouldn't actually show that button.
export function computeStageInfo(chain: ProcurementChain): StageInfo[] {
  const { pr, po, receipts, invoice } = chain

  const canReceive = ['released', 'partially_received'].includes(po.status)
  const hasReceivedAny = receipts.length > 0
  const canMatchInvoice = hasReceivedAny && !invoice

  const prStage: StageInfo = pr
    ? {
        key: 'pr',
        label: 'Requisition',
        sublabel: PR_LABELS[pr.status] || pr.status,
        status: pr.status === 'rejected' ? 'blocked' : (pr.status === 'approved' || pr.status === 'converted') ? 'done' : 'pending',
        href: `/purchasing/pr/${pr.id}`,
      }
    : {
        key: 'pr',
        label: 'Requisition',
        sublabel: 'Created directly',
        status: 'skipped',
      }

  const poStage: StageInfo = {
    key: 'po',
    label: 'Purchase Order',
    sublabel: PO_LABELS[po.status] || po.status,
    status: po.status === 'cancelled' ? 'blocked' : (po.status === 'received' || po.status === 'closed') ? 'done' : 'current',
    href: `/purchasing/po/${po.id}`,
  }

  const grStage: StageInfo = hasReceivedAny
    ? {
        key: 'gr',
        label: 'Goods Receipt',
        sublabel: (po.status === 'received' || po.status === 'closed') ? `${receipts.length} receipt${receipts.length === 1 ? '' : 's'}` : 'Partially received',
        status: (po.status === 'received' || po.status === 'closed') ? 'done' : 'current',
        href: receipts.length === 1 ? `/purchasing/gr/${receipts[0].id}` : `/purchasing/po/${po.id}`,
      }
    : {
        key: 'gr',
        label: 'Goods Receipt',
        sublabel: canReceive ? 'Ready to receive' : 'Not yet received',
        status: canReceive ? 'current' : 'pending',
        href: canReceive ? `/purchasing/po/${po.id}/receive` : undefined,
      }

  const invoiceStage: StageInfo = invoice
    ? {
        key: 'invoice',
        label: 'Invoice',
        sublabel: INVOICE_LABELS[invoice.status] || invoice.status,
        status: invoice.status === 'posted' ? 'done' : 'current',
        href: `/invoices/${invoice.id}/review`,
      }
    : {
        key: 'invoice',
        label: 'Invoice',
        sublabel: canMatchInvoice ? 'Ready to match' : 'Not yet invoiced',
        status: canMatchInvoice ? 'current' : 'pending',
        href: canMatchInvoice ? `/purchasing/po/${po.id}/match-invoice` : undefined,
      }

  return [prStage, poStage, grStage, invoiceStage]
}
