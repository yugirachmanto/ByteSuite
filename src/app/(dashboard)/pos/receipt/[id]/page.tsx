'use client'

import { useEffect, useRef, useState, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { ReceiptLayout, type ReceiptOrderData, type ReceiptLine, type ReceiptOrg, type ReceiptOutlet } from '@/components/pos/ReceiptLayout'

export default function POSReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params)
  const supabase = createClient()

  const [order, setOrder] = useState<ReceiptOrderData | null>(null)
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const [org, setOrg] = useState<ReceiptOrg | null>(null)
  const [outlet, setOutlet] = useState<ReceiptOutlet | null>(null)
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('58mm')
  const [loading, setLoading] = useState(true)
  const hasAutoPrinted = useRef(false)

  useEffect(() => {
    async function fetchReceipt() {
      setLoading(true)
      const { data: orderData } = await supabase
        .from('pos_orders')
        .select('id, created_at, payment_method, subtotal, tax_amount, total_amount, org_id, outlet_id, cashier_id')
        .eq('id', orderId)
        .single()

      if (!orderData) { setLoading(false); return }

      const [lineRes, orgRes, outletRes, cashierRes] = await Promise.all([
        supabase.from('pos_order_lines').select('id, qty, unit_price, subtotal, item_master(name)').eq('order_id', orderId),
        supabase.from('organizations').select('name, address, npwp, receipt_paper_width, qris_image_url, bank_name, bank_account_number, bank_account_holder').eq('id', orderData.org_id).single(),
        supabase.from('outlets').select('name, address').eq('id', orderData.outlet_id).single(),
        orderData.cashier_id
          ? supabase.from('user_profiles').select('full_name').eq('id', orderData.cashier_id).single()
          : Promise.resolve({ data: null }),
      ])

      setOrder({
        id: orderData.id,
        created_at: orderData.created_at,
        payment_method: orderData.payment_method,
        subtotal: orderData.subtotal,
        tax_amount: orderData.tax_amount,
        total_amount: orderData.total_amount,
        cashier_name: cashierRes.data?.full_name || null,
      })
      setLines((lineRes.data || []).map((l: any) => ({
        id: l.id,
        name: l.item_master?.name || 'Unknown Item',
        qty: l.qty,
        unit_price: l.unit_price,
        subtotal: l.subtotal,
      })))
      if (orgRes.data) {
        setOrg(orgRes.data)
        setPaperWidth((orgRes.data.receipt_paper_width as '58mm' | '80mm') || '58mm')
      }
      setOutlet(outletRes.data)
      setLoading(false)
    }
    fetchReceipt()
  }, [orderId])

  useEffect(() => {
    if (loading || hasAutoPrinted.current || !order) return
    hasAutoPrinted.current = true
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [loading, order])

  if (loading) {
    return <div className="py-20 text-center text-zinc-500 text-sm">Loading receipt...</div>
  }

  if (!order || !org || !outlet) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-zinc-400">Receipt not found.</p>
        <Link href="/pos"><Button variant="outline" className="border-zinc-800 text-zinc-300">Back to POS</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <div className="mx-auto max-w-sm mb-6 flex items-center justify-between print:hidden">
        <Link href="/pos">
          <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to POS
          </Button>
        </Link>
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
      </div>

      <div className="mx-auto max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-4 print:p-0 print:border-0 print:bg-transparent print:shadow-none">
        <ReceiptLayout order={order} lines={lines} org={org} outlet={outlet} paperWidth={paperWidth} />
      </div>
    </div>
  )
}
