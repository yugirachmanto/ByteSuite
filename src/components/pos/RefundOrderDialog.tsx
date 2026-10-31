'use client'

import { useEffect, useState } from 'react'
import { Loader2, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const formatRp = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

interface RefundLine {
  id: string
  name: string
  qty: number
  refunded: number
  subtotal: number
}

interface RefundOrderDialogProps {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefunded: () => void
}

/**
 * Partial or full refund of a completed order, line by line. The server
 * computes the exact amounts (discount share, tax, rounding) and posts the
 * reversing journal; this dialog only picks quantities, method and reason.
 */
export function RefundOrderDialog({ orderId, open, onOpenChange, onRefunded }: RefundOrderDialogProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<RefundLine[]>([])
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [methods, setMethods] = useState<string[]>([])
  const [method, setMethod] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !orderId) return
    let cancelled = false
    setLoading(true)
    setReason('')
    setQtys({})

    ;(async () => {
      const [{ data: lineRows }, { data: refundLines }, { data: payments }, { data: order }] = await Promise.all([
        supabase.from('pos_order_lines').select('id, qty, subtotal, item_master(name)').eq('order_id', orderId),
        supabase.from('pos_refund_lines').select('order_line_id, qty, pos_refunds!inner(order_id)').eq('pos_refunds.order_id', orderId),
        supabase.from('pos_order_payments').select('payment_method').eq('order_id', orderId),
        supabase.from('pos_orders').select('org_id').eq('id', orderId).single(),
      ])
      if (cancelled) return

      const refundedByLine = new Map<string, number>()
      for (const r of refundLines ?? []) {
        refundedByLine.set(r.order_line_id, (refundedByLine.get(r.order_line_id) ?? 0) + Number(r.qty))
      }
      setLines((lineRows ?? []).map((l: any) => ({
        id: l.id,
        name: l.item_master?.name ?? 'Item',
        qty: Number(l.qty),
        refunded: refundedByLine.get(l.id) ?? 0,
        subtotal: Number(l.subtotal),
      })))

      let mapped: string[] = []
      if (order?.org_id) {
        const { data: m } = await supabase
          .from('pos_payment_method_mapping')
          .select('payment_method')
          .eq('org_id', order.org_id)
        mapped = (m ?? []).map(x => x.payment_method)
      }
      const paid = (payments ?? []).map(p => p.payment_method)
      const all = Array.from(new Set([...paid, ...mapped, 'Cash']))
      setMethods(all)
      setMethod(paid[0] ?? all[0] ?? 'Cash')
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [open, orderId, supabase])

  const setQty = (id: string, value: number, max: number) =>
    setQtys(prev => ({ ...prev, [id]: Math.max(0, Math.min(max, value)) }))

  const selected = lines.filter(l => (qtys[l.id] ?? 0) > 0)
  // Item value before the order-level discount, tax and rounding — the server
  // works out the exact amount, so this is labelled as an estimate.
  const itemValue = selected.reduce((sum, l) => sum + Math.round((l.subtotal * (qtys[l.id] ?? 0)) / l.qty), 0)

  const handleRefund = async () => {
    if (!orderId || selected.length === 0 || !reason.trim() || !method) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/pos/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: method,
          reason,
          lines: selected.map(l => ({ order_line_id: l.id, qty: qtys[l.id] })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memproses refund')

      const { data: refund } = await supabase.from('pos_refunds').select('amount').eq('id', data.refund_id).single()
      toast.success(refund ? `Refund ${formatRp(Number(refund.amount))} berhasil dicatat` : 'Refund berhasil dicatat')
      onOpenChange(false)
      onRefunded()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Refund transaksi</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Pilih item yang dikembalikan. Pendapatan dan pajak dibalik lewat jurnal baru; stok tidak dikembalikan
            (makanan sudah disajikan). Untuk salah input, gunakan Void.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full bg-zinc-800" />)}</div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {lines.map(l => {
                const remaining = l.qty - l.refunded
                const q = qtys[l.id] ?? 0
                return (
                  <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-100">{l.name}</p>
                      <p className="text-[11px] text-zinc-500">
                        Terjual {l.qty}{l.refunded > 0 ? ` · sudah direfund ${l.refunded}` : ''} · {formatRp(l.subtotal)}
                      </p>
                    </div>
                    {remaining > 0 ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" aria-label="Kurangi" disabled={q <= 0}
                          onClick={() => setQty(l.id, q - 1, remaining)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 disabled:opacity-30">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center font-mono text-sm tabular-nums">{q}</span>
                        <button type="button" aria-label="Tambah" disabled={q >= remaining}
                          onClick={() => setQty(l.id, q + 1, remaining)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 disabled:opacity-30">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-zinc-500">Sudah habis direfund</span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium uppercase text-zinc-500">Dikembalikan lewat</label>
              <Select value={method} onValueChange={v => v && setMethod(v)}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  {methods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              {method.toLowerCase() === 'cash' && (
                <p className="text-[11px] text-amber-400/90">Refund tunai tercatat di shift yang sedang buka dan mengurangi kas yang diharapkan.</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium uppercase text-zinc-500">Alasan (wajib)</label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="mis. Makanan salah / pelanggan komplain"
                className="bg-zinc-950 border-zinc-800" />
            </div>

            <p className="text-xs text-zinc-400">
              Nilai item ≈ <span className="font-mono text-zinc-200">{formatRp(itemValue)}</span>{' '}
              <span className="text-zinc-500">(jumlah akhir termasuk pajak & diskon dihitung server)</span>
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleRefund}
            disabled={submitting || loading || selected.length === 0 || !reason.trim() || !method}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Proses Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
