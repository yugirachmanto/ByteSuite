'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Minus, Search, Trash2, CreditCard, Loader2, ShoppingCart, Ban, CheckCircle2, Printer, Monitor, Clock, LogOut, Wallet, ChevronUp, RefreshCw } from 'lucide-react'
import { formatRp } from '@/lib/format'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { format } from 'date-fns'
import { enqueue } from '@/lib/pos/offlineQueue'
import { useOfflineCheckoutSync } from '@/lib/pos/useOfflineCheckoutSync'

interface Product {
  id: string
  name: string
  category: string
  price: number
  posCategory?: string
  imageUrl?: string
}

type CartItem = Product & {
  qty: number
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
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['Cash', 'Card', 'QRIS'])
  const [processing, setProcessing] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<'payment' | 'success'>('payment')
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
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

  const outletName = outlets.find(o => o.id === selectedOutletId)?.name || 'ByteSuite'

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0)
  const tax = subtotal * (taxRate / 100)
  const total = subtotal + tax

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
        paymentMethod,
        outletName,
        qrisImageUrl,
        bankInfo,
        products
      }
    })
  }, [cart, subtotal, tax, total, isCheckoutOpen, paymentMethod, outletName, qrisImageUrl, bankInfo, products])

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
    const { data } = await supabase
      .from('pos_orders')
      .select('total_amount')
      .eq('shift_id', shift.id)
      .eq('status', 'completed')
      .ilike('payment_method', 'cash')

    const sum = (data || []).reduce((s, o) => s + (o.total_amount || 0), 0)
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

      toast.success('Shift closed')
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
          .select('payment_method')
          .or(`outlet_id.eq.${selectedOutletId},outlet_id.is.null`)

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
      return [...prev, { ...product, qty: 1 }]
    })
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

  const clearCart = () => setCart([])

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory === 'All' || p.posCategory === selectedCategory
    return matchesSearch && matchesCategory
  })

  const uniqueCategories = ['All', ...Array.from(new Set(products.map(p => p.posCategory || 'Uncategorized'))).sort()]

  const handleCheckout = async () => {
    if (!paymentMethod) {
      toast.error('Please select a payment method')
      return
    }

    const clientRequestId = crypto.randomUUID()
    const checkoutLines = cart.map(item => ({ item_id: item.id, qty: item.qty }))

    setProcessing(true)
    try {
      let res: Response
      try {
        res = await fetch('/api/pos/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outlet_id: selectedOutletId,
            payment_method: paymentMethod,
            lines: checkoutLines,
            client_request_id: clientRequestId,
            shift_id: shift?.id ?? null
          })
        })
      } catch {
        // The request never reached the server — a genuine network blip.
        // Queue it for background retry instead of blocking the cashier.
        enqueue({
          clientRequestId,
          outletId: selectedOutletId!,
          paymentMethod,
          lines: checkoutLines,
          shiftId: shift?.id ?? null,
          queuedAt: new Date().toISOString()
        })
        offlineQueueSync.refreshPendingCount()
        toast.success('No connection — sale queued, will sync automatically')
        setCart([])
        setPaymentMethod('')
        setIsCheckoutOpen(false)
        return
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to checkout')

      toast.success('Transaction completed successfully!')

      cfdChannelRef.current?.send({ type: 'broadcast', event: 'checkout_success' })

      setCart([])
      setLastOrderId(data.order_id)
      setCheckoutStep('success')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setProcessing(false)
    }
  }

  const handlePrintReceipt = () => {
    if (lastOrderId) window.open(`/pos/receipt/${lastOrderId}`, '_blank')
  }

  const startNewSale = () => {
    setIsCheckoutOpen(false)
    setCheckoutStep('payment')
    setPaymentMethod('')
    setLastOrderId(null)
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
          cart.map(item => (
            <div key={item.id} className="flex flex-col gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-800/50">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-zinc-200 line-clamp-1">{item.name}</span>
                <span className="text-sm font-semibold text-zinc-300">{formatRp(item.price * item.qty)}</span>
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
            </div>
          ))
        )}
      </div>

      <div className="p-4 bg-zinc-950 border-t border-zinc-800 shrink-0">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm text-zinc-400">
            <span>Subtotal</span>
            <span>{formatRp(subtotal)}</span>
          </div>
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
          onClick={() => { onCharge?.(); setIsCheckoutOpen(true) }}
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
      <div className="flex flex-col h-[calc(100vh-8rem)] -mt-2">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-zinc-100">Point of Sale</h2>
          <p className="text-sm text-zinc-400">Open a shift to start selling</p>
        </div>
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
    <div className="flex flex-col h-[calc(100vh-8rem)] -mt-2">
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Point of Sale</h2>
          <p className="text-sm text-zinc-400 hidden sm:block">Process retail transactions</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {offlineQueueSync.pendingCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-zinc-900 border border-zinc-800 rounded-md px-3 h-9">
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${offlineQueueSync.isSyncing ? 'animate-spin' : ''}`} />
              <span className="whitespace-nowrap">{offlineQueueSync.pendingCount} pending sync</span>
            </div>
          )}
          {shift && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-md px-3 h-9">
                <Clock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span className="whitespace-nowrap">Shift since {format(new Date(shift.opened_at), 'HH:mm')} · {formatRp(shift.opening_float)}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                onClick={openCloseShiftDialog}
              >
                <LogOut className="mr-2 h-4 w-4" /> Close Shift
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            onClick={openCustomerDisplay}
            disabled={!selectedOutletId}
          >
            <Monitor className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Open </span>Customer Display
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-full flex-1 min-h-0">
        {/* Product Grid */}
        <div className="flex-1 flex flex-col min-h-0 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800 space-y-4">
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
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          {checkoutStep === 'success' ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Payment Successful</DialogTitle>
              </DialogHeader>

              <div className="py-6 space-y-6">
                <div className="text-center p-6 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                  <p className="text-sm text-zinc-400">Total Charged</p>
                  <h3 className="text-3xl font-bold text-emerald-400 tracking-tight">{formatRp(total)}</h3>
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

              <div className="py-6 space-y-6">
                <div className="text-center p-6 bg-zinc-950 rounded-xl border border-zinc-800">
                  <p className="text-sm text-zinc-400 mb-1">Total Amount Due</p>
                  <h3 className="text-4xl font-bold text-emerald-400 tracking-tight">{formatRp(total)}</h3>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-400">Payment Method</label>
                  <Select value={paymentMethod} onValueChange={(val: any) => setPaymentMethod(val || '')}>
                    <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 h-12 text-base">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {paymentMethods.map(method => (
                        <SelectItem key={method} value={method}>{method}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setIsCheckoutOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleCheckout}
                  disabled={!paymentMethod || processing}
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
