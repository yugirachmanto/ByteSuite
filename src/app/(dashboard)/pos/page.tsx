'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Minus, Search, Trash2, CreditCard, Loader2, ShoppingCart } from 'lucide-react'
import { formatRp } from '@/lib/format'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  const [taxRate, setTaxRate] = useState(0)
  const [qrisImageUrl, setQrisImageUrl] = useState('')
  const [bankInfo, setBankInfo] = useState({ bankName: '', bankAccountNumber: '', bankAccountHolder: '' })

  const outletName = outlets.find(o => o.id === selectedOutletId)?.name || 'ByteSuite'

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0)
  const tax = subtotal * (taxRate / 100)
  const total = subtotal + tax

  // Broadcast channel for customer facing display
  useEffect(() => {
    const bc = new BroadcastChannel('pos-channel')

    bc.postMessage({
      type: 'SYNC_STATE',
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

    return () => bc.close()
  }, [cart, subtotal, tax, total, isCheckoutOpen, paymentMethod, outletName, qrisImageUrl, bankInfo, products])

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
            .select('pos_tax_rate, qris_image_url, bank_name, bank_account_number, bank_account_holder')
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

    setProcessing(true)
    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outlet_id: selectedOutletId,
          payment_method: paymentMethod,
          lines: cart.map(item => ({
            item_id: item.id,
            qty: item.qty
          }))
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to checkout')

      toast.success('Transaction completed successfully!')
      
      const bc = new BroadcastChannel('pos-channel')
      bc.postMessage({ type: 'CHECKOUT_SUCCESS' })
      bc.close()
      
      setCart([])
      setIsCheckoutOpen(false)
      setPaymentMethod('')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -mt-2">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Point of Sale</h2>
          <p className="text-sm text-zinc-400">Process retail transactions</p>
        </div>
      </div>

      <div className="flex gap-6 h-full flex-1 min-h-0">
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
          
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
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

        {/* Cart Panel */}
        <div className="w-96 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl shrink-0">
          <div className="p-4 border-b border-zinc-800 bg-zinc-900/80 flex justify-between items-center">
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

          <div className="p-4 bg-zinc-950 border-t border-zinc-800">
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
              onClick={() => setIsCheckoutOpen(true)}
            >
              Charge {formatRp(total)}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
