const STORAGE_KEY = 'bytesuite_pos_checkout_queue'

export interface QueuedCheckout {
  clientRequestId: string
  outletId: string
  paymentMethod: string
  lines: { item_id: string; qty: number }[]
  shiftId: string | null
  queuedAt: string
}

export function getQueue(): QueuedCheckout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function setQueue(queue: QueuedCheckout[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // localStorage unavailable (private browsing, SSR) — queue silently
    // won't persist across reloads, but in-memory retry still applies.
  }
}

export function enqueue(item: QueuedCheckout) {
  const queue = getQueue()
  queue.push(item)
  setQueue(queue)
}

export function removeFromQueue(clientRequestId: string) {
  const queue = getQueue().filter(q => q.clientRequestId !== clientRequestId)
  setQueue(queue)
}
