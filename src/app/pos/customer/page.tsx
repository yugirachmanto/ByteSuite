'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { formatRp } from '@/lib/format'
import { ShoppingCart, CheckCircle2, QrCode, Smartphone, Building2, Copy } from 'lucide-react'

export default function POSCustomerDisplay() {
  const [state, setState] = useState<any>({
    cart: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    isCheckoutOpen: false,
    paymentMethod: '',
    qrisImageUrl: '',
    bankInfo: { bankName: '', bankAccountNumber: '', bankAccountHolder: '' }
  })
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    const bc = new BroadcastChannel('pos-channel')
    
    bc.onmessage = (event) => {
      if (event.data.type === 'SYNC_STATE') {
        setState(event.data.payload)
        if (showSuccess && event.data.payload.cart.length > 0) {
          setShowSuccess(false)
        }
      } else if (event.data.type === 'CHECKOUT_SUCCESS') {
        setShowSuccess(true)
        setState((prev: any) => ({ ...prev, cart: [], subtotal: 0, tax: 0, total: 0 }))
        setTimeout(() => setShowSuccess(false), 5000)
      }
    }

    return () => bc.close()
  }, [showSuccess])

  const isQris = state.isCheckoutOpen && state.paymentMethod?.toLowerCase()?.includes('qris')
  const isTransfer = state.isCheckoutOpen && state.paymentMethod?.toLowerCase()?.includes('transfer')
  const bank = state.bankInfo || {}

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-center animate-in fade-in zoom-in duration-500">
        <div className="h-32 w-32 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="h-16 w-16 text-emerald-400" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">Thank You!</h1>
        <p className="text-xl text-zinc-400">Your payment was successful.</p>
      </div>
    )
  }

  const groupedProducts = state.products?.reduce((acc: any, product: any) => {
    const cat = product.posCategory || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(product)
    return acc
  }, {}) || {}

  return (
    <div className="flex h-screen p-8 gap-8 bg-zinc-950">
      {/* Left Side - Welcome or QRIS */}
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-900 rounded-3xl border border-zinc-800 p-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent"></div>
        
        {isQris && state.qrisImageUrl ? (
          // QRIS Payment Screen
          <div className="relative z-10 flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3 mb-2">
              <QrCode className="h-8 w-8 text-indigo-400" />
              <h2 className="text-3xl font-bold text-white">Scan to Pay</h2>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-2xl shadow-indigo-500/20">
              <img 
                src={state.qrisImageUrl} 
                alt="QRIS Code" 
                className="w-72 h-72 object-contain"
              />
            </div>

            <div className="text-center space-y-2">
              <div className="text-5xl font-bold text-emerald-400 tracking-tight">
                {formatRp(state.total)}
              </div>
              <p className="text-zinc-400">Total Amount</p>
            </div>
            
            <div className="flex items-center gap-2 text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-5 py-3 animate-pulse">
              <Smartphone className="h-5 w-5" />
              <span className="font-medium">Open your e-wallet app and scan the QR code above</span>
            </div>
          </div>
        ) : isQris && !state.qrisImageUrl ? (
          // QRIS selected but no image uploaded
          <div className="relative z-10 flex flex-col items-center gap-4">
            <QrCode className="h-16 w-16 text-zinc-600" />
            <h2 className="text-3xl font-bold text-white">QRIS Payment</h2>
            <p className="text-zinc-400 text-lg">Please scan the QRIS code at the counter</p>
            <div className="text-4xl font-bold text-emerald-400 mt-4">
              {formatRp(state.total)}
            </div>
          </div>
        ) : isTransfer && bank.bankName ? (
          // Bank Transfer Screen
          <div className="relative z-10 flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300 w-full max-w-lg">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="h-8 w-8 text-blue-400" />
              <h2 className="text-3xl font-bold text-white">Bank Transfer</h2>
            </div>

            <div className="text-center space-y-2">
              <div className="text-5xl font-bold text-emerald-400 tracking-tight">
                {formatRp(state.total)}
              </div>
              <p className="text-zinc-400 text-lg">Total Amount</p>
            </div>

            <div className="w-full bg-zinc-950/80 border border-zinc-700 rounded-2xl p-6 space-y-5">
              <div className="text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Bank</p>
                <p className="text-2xl font-bold text-white">{bank.bankName}</p>
              </div>
              <div className="border-t border-zinc-800"></div>
              <div className="text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Account Number</p>
                <p className="text-3xl font-bold text-blue-400 font-mono tracking-widest">{bank.bankAccountNumber}</p>
              </div>
              <div className="border-t border-zinc-800"></div>
              <div className="text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Account Holder</p>
                <p className="text-xl font-semibold text-zinc-200">{bank.bankAccountHolder}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 animate-pulse">
              <Smartphone className="h-5 w-5" />
              <span className="font-medium">Please transfer the exact amount using your mobile banking app</span>
            </div>
          </div>
        ) : isTransfer && !bank.bankName ? (
          // Transfer selected but no bank info configured
          <div className="relative z-10 flex flex-col items-center gap-4">
            <Building2 className="h-16 w-16 text-zinc-600" />
            <h2 className="text-3xl font-bold text-white">Bank Transfer</h2>
            <p className="text-zinc-400 text-lg">Please ask the cashier for bank transfer details</p>
            <div className="text-4xl font-bold text-emerald-400 mt-4">
              {formatRp(state.total)}
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col h-full w-full text-left">
            <h1 className="text-3xl font-bold text-white mb-6 pl-2">Our Menu</h1>
            <div className="flex-1 overflow-y-auto pr-4 space-y-8 pb-8 custom-scrollbar">
              {Object.entries(groupedProducts).map(([category, items]: [string, any]) => (
                <div key={category} className="space-y-4">
                  <h2 className="text-xl font-semibold text-zinc-300 border-b border-zinc-800 pb-2 pl-2">
                    {category}
                  </h2>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((product: any) => (
                      <Card key={product.id} className="bg-zinc-800/50 border-zinc-700/50 p-4 transition-colors flex flex-col gap-3">
                        <div className="w-full aspect-square bg-zinc-900 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-700/30">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-4xl font-bold text-zinc-700">{product.name.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-zinc-100 mb-1 line-clamp-2">{product.name}</div>
                          <div className="text-indigo-400 font-bold">{formatRp(product.price)}</div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(groupedProducts).length === 0 && (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="h-20 w-20 bg-indigo-500/20 rounded-full flex items-center justify-center animate-pulse mb-6">
                    <ShoppingCart className="h-10 w-10 text-indigo-400" />
                  </div>
                  <h1 className="text-5xl font-bold text-white mb-4">
                    Welcome to {state.outletName || 'ByteSuite'}
                  </h1>
                  <p className="text-2xl text-zinc-400">Please review your order details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Side - Cart */}
      <div className="w-[450px] flex flex-col bg-zinc-950 rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
            <ShoppingCart className="h-6 w-6 text-indigo-400" />
            Your Order
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {state.cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <p className="text-lg">Waiting for items...</p>
            </div>
          ) : (
            state.cart.map((item: any) => (
              <div key={item.id} className="flex flex-col gap-2 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-sm">
                      {item.qty}x
                    </span>
                    <span className="text-lg font-medium text-zinc-200 line-clamp-1">{item.name}</span>
                  </div>
                  <span className="text-lg font-bold text-zinc-100">{formatRp(item.price * item.qty)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-zinc-900 border-t border-zinc-800">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-lg text-zinc-400">
              <span>Subtotal</span>
              <span>{formatRp(state.subtotal)}</span>
            </div>
            {state.tax > 0 && (
              <div className="flex justify-between text-lg text-zinc-400">
                <span>Tax</span>
                <span>{formatRp(state.tax)}</span>
              </div>
            )}
            <div className="flex justify-between text-3xl font-bold text-zinc-100 pt-4 border-t border-zinc-800 mt-4">
              <span>Total Due</span>
              <span className="text-emerald-400">{formatRp(state.total)}</span>
            </div>
          </div>
        </div>

        {/* Bottom Status Banner */}
        {state.isCheckoutOpen && (
          <div className="p-6 pt-0">
            <div className={`border rounded-xl p-4 text-center ${isQris || isTransfer ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-500/10 border-indigo-500/20 animate-pulse'}`}>
              <p className="text-indigo-300 font-medium text-lg">
                {isQris ? 'Please scan the QRIS code on the left →' : 
                 isTransfer ? 'Please transfer to the bank account on the left →' : 
                 'Waiting for payment...'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
