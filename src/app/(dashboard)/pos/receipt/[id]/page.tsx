'use client'

import { useEffect, useRef, useState, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Printer, Loader2, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ReceiptLayout, type ReceiptOrderData, type ReceiptLine, type ReceiptPayment, type ReceiptOrg, type ReceiptOutlet } from '@/components/pos/ReceiptLayout'
import { getCurrentUserRole, canAccess } from '@/lib/auth/canAccess'

const VOID_ROLES = ['owner', 'admin', 'cashier']

interface OrderMeta {
  status: string
  created_at: string
  voided_by_name: string | null
  voided_at: string | null
  void_reason: string | null
}

export default function POSReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params)
  const supabase = createClient()

  const [order, setOrder] = useState<ReceiptOrderData | null>(null)
  const [orderMeta, setOrderMeta] = useState<OrderMeta | null>(null)
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const [payments, setPayments] = useState<ReceiptPayment[]>([])
  const [org, setOrg] = useState<ReceiptOrg | null>(null)
  const [outlet, setOutlet] = useState<ReceiptOutlet | null>(null)
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('58mm')
  const [loading, setLoading] = useState(true)
  const [canVoid, setCanVoid] = useState(false)
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const hasAutoPrinted = useRef(false)

  useEffect(() => {
    getCurrentUserRole(supabase).then((role) => setCanVoid(canAccess(role, VOID_ROLES)))
  }, [])

  const fetchReceipt = async () => {
    setLoading(true)
    const { data: orderData } = await supabase
      .from('pos_orders')
      .select('id, created_at, payment_method, subtotal, tax_amount, total_amount, discount_amount, org_id, outlet_id, cashier_id, status, voided_by, voided_at, void_reason')
      .eq('id', orderId)
      .single()

    if (!orderData) { setLoading(false); return }

    const [lineRes, paymentRes, orgRes, outletRes, cashierRes, voidedByRes] = await Promise.all([
      supabase.from('pos_order_lines').select('id, qty, unit_price, subtotal, discount_amount, item_master(name)').eq('order_id', orderId),
      supabase.from('pos_order_payments').select('id, payment_method, amount, cash_received, change_due').eq('order_id', orderId),
      supabase.from('organizations').select('name, address, npwp, receipt_paper_width, qris_image_url, bank_name, bank_account_number, bank_account_holder').eq('id', orderData.org_id).single(),
      supabase.from('outlets').select('name, address').eq('id', orderData.outlet_id).single(),
      orderData.cashier_id
        ? supabase.from('user_profiles').select('full_name').eq('id', orderData.cashier_id).single()
        : Promise.resolve({ data: null }),
      orderData.voided_by
        ? supabase.from('user_profiles').select('full_name').eq('id', orderData.voided_by).single()
        : Promise.resolve({ data: null }),
    ])

    setOrder({
      id: orderData.id,
      created_at: orderData.created_at,
      payment_method: orderData.payment_method,
      subtotal: orderData.subtotal,
      tax_amount: orderData.tax_amount,
      total_amount: orderData.total_amount,
      discount_amount: orderData.discount_amount || 0,
      cashier_name: cashierRes.data?.full_name || null,
    })
    setOrderMeta({
      status: orderData.status,
      created_at: orderData.created_at,
      voided_by_name: voidedByRes.data?.full_name || null,
      voided_at: orderData.voided_at,
      void_reason: orderData.void_reason,
    })
    setLines((lineRes.data || []).map((l: any) => ({
      id: l.id,
      name: l.item_master?.name || 'Unknown Item',
      qty: l.qty,
      unit_price: l.unit_price,
      subtotal: l.subtotal,
      discount_amount: l.discount_amount || 0,
    })))
    setPayments((paymentRes.data || []).map((p: any) => ({
      id: p.id,
      payment_method: p.payment_method,
      amount: p.amount,
      cash_received: p.cash_received,
      change_due: p.change_due,
    })))
    if (orgRes.data) {
      setOrg(orgRes.data)
      setPaperWidth((orgRes.data.receipt_paper_width as '58mm' | '80mm') || '58mm')
    }
    setOutlet(outletRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchReceipt() }, [orderId])

  useEffect(() => {
    if (loading || hasAutoPrinted.current || !order || orderMeta?.status !== 'completed') return
    hasAutoPrinted.current = true
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [loading, order, orderMeta])

  const isSameDay = orderMeta ? new Date(orderMeta.created_at).toDateString() === new Date().toDateString() : false
  const canShowVoidButton = canVoid && orderMeta?.status === 'completed' && isSameDay

  const handleVoid = async () => {
    if (!voidReason.trim()) {
      toast.error('A reason is required')
      return
    }
    setVoiding(true)
    try {
      const res = await fetch('/api/pos/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, reason: voidReason })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to void order')

      toast.success('Order voided')
      setVoidDialogOpen(false)
      setVoidReason('')
      fetchReceipt()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setVoiding(false)
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-zinc-500 text-sm">Loading receipt...</div>
  }

  if (!order || !org || !outlet || !orderMeta) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-zinc-400">Receipt not found.</p>
        <Link href="/pos"><Button variant="outline" className="border-zinc-800 text-zinc-300">Back to POS</Button></Link>
      </div>
    )
  }

  const isVoided = orderMeta.status === 'voided'

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <div className="mx-auto max-w-sm mb-6 flex items-center justify-between print:hidden">
        <Link href="/pos">
          <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to POS
          </Button>
        </Link>
        {!isVoided && (
          <div className="flex items-center gap-2">
            <Select value={paperWidth} onValueChange={(val: any) => val && setPaperWidth(val)}>
              <SelectTrigger className="w-24 bg-zinc-900 border-zinc-800 text-zinc-100 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="58mm">58mm</SelectItem>
                <SelectItem value="80mm">80mm</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => window.print()} className="bg-indigo-600 text-white hover:bg-indigo-700">
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-sm mb-4 print:hidden space-y-3">
        {isVoided && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-3 text-sm">
            <Badge variant="outline" className="bg-red-950/30 text-red-400 border-red-900/50 mb-2">VOIDED</Badge>
            <p className="text-zinc-300">
              By {orderMeta.voided_by_name || 'Unknown'} on {orderMeta.voided_at ? format(new Date(orderMeta.voided_at), 'dd MMM yyyy, HH:mm') : '-'}
            </p>
            {orderMeta.void_reason && <p className="text-zinc-500 mt-1">Reason: {orderMeta.void_reason}</p>}
          </div>
        )}

        {canShowVoidButton && (
          <Button
            variant="outline"
            className="w-full border-red-900/50 bg-red-950/10 text-red-400 hover:bg-red-900/20"
            onClick={() => setVoidDialogOpen(true)}
          >
            <Ban className="mr-2 h-4 w-4" /> Void Order
          </Button>
        )}
      </div>

      <div className="mx-auto max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-4 print:p-0 print:border-0 print:bg-transparent print:shadow-none">
        <ReceiptLayout order={order} lines={lines} payments={payments} org={org} outlet={outlet} paperWidth={paperWidth} voided={isVoided} />
      </div>

      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Void this order?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This reverses the stock deduction and removes the GL entries for this sale. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs text-zinc-500 font-medium uppercase">Reason (required)</label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Wrong item entered by cashier"
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">Cancel</AlertDialogCancel>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleVoid}
              disabled={voiding || !voidReason.trim()}
            >
              {voiding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Void Order
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
