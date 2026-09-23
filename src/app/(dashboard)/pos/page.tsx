'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Minus, Search, Trash2, CreditCard, Loader2, ShoppingCart, Ban, CheckCircle2, Printer, Monitor, Clock, LogOut, Wallet, ChevronUp, RefreshCw, FileText, Mail, MessageCircle, Maximize, Minimize } from 'lucide-react'
import { formatRp } from '@/lib/format'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { format } from 'date-fns'
import { enqueue } from '@/lib/pos/offlineQueue'
import { useOfflineCheckoutSync } from '@/lib/pos/useOfflineCheckoutSync'
import { getCurrentUserRole, canAccess } from '@/lib/auth/canAccess'
import { ReceiptLayout, type ReceiptOrderData, type ReceiptLine, type ReceiptPayment, type ReceiptOrg, type ReceiptOutlet } from '@/components/pos/ReceiptLayout'
import { captureElementAsPngBlob, downloadBlob, shareReceiptImage, blobToBase64 } from '@/lib/pos/receiptImage'

const DISCOUNT_ROLES = ['owner', 'admin']

interface Product {
  id: string
  name: string
  category: string
  price: number
  posCategory?: string
  imageUrl?: string
}

type DiscountType = 'percent' | 'fixed' | null

type CartItem = Product & {
  qty: number
  discountType: DiscountType
  discountValue: number
}

interface Tender {
  id: string
  method: string
  amount: number
  cashReceived: number
  notes: string
}

function isCashMethod(method: string): boolean {
  return method.toLowerCase() === 'cash'
}

function isComplimentaryMethod(method: string): boolean {
  return /komplimen|complimentary|compliment/i.test(method)
}

function computeDiscountAmount(type: DiscountType, value: number, base: number): number {
  if (!type || !value || value <= 0 || base <= 0) return 0
  if (type === 'percent') return Math.round(base * Math.min(value, 100) / 100)
  return Math.min(Math.max(value, 0), base)
}

export default function POSPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [tenders, setTenders] = useState<Tender[]>([])
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['Cash', 'Card', 'QRIS'])
  const [processing, setProcessing] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<'payment' | 'success'>('payment')
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
  const [lastOrderTotal, setLastOrderTotal] = useState<number | null>(null)
  const [lastOrderChange, setLastOrderChange] = useState<number>(0)
  const [taxRate, setTaxRate] = useState(0)
  const [qrisImageUrl, setQrisImageUrl] = useState('')
  const [bankInfo, setBankInfo] = useState({ bankName: '', bankAccountNumber: '', bankAccountHolder: '' })
  const [posEnabled, setPosEnabled] = useState(true)
  const cfdChannelRef = useRef<RealtimeChannel | null>(null)
  const offlineQueueSync = useOfflineCheckoutSync()

  const [shift, setShift] = useState<{ id: string; opened_at: string; opening_float: number } | null>(null)
  const [shiftLoading, setShiftLoading] = useState(true)
  const [openingFloat, setOpeningFloat] = useState('')
  const [openingNotes, setOpeningNotes] = useState('')
  const [openingShift, setOpeningShift] = useState(false)
  const [closeShiftOpen, setCloseShiftOpen] = useState(false)
  const [cashSalesSoFar, setCashSalesSoFar] = useState(0)
  const [countedCash, setCountedCash] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [closingShift, setClosingShift] = useState(false)
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false)
  const [canDiscount, setCanDiscount] = useState(false)
  const [orderDiscountType, setOrderDiscountType] = useState<DiscountType>(null)
  const [orderDiscountValue, setOrderDiscountValue] = useState(0)

  // Receipt preview + send-via-email/WhatsApp, shown inline on the payment
  // success screen so the cashier never has to leave the POS page for it.
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrderData | null>(null)
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([])
  const [receiptPayments, setReceiptPayments] = useState<ReceiptPayment[]>([])
  const [receiptOrg, setReceiptOrg] = useState<ReceiptOrg | null>(null)
  const [receiptOutlet, setReceiptOutlet] = useState<ReceiptOutlet | null>(null)
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<'58mm' | '80mm'>('58mm')
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [sendEmailTo, setSendEmailTo] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [sendWaPhone, setSendWaPhone] = useState('')
  const [sendingWa, setSendingWa] = useState(false)
  const receiptImageRef = useRef<HTMLDivElement>(null)

  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen().catch(() => toast.error('Layar penuh tidak didukung di browser ini'))
  }

  useEffect(() => {
    getCurrentUserRole(supabase).then((role) => setCanDiscount(canAccess(role, DISCOUNT_ROLES)))
  }, [])

  const outletName = outlets.find(o => o.id === selectedOutletId)?.name || 'ByteSuite'

  const grossSubtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0)
  const lineDiscountTotal = cart.reduce((sum, item) => sum + computeDiscountAmount(item.discountType, item.discountValue, item.price * item.qty), 0)
  const preOrderDiscountSubtotal = grossSubtotal - lineDiscountTotal
  const orderDiscountAmount = computeDiscountAmount(orderDiscountType, orderDiscountValue, preOrderDiscountSubtotal)
  const discountTotal = lineDiscountTotal + orderDiscountAmount
  const subtotal = preOrderDiscountSubtotal - orderDiscountAmount
  const tax = subtotal * (taxRate / 100)
  const total = subtotal + tax

  // Non-cash tenders are entered as an exact amount charged. At most one
  // Cash tender is expected — it auto-fills to whatever remains after the
  // non-cash tenders (capped by what was actually received), so the
  // classic single-cash-sale flow (pick Cash, type amount received, see
  // change) still works exactly like before, just as a special case of
  // the general tender list.
  const nonCashApplied = tenders.filter(t => !isCashMethod(t.method)).reduce((sum, t) => sum + (t.amount || 0), 0)
  const remainingForCash = Math.max(0, total - nonCashApplied)
  const cashTender = tenders.find(t => isCashMethod(t.method))
  const cashApplied = cashTender ? Math.min(cashTender.cashReceived || 0, remainingForCash) : 0
  const changeDue = cashTender ? Math.max(0, (cashTender.cashReceived || 0) - cashApplied) : 0
  const totalApplied = nonCashApplied + cashApplied
  const remainingBalance = Math.max(0, total - totalApplied)

  const addTenderRow = () => {
    setTenders(prev => [...prev, { id: crypto.randomUUID(), method: '', amount: Math.max(0, total - totalApplied), cashReceived: 0, notes: '' }])
  }

  const removeTenderRow = (id: string) => {
    setTenders(prev => prev.filter(t => t.id !== id))
  }

  const updateTenderMethod = (id: string, method: string) => {
    setTenders(prev => prev.map(t => t.id === id ? { ...t, method, amount: isCashMethod(method) ? 0 : t.amount, cashReceived: 0 } : t))
  }

  const updateTenderAmount = (id: string, amount: number) => {
    setTenders(prev => prev.map(t => t.id === id ? { ...t, amount } : t))
  }

  const updateTenderCashReceived = (id: string, cashReceived: number) => {
    setTenders(prev => prev.map(t => t.id === id ? { ...t, cashReceived } : t))
  }

  const updateTenderNotes = (id: string, notes: string) => {
    setTenders(prev => prev.map(t => t.id === id ? { ...t, notes } : t))
  }

  // Persistent Realtime channel for the Customer Facing Display — one
  // channel per outlet, opened once and reused, not torn down/reopened per
  // cart change (unlike the old same-device-only BroadcastChannel this
  // replaces). Works across separate devices since it's a real network channel.
  useEffect(() => {
    if (!selectedOutletId) return
    const channel = supabase.channel(`pos-cfd-${selectedOutletId}`)
    channel.subscribe()
    cfdChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      cfdChannelRef.current = null
    }
  }, [selectedOutletId])

  useEffect(() => {
    cfdChannelRef.current?.send({
      type: 'broadcast',
      event: 'sync_state',
      payload: {
        cart,
        subtotal,
        tax,
        total,
        isCheckoutOpen,
        tenders,
        outletName,
        qrisImageUrl,
        bankInfo,
        products
      }
    })
  }, [cart, subtotal, tax, total, isCheckoutOpen, tenders, outletName, qrisImageUrl, bankInfo, products])

  const openCustomerDisplay = () => {
    if (!selectedOutletId) return
    window.open(`/pos/customer?outlet=${selectedOutletId}`, '_blank')
  }

  const fetchShift = async () => {
    if (!selectedOutletId) return
    setShiftLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setShiftLoading(false); return }

    const { data } = await supabase
      .from('pos_shifts')
      .select('id, opened_at, opening_float')
      .eq('cashier_id', user.id)
      .eq('outlet_id', selectedOutletId)
      .eq('status', 'open')
      .maybeSingle()

    setShift(data)
    setShiftLoading(false)
  }

  useEffect(() => { fetchShift() }, [selectedOutletId])

  const handleOpenShift = async () => {
    const floatAmount = parseFloat(openingFloat)
    if (isNaN(floatAmount) || floatAmount < 0) {
      toast.error('Enter a valid opening cash amount')
      return
    }
    setOpeningShift(true)
    try {
      const res = await fetch('/api/pos/shift/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outlet_id: selectedOutletId, opening_float: floatAmount, notes: openingNotes || null })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to open shift')

      toast.success('Shift opened')
      setOpeningFloat('')
      setOpeningNotes('')
      fetchShift()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setOpeningShift(false)
    }
  }

  const openCloseShiftDialog = async () => {
    if (!shift) return
    // Sum only the cash TENDER's amount, not the whole order total — a
    // split-tender order (part cash, part something else) would otherwise
    // overstate cash actually collected.
    const { data: shiftOrders } = await supabase
      .from('pos_orders')
      .select('id')
      .eq('shift_id', shift.id)
      .eq('status', 'completed')

    const orderIds = (shiftOrders || []).map(o => o.id)
    let sum = 0
    if (orderIds.length > 0) {
      const { data: cashTenders } = await supabase
        .from('pos_order_payments')
        .select('amount')
        .in('order_id', orderIds)
        .ilike('payment_method', 'cash')
      sum = (cashTenders || []).reduce((s, t) => s + (t.amount || 0), 0)
    }
    setCashSalesSoFar(sum)
    setCountedCash('')
    setClosingNotes('')
    setCloseShiftOpen(true)
  }

  const handleCloseShift = async () => {
    if (!shift) return
    const counted = parseFloat(countedCash)
    if (isNaN(counted) || counted < 0) {
      toast.error('Enter a valid counted cash amount')
      return
    }
    setClosingShift(true)
    try {
      const res = await fetch('/api/pos/shift/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shift.id, counted_cash: counted, notes: closingNotes || null })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to close shift')

      const closedShiftId = shift.id
      toast.success('Shift closed', {
        action: {
          label: 'Lihat Laporan',
          onClick: () => window.open(`/pos/shift-report/${closedShiftId}`, '_blank')
        }
      })
      setCloseShiftOpen(false)
      setShift(null)
      fetchShift()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setClosingShift(false)
    }
  }

  const expectedCash = (shift?.opening_float || 0) + cashSalesSoFar
  const liveVariance = countedCash ? parseFloat(countedCash) - expectedCash : 0

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchData() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        const { data: profile, error: profileErr } = await supabase
          .from('user_profiles')
          .select('org_id')
          .eq('id', user.id)
          .single()

        if (profile?.org_id) {
          const { data: orgData, error: orgErr } = await supabase
            .from('organizations')
            .select('pos_tax_rate, qris_image_url, bank_name, bank_account_number, bank_account_holder, pos_enabled')
            .eq('id', profile.org_id)
            .single()

          if (orgData) {
            setTaxRate(orgData.pos_tax_rate || 0)
            setQrisImageUrl(orgData.qris_image_url || '')
            setBankInfo({
              bankName: orgData.bank_name || '',
              bankAccountNumber: orgData.bank_account_number || '',
              bankAccountHolder: orgData.bank_account_holder || ''
            })
            setPosEnabled(orgData.pos_enabled ?? true)
          }
        }

        const { data: items, error: itemsError } = await supabase
          .from('item_master')
          .select('id, name, category, pos_category, image_url')
          .eq('category', 'finished')
          .eq('show_on_pos', true)
        
        if (itemsError) throw itemsError

        if (items && items.length > 0) {
          const { data: prices } = await supabase
            .from('product_prices')
            .select('item_id, selling_price')
            .in('item_id', items.map(i => i.id))
            .eq('outlet_id', selectedOutletId)
          
          const priceMap = new Map(prices?.map(p => [p.item_id, p.selling_price]) || [])
          const mapped = items.map(item => ({
            id: item.id,
            name: item.name,
            category: item.category,
            price: priceMap.get(item.id) || 0,
            posCategory: item.pos_category || 'Uncategorized',
            imageUrl: item.image_url || null
          }))
          setProducts(mapped)
        }

        const { data: methods } = await supabase
          .from('pos_payment_method_mapping')
          .select('payment_method, is_pos_visible')
          .or(`outlet_id.eq.${selectedOutletId},outlet_id.is.null`)
          .eq('is_pos_visible', true)

        if (methods && methods.length > 0) {
          setPaymentMethods(Array.from(new Set(methods.map(m => m.payment_method))))
        }
      } catch (err: any) {
        console.error('[POS] Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedOutletId, supabase])

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id)
      if (existing) {
        return prev.map(p => p.id === product.id ? { ...p, qty: p.qty + 1 } : p)
      }
      return [...prev, { ...product, qty: 1, discountType: null, discountValue: 0 }]
    })
  }

  const updateLineDiscount = (id: string, discountType: DiscountType, discountValue: number) => {
    setCart(prev => prev.map(p => p.id === id ? { ...p, discountType, discountValue } : p))
  }

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(p => {
      if (p.id === id) {
        const newQty = Math.max(0, p.qty + delta)
        return { ...p, qty: newQty }
      }
      return p
    }).filter(p => p.qty > 0))
  }

  const clearCart = () => {
    setCart([])
    setOrderDiscountType(null)
    setOrderDiscountValue(0)
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory === 'All' || p.posCategory === selectedCategory
    return matchesSearch && matchesCategory
  })

  const uniqueCategories = ['All', ...Array.from(new Set(products.map(p => p.posCategory || 'Uncategorized'))).sort()]

  const handleCheckout = async () => {
    if (tenders.some(t => !t.method)) {
      toast.error('Please select a payment method for every tender')
      return
    }
    if (remainingBalance > 0) {
      toast.error(`Payment is short by ${formatRp(remainingBalance)}`)
      return
    }
    if (tenders.some(t => isComplimentaryMethod(t.method) && !t.notes.trim())) {
      toast.error('Please enter who the complimentary item is for')
      return
    }

    const clientRequestId = crypto.randomUUID()
    const checkoutLines = cart.map(item => ({
      item_id: item.id,
      qty: item.qty,
      discount_type: item.discountType,
      discount_value: item.discountValue
    }))
    const checkoutTenders = tenders.map(t => isCashMethod(t.method)
      ? { method: t.method, amount: cashApplied, cash_received: cashTender?.cashReceived || 0, notes: t.notes.trim() || null }
      : { method: t.method, amount: t.amount, notes: t.notes.trim() || null }
    ).filter(t => t.amount > 0)

    setProcessing(true)
    try {
      let res: Response
      try {
        res = await fetch('/api/pos/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outlet_id: selectedOutletId,
            tenders: checkoutTenders,
            lines: checkoutLines,
            client_request_id: clientRequestId,
            shift_id: shift?.id ?? null,
            order_discount_type: orderDiscountType,
            order_discount_value: orderDiscountValue
          })
        })
      } catch {
        // The request never reached the server — a genuine network blip.
        // Queue it for background retry instead of blocking the cashier.
        enqueue({
          clientRequestId,
          outletId: selectedOutletId!,
          tenders: checkoutTenders,
          lines: checkoutLines,
          shiftId: shift?.id ?? null,
          queuedAt: new Date().toISOString(),
          orderDiscountType,
          orderDiscountValue
        })
        offlineQueueSync.refreshPendingCount()
        toast.success('No connection — sale queued, will sync automatically')
        setCart([])
        setOrderDiscountType(null)
        setOrderDiscountValue(0)
        setTenders([])
        setIsCheckoutOpen(false)
        return
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to checkout')

      toast.success('Transaction completed successfully!')

      cfdChannelRef.current?.send({ type: 'broadcast', event: 'checkout_success' })

      setLastOrderTotal(total)
      setLastOrderChange(changeDue)
      setCart([])
      setOrderDiscountType(null)
      setOrderDiscountValue(0)
      setLastOrderId(data.order_id)
      setCheckoutStep('success')
      fetchReceiptForOrder(data.order_id)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setProcessing(false)
    }
  }

  const handlePrintReceipt = () => {
    if (lastOrderId) window.open(`/pos/receipt/${lastOrderId}`, '_blank')
  }

  // Same query shape as the standalone receipt page — kept here too so the
  // payment-success screen can show a live preview and send it via email/
  // WhatsApp without navigating away from the POS terminal.
  const fetchReceiptForOrder = async (orderId: string) => {
    setReceiptLoading(true)
    try {
      const { data: orderData } = await supabase
        .from('pos_orders')
        .select('id, created_at, payment_method, subtotal, tax_amount, total_amount, discount_amount, org_id, outlet_id, cashier_id')
        .eq('id', orderId)
        .single()

      if (!orderData) return

      const [lineRes, paymentRes, orgRes, outletRes, cashierRes] = await Promise.all([
        supabase.from('pos_order_lines').select('id, qty, unit_price, subtotal, discount_amount, item_master(name)').eq('order_id', orderId),
        supabase.from('pos_order_payments').select('id, payment_method, amount, cash_received, change_due, notes').eq('order_id', orderId),
        supabase.from('organizations').select('name, address, npwp, receipt_paper_width, qris_image_url, bank_name, bank_account_number, bank_account_holder, receipt_logo_url').eq('id', orderData.org_id).single(),
        supabase.from('outlets').select('name, address').eq('id', orderData.outlet_id).single(),
        orderData.cashier_id
          ? supabase.from('user_profiles').select('full_name').eq('id', orderData.cashier_id).single()
          : Promise.resolve({ data: null }),
      ])

      setReceiptOrder({
        id: orderData.id,
        created_at: orderData.created_at,
        payment_method: orderData.payment_method,
        subtotal: orderData.subtotal,
        tax_amount: orderData.tax_amount,
        total_amount: orderData.total_amount,
        discount_amount: orderData.discount_amount || 0,
        cashier_name: cashierRes.data?.full_name || null,
      })
      setReceiptLines((lineRes.data || []).map((l: any) => ({
        id: l.id,
        name: l.item_master?.name || 'Unknown Item',
        qty: l.qty,
        unit_price: l.unit_price,
        subtotal: l.subtotal,
        discount_amount: l.discount_amount || 0,
      })))
      setReceiptPayments((paymentRes.data || []).map((p: any) => ({
        id: p.id,
        payment_method: p.payment_method,
        amount: p.amount,
        cash_received: p.cash_received,
        change_due: p.change_due,
        notes: p.notes,
      })))
      if (orgRes.data) {
        setReceiptOrg(orgRes.data)
        setReceiptPaperWidth((orgRes.data.receipt_paper_width as '58mm' | '80mm') || '58mm')
      }
      setReceiptOutlet(outletRes.data)
    } finally {
      setReceiptLoading(false)
    }
  }

  const handleSendEmail = async () => {
    const email = sendEmailTo.trim()
    if (!email) {
      toast.error('Enter a customer email address')
      return
    }
    if (!lastOrderId) return
    setSendingEmail(true)
    try {
      // Best-effort: attach a rasterized copy alongside the HTML body. A
      // capture failure shouldn't block the (already-working) HTML-only send.
      let receiptImageBase64: string | undefined
      if (receiptImageRef.current) {
        try {
          const blob = await captureElementAsPngBlob(receiptImageRef.current)
          receiptImageBase64 = await blobToBase64(blob)
        } catch {
          // fall through and send without the attachment
        }
      }

      const res = await fetch('/api/pos/receipt/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: lastOrderId, to_email: email, receipt_image_base64: receiptImageBase64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send receipt')
      toast.success(`Receipt sent to ${email}`)
      setSendEmailTo('')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSendingEmail(false)
    }
  }

  const handleSendWhatsApp = async () => {
    const phone = sendWaPhone.trim().replace(/[^\d+]/g, '')
    if (!phone) {
      toast.error('Enter a customer WhatsApp number')
      return
    }
    if (!receiptOrder || !receiptOrg || !receiptImageRef.current) return
    // wa.me needs digits only, country code first, no leading +/0.
    const normalizedPhone = phone.startsWith('+') ? phone.slice(1) : phone.startsWith('0') ? `62${phone.slice(1)}` : phone

    const itemLines = receiptLines.map((l) => `${l.qty}x ${l.name} - ${formatRp(l.subtotal)}`).join('\n')
    const message = [
      `*${receiptOrg.name}*`,
      receiptOutlet?.name || '',
      `Order #${receiptOrder.id.slice(0, 8).toUpperCase()} - ${format(new Date(receiptOrder.created_at), 'dd/MM/yyyy HH:mm')}`,
      '',
      itemLines,
      '',
      `*TOTAL: ${formatRp(receiptOrder.total_amount)}*`,
      `Dibayar via ${receiptOrder.payment_method}`,
      '',
      'Terima kasih atas kunjungan Anda!',
    ].filter(Boolean).join('\n')

    setSendingWa(true)
    try {
      const filename = `struk-${receiptOrder.id.slice(0, 8)}.png`
      const blob = await captureElementAsPngBlob(receiptImageRef.current)
      // The OS share sheet (WhatsApp included, on mobile) can take an image
      // + caption, but a website can never pre-target a specific WhatsApp
      // contact together with a file — only plain text via wa.me can do
      // that. So: try sharing the image (recipient picked manually inside
      // WhatsApp), and only fall back to the old pre-filled-number text
      // link when file sharing isn't available on this browser/device.
      const result = await shareReceiptImage(blob, filename, message)
      if (result === 'shared') {
        toast.success('Struk terkirim ke aplikasi share')
      } else if (result === 'cancelled') {
        // user backed out of the share sheet — no toast needed
      } else {
        downloadBlob(blob, filename)
        window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`, '_blank')
        toast.info('Gambar struk diunduh — lampirkan manual di WhatsApp (perangkat ini belum mendukung share gambar otomatis)')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to prepare receipt image')
    } finally {
      setSendingWa(false)
    }
  }

  const startNewSale = () => {
    setIsCheckoutOpen(false)
    setCheckoutStep('payment')
    setTenders([])
    setLastOrderId(null)
    setLastOrderTotal(null)
    setLastOrderChange(0)
    setReceiptOrder(null)
    setReceiptLines([])
    setReceiptPayments([])
    setReceiptOrg(null)
    setReceiptOutlet(null)
    setSendEmailTo('')
    setSendWaPhone('')
  }

  // Shared cart items + totals + Charge button, rendered both in the
  // desktop side panel and the mobile bottom sheet so the two stay in sync
  // without duplicating markup. onCharge lets the mobile sheet close
  // itself before the checkout dialog opens on top.
  const CartContent = ({ onCharge }: { onCharge?: () => void } = {}) => (
    <>
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/80 flex justify-between items-center shrink-0">
        <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-indigo-400" />
          Current Order
        </h3>
        <Button variant="ghost" size="sm" onClick={clearCart} className="text-rose-400 hover:text-rose-300 hover:bg-rose-400/10 h-8 px-2">
          <Trash2 className="h-4 w-4 mr-1" /> Clear
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2">
            <ShoppingCart className="h-8 w-8 opacity-20" />
            <p className="text-sm">Cart is empty</p>
          </div>
        ) : (
          cart.map(item => {
            const lineGross = item.price * item.qty
            const lineDiscountAmount = computeDiscountAmount(item.discountType, item.discountValue, lineGross)
            return (
            <div key={item.id} className="flex flex-col gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-800/50">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-zinc-200 line-clamp-1">{item.name}</span>
                <div className="text-right">
                  {lineDiscountAmount > 0 && (
                    <div className="text-xs text-zinc-500 line-through">{formatRp(lineGross)}</div>
                  )}
                  <span className="text-sm font-semibold text-zinc-300">{formatRp(lineGross - lineDiscountAmount)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">{formatRp(item.price)} each</span>
                <div className="flex items-center gap-3 bg-zinc-900 rounded-md p-1 border border-zinc-800">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => updateQty(item.id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-medium w-4 text-center">{item.qty}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => updateQty(item.id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {canDiscount && (
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    className={`text-xs px-2 py-1 rounded ${item.discountType === 'percent' ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
                    onClick={() => updateLineDiscount(item.id, 'percent', item.discountValue)}
                  >%</button>
                  <button
                    type="button"
                    className={`text-xs px-2 py-1 rounded ${item.discountType === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
                    onClick={() => updateLineDiscount(item.id, 'fixed', item.discountValue)}
                  >Rp</button>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Diskon"
                    className="h-7 text-xs bg-zinc-900 border-zinc-800 w-24"
                    value={item.discountValue || ''}
                    onChange={(e) => updateLineDiscount(item.id, item.discountType ?? 'percent', Number(e.target.value))}
                  />
                  {item.discountType && item.discountValue > 0 && (
                    <button type="button" className="text-xs text-rose-400 hover:text-rose-300" onClick={() => updateLineDiscount(item.id, null, 0)}>
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
            )
          })
        )}
      </div>

      <div className="p-4 bg-zinc-950 border-t border-zinc-800 shrink-0">
        {canDiscount && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs text-zinc-500 mr-auto">Diskon Pesanan</span>
            <button
              type="button"
              className={`text-xs px-2 py-1 rounded ${orderDiscountType === 'percent' ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
              onClick={() => setOrderDiscountType('percent')}
            >%</button>
            <button
              type="button"
              className={`text-xs px-2 py-1 rounded ${orderDiscountType === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
              onClick={() => setOrderDiscountType('fixed')}
            >Rp</button>
            <Input
              type="number"
              min={0}
              placeholder="0"
              className="h-7 text-xs bg-zinc-900 border-zinc-800 w-24"
              value={orderDiscountValue || ''}
              onChange={(e) => { setOrderDiscountValue(Number(e.target.value)); if (!orderDiscountType) setOrderDiscountType('percent') }}
            />
          </div>
        )}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm text-zinc-400">
            <span>Subtotal</span>
            <span>{formatRp(grossSubtotal)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-sm text-emerald-400">
              <span>Diskon</span>
              <span>-{formatRp(discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-zinc-400">
            <span>Tax</span>
            <span>{formatRp(tax)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-zinc-100 pt-2 border-t border-zinc-800">
            <span>Total</span>
            <span className="text-indigo-400">{formatRp(total)}</span>
          </div>
        </div>

        <Button
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium h-12 text-lg shadow-lg shadow-indigo-500/20"
          disabled={cart.length === 0}
          onClick={() => { onCharge?.(); setTenders([{ id: crypto.randomUUID(), method: '', amount: total, cashReceived: 0, notes: '' }]); setIsCheckoutOpen(true) }}
        >
          Charge {formatRp(total)}
        </Button>
      </div>
    </>
  )

  if (!loading && !posEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] -mt-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 text-center px-6">
        <Ban className="h-10 w-10 text-zinc-600 mb-4" />
        <h2 className="text-lg font-semibold text-zinc-200">POS is disabled for this organization</h2>
        <p className="text-sm text-zinc-500 mt-1 max-w-sm">
          An owner or admin can re-enable it from Settings → System.
        </p>
      </div>
    )
  }

  if (!shiftLoading && !shift) {
    return (
      <div className="flex flex-col h-[calc(100dvh-4rem)]">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div className="text-center space-y-1">
              <Clock className="h-8 w-8 text-indigo-400 mx-auto" />
              <h3 className="text-lg font-semibold text-zinc-100">Open Shift</h3>
              <p className="text-xs text-zinc-500">Count your starting cash drawer before ringing up sales.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Opening Cash Float</label>
              <Input
                type="number"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                placeholder="0"
                className="bg-zinc-950 border-zinc-800 h-11 text-base"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Notes (optional)</label>
              <Textarea
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11"
              onClick={handleOpenShift}
              disabled={openingShift || !openingFloat}
            >
              {openingShift ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
              Start Shift
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      <div className="flex items-center gap-1.5 mb-2">
        {offlineQueueSync.pendingCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-zinc-900 border border-zinc-800 rounded-md px-2 h-9">
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${offlineQueueSync.isSyncing ? 'animate-spin' : ''}`} />
            <span className="whitespace-nowrap">{offlineQueueSync.pendingCount} pending</span>
          </div>
        )}
        {shift && (
          <div
            className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-md px-2 h-9 mr-auto"
            title={`Modal awal ${formatRp(shift.opening_float)}`}
          >
            <Clock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span className="whitespace-nowrap">Shift {format(new Date(shift.opened_at), 'HH:mm')}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {shift && (
            <>
              <Button
                variant="outline"
                size="icon"
                title="Preview Laporan"
                aria-label="Preview Laporan"
                className="h-9 w-9 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                onClick={() => window.open(`/pos/shift-report/${shift.id}`, '_blank')}
              >
                <FileText className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Close Shift"
                aria-label="Close Shift"
                className="h-9 w-9 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                onClick={openCloseShiftDialog}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="icon"
            title="Customer Display"
            aria-label="Customer Display"
            className="h-9 w-9 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            onClick={openCustomerDisplay}
            disabled={!selectedOutletId}
          >
            <Monitor className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
            aria-label="Layar Penuh"
            className="h-9 w-9 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 h-full flex-1 min-h-0">
        {/* Product Grid */}
        <div className="flex-1 flex flex-col min-h-0 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-zinc-800 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input 
                placeholder="Search products..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-900 border-zinc-800 focus-visible:ring-indigo-500"
              />
            </div>
            
            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
              {uniqueCategories.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full whitespace-nowrap ${
                    selectedCategory === cat 
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent' 
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-4 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-500">
                No products found
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProducts.map(product => (
                  <Card 
                    key={product.id} 
                    className="bg-zinc-900 border-zinc-800 hover:border-indigo-500/50 cursor-pointer transition-colors"
                    onClick={() => addToCart(product)}
                  >
                    <CardContent className="p-4 flex flex-col items-center text-center h-full justify-between gap-3">
                      <div className="w-16 h-16 bg-zinc-800 rounded-xl flex items-center justify-center mb-2 overflow-hidden border border-zinc-700/50">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl font-bold text-zinc-600">{product.name.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-200 leading-tight">{product.name}</h3>
                        <p className="text-xs text-zinc-500 mt-1">{product.category}</p>
                      </div>
                      <div className="text-indigo-400 font-bold text-sm">
                        {formatRp(product.price)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cart Panel — desktop/tablet only; mobile uses the floating bar + sheet below */}
        <div className="hidden lg:flex w-96 flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl shrink-0">
          <CartContent />
        </div>
      </div>

      {/* Mobile floating cart bar — opens the cart as a bottom sheet */}
      {cart.length > 0 && (
        <button
          onClick={() => setIsCartSheetOpen(true)}
          className="lg:hidden fixed bottom-4 left-4 right-4 z-40 flex items-center justify-between gap-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 h-14 shadow-lg shadow-indigo-900/40 transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingCart className="h-5 w-5" />
            {cart.reduce((s, i) => s + i.qty, 0)} item{cart.reduce((s, i) => s + i.qty, 0) === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1.5 font-bold text-lg">
            {formatRp(total)}
            <ChevronUp className="h-4 w-4" />
          </span>
        </button>
      )}

      <Dialog open={isCartSheetOpen} onOpenChange={setIsCartSheetOpen}>
        <DialogContent
          showCloseButton={false}
          className="lg:hidden bg-zinc-900 border-zinc-800 text-zinc-100 top-auto bottom-0 left-0 translate-x-0 translate-y-0 w-full max-w-full sm:max-w-full rounded-b-none rounded-t-2xl p-0 max-h-[85vh] flex flex-col gap-0 data-open:slide-in-from-bottom data-closed:slide-out-to-bottom"
        >
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="h-1 w-10 rounded-full bg-zinc-700" />
          </div>
          <CartContent onCharge={() => setIsCartSheetOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={isCheckoutOpen} onOpenChange={(open) => { if (!open) startNewSale(); else setIsCheckoutOpen(true) }}>
        <DialogContent className={`bg-zinc-900 border-zinc-800 text-zinc-100 ${checkoutStep === 'success' ? 'sm:max-w-lg max-h-[85vh] flex flex-col' : 'sm:max-w-md'}`}>
          {checkoutStep === 'success' ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Payment Successful</DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
                <div className="text-center p-6 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                  <p className="text-sm text-zinc-400">Total Charged</p>
                  <h3 className="text-3xl font-bold text-emerald-400 tracking-tight">{formatRp(lastOrderTotal ?? 0)}</h3>
                  {lastOrderChange > 0 && (
                    <p className="text-sm text-amber-400 pt-1">Kembalian: {formatRp(lastOrderChange)}</p>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                  <p className="text-xs text-zinc-500 font-medium uppercase">Kirim Struk</p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Email pelanggan"
                      value={sendEmailTo}
                      onChange={(e) => setSendEmailTo(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 h-9"
                    />
                    <Button
                      onClick={handleSendEmail}
                      disabled={sendingEmail}
                      className="bg-indigo-600 text-white hover:bg-indigo-700 shrink-0"
                    >
                      {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      placeholder="No. WhatsApp (08xx / 62xx)"
                      value={sendWaPhone}
                      onChange={(e) => setSendWaPhone(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 h-9"
                    />
                    <Button
                      onClick={handleSendWhatsApp}
                      disabled={sendingWa}
                      className="bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
                    >
                      {sendingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-zinc-500 font-medium uppercase mb-2">Preview Struk</p>
                  {receiptLoading ? (
                    <div className="flex items-center justify-center py-10 text-zinc-500">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : receiptOrder && receiptOrg && receiptOutlet ? (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-hidden flex justify-center">
                      <div ref={receiptImageRef}>
                        <ReceiptLayout
                          order={receiptOrder}
                          lines={receiptLines}
                          payments={receiptPayments}
                          org={receiptOrg}
                          outlet={receiptOutlet}
                          paperWidth={receiptPaperWidth}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={handlePrintReceipt}>
                  <Printer className="h-4 w-4 mr-2" /> Print Receipt
                </Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={startNewSale}>
                  New Sale
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Complete Payment</DialogTitle>
              </DialogHeader>

              <div className="py-6 space-y-4">
                <div className="text-center p-6 bg-zinc-950 rounded-xl border border-zinc-800">
                  <p className="text-sm text-zinc-400 mb-1">Total Amount Due</p>
                  <h3 className="text-4xl font-bold text-emerald-400 tracking-tight">{formatRp(total)}</h3>
                </div>

                <div className="space-y-3">
                  {tenders.map((t) => (
                    <div key={t.id} className="space-y-2 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 flex flex-wrap gap-1.5">
                          {paymentMethods
                            .filter(method => !isCashMethod(method) || t.method === method || !tenders.some(other => other.id !== t.id && isCashMethod(other.method)))
                            .map(method => (
                              <Button
                                key={method}
                                type="button"
                                size="sm"
                                variant={t.method === method ? 'default' : 'outline'}
                                className={t.method === method
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'}
                                onClick={() => updateTenderMethod(t.id, method)}
                              >
                                {method}
                              </Button>
                            ))}
                        </div>
                        {tenders.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-400 hover:text-rose-300 shrink-0" onClick={() => removeTenderRow(t.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {isCashMethod(t.method) ? (
                        <div className="space-y-1.5">
                          <label className="text-xs text-zinc-500">Tunai Diterima</label>
                          <Input
                            type="number"
                            min={0}
                            className="bg-zinc-900 border-zinc-800"
                            value={t.cashReceived || ''}
                            onChange={(e) => updateTenderCashReceived(t.id, Number(e.target.value))}
                          />
                          {t.cashReceived > 0 && (
                            <div className="flex justify-between text-xs text-zinc-500 pt-1">
                              <span>Diterapkan: {formatRp(t.id === cashTender?.id ? cashApplied : 0)}</span>
                              {changeDue > 0 && <span className="text-amber-400">Kembalian: {formatRp(changeDue)}</span>}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <label className="text-xs text-zinc-500">Jumlah</label>
                          <Input
                            type="number"
                            min={0}
                            className="bg-zinc-900 border-zinc-800"
                            value={t.amount || ''}
                            onChange={(e) => updateTenderAmount(t.id, Number(e.target.value))}
                          />
                        </div>
                      )}
                      {isComplimentaryMethod(t.method) && (
                        <div className="space-y-1.5">
                          <label className="text-xs text-zinc-500">Untuk Siapa / Alasan</label>
                          <Input
                            className="bg-zinc-900 border-zinc-800"
                            placeholder="mis. Budi (staff meal)"
                            value={t.notes}
                            onChange={(e) => updateTenderNotes(t.id, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                    onClick={addTenderRow}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Tambah Metode Pembayaran
                  </Button>

                  <div className="space-y-1 pt-2 border-t border-zinc-800 text-sm">
                    <div className="flex justify-between text-zinc-400">
                      <span>Sudah Dibayar</span>
                      <span>{formatRp(totalApplied)}</span>
                    </div>
                    {remainingBalance > 0 && (
                      <div className="flex justify-between text-rose-400 font-medium">
                        <span>Sisa</span>
                        <span>{formatRp(remainingBalance)}</span>
                      </div>
                    )}
                    {changeDue > 0 && (
                      <div className="flex justify-between text-amber-400 font-medium">
                        <span>Kembalian</span>
                        <span>{formatRp(changeDue)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setIsCheckoutOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleCheckout}
                  disabled={tenders.some(t => !t.method) || tenders.some(t => isComplimentaryMethod(t.method) && !t.notes.trim()) || remainingBalance > 0 || processing}
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                  Confirm Payment
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={closeShiftOpen} onOpenChange={setCloseShiftOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Close Shift</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Opening Float</span>
                <span className="text-zinc-200">{formatRp(shift?.opening_float || 0)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Cash Sales This Shift</span>
                <span className="text-zinc-200">{formatRp(cashSalesSoFar)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t border-zinc-800">
                <span className="text-zinc-300">Expected Cash</span>
                <span className="text-indigo-400">{formatRp(expectedCash)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Counted Cash</label>
              <Input
                type="number"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder="0"
                className="bg-zinc-950 border-zinc-800 h-11 text-base"
              />
            </div>

            {countedCash && (
              <div className={`text-sm font-medium text-center rounded-lg py-2 ${liveVariance === 0 ? 'bg-emerald-950/30 text-emerald-400' : 'bg-amber-950/30 text-amber-400'}`}>
                {liveVariance === 0 ? 'Balanced' : liveVariance > 0 ? `Over by ${formatRp(liveVariance)}` : `Short by ${formatRp(Math.abs(liveVariance))}`}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Notes (optional)</label>
              <Textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setCloseShiftOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleCloseShift}
              disabled={closingShift || !countedCash}
            >
              {closingShift ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
              Close Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
