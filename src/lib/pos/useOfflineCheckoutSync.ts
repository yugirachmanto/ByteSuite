'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getQueue, removeFromQueue, type QueuedCheckout } from './offlineQueue'

const RETRY_INTERVAL_MS = 10000

export function useOfflineCheckoutSync() {
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncingRef = useRef(false)

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getQueue().length)
  }, [])

  const flush = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setIsSyncing(true)

    try {
      // Sequential, oldest first — never overlap in-flight requests.
      while (true) {
        const queue = getQueue()
        if (queue.length === 0) break

        const item: QueuedCheckout = queue[0]

        let res: Response
        try {
          res = await fetch('/api/pos/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              outlet_id: item.outletId,
              payment_method: item.paymentMethod,
              lines: item.lines,
              client_request_id: item.clientRequestId,
              shift_id: item.shiftId,
              order_discount_type: item.orderDiscountType,
              order_discount_value: item.orderDiscountValue
            })
          })
        } catch {
          // Still offline / network failed again — stop this pass, try
          // again on the next tick.
          break
        }

        if (res.ok) {
          removeFromQueue(item.clientRequestId)
          refreshPendingCount()
          continue
        }

        // A real HTTP response means the server was reached — this is a
        // genuine business failure on replay (e.g. stock that was fine at
        // sale time no longer is). Retrying forever would be wrong, so
        // remove it and surface it once rather than losing it silently.
        const data = await res.json().catch(() => ({}))
        removeFromQueue(item.clientRequestId)
        refreshPendingCount()
        toast.error(`A queued sale failed to sync: ${data.error || 'Unknown error'}`)
      }
    } finally {
      syncingRef.current = false
      setIsSyncing(false)
    }
  }, [refreshPendingCount])

  useEffect(() => {
    refreshPendingCount()
    flush()

    const onOnline = () => flush()
    window.addEventListener('online', onOnline)

    const interval = setInterval(() => {
      if (getQueue().length > 0) flush()
    }, RETRY_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', onOnline)
      clearInterval(interval)
    }
  }, [flush, refreshPendingCount])

  return { pendingCount, isSyncing, refreshPendingCount }
}
