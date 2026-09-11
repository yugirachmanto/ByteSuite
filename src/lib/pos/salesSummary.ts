import type { SupabaseClient } from '@supabase/supabase-js'

function isComplimentaryMethod(method: string): boolean {
  return /komplimen|complimentary|compliment/i.test(method)
}

export interface PosSalesSummary {
  grossSales: number
  discountTotal: number
  taxTotal: number
  netSales: number
  orderCount: number
  averageTransaction: number
  voidedCount: number
  voidedAmount: number
  tenders: { method: string; amount: number }[]
  topItems: { name: string; qty: number; revenue: number }[]
  compTotal: number
  compRecipients: { notes: string; amount: number }[]
}

interface SalesSummaryScope {
  outletId: string
  shiftId?: string
  startIso?: string
  endIso?: string
}

const EMPTY_SUMMARY: PosSalesSummary = {
  grossSales: 0,
  discountTotal: 0,
  taxTotal: 0,
  netSales: 0,
  orderCount: 0,
  averageTransaction: 0,
  voidedCount: 0,
  voidedAmount: 0,
  tenders: [],
  topItems: [],
  compTotal: 0,
  compRecipients: []
}

export async function fetchPosSalesSummary(supabase: SupabaseClient, scope: SalesSummaryScope): Promise<PosSalesSummary> {
  const { outletId, shiftId, startIso, endIso } = scope

  let query = supabase
    .from('pos_orders')
    .select('id, status, subtotal, tax_amount, total_amount, discount_amount')
    .eq('outlet_id', outletId)

  if (shiftId) {
    query = query.eq('shift_id', shiftId)
  } else {
    if (startIso) query = query.gte('created_at', startIso)
    if (endIso) query = query.lte('created_at', endIso)
  }

  const { data: orders } = await query
  if (!orders || orders.length === 0) return EMPTY_SUMMARY

  const completed = orders.filter(o => o.status === 'completed')
  const voided = orders.filter(o => o.status === 'voided')

  const grossSales = completed.reduce((sum, o) => sum + (o.subtotal || 0) + (o.discount_amount || 0), 0)
  const discountTotal = completed.reduce((sum, o) => sum + (o.discount_amount || 0), 0)
  const taxTotal = completed.reduce((sum, o) => sum + (o.tax_amount || 0), 0)
  const netSales = completed.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const voidedAmount = voided.reduce((sum, o) => sum + (o.total_amount || 0), 0)

  const completedIds = completed.map(o => o.id)

  let tenders: { method: string; amount: number }[] = []
  let topItems: { name: string; qty: number; revenue: number }[] = []
  let compTotal = 0
  let compRecipients: { notes: string; amount: number }[] = []

  if (completedIds.length > 0) {
    const { data: payments } = await supabase
      .from('pos_order_payments')
      .select('payment_method, amount, notes')
      .in('order_id', completedIds)

    const tenderMap = new Map<string, number>()
    const compMap = new Map<string, number>()
    for (const p of payments || []) {
      tenderMap.set(p.payment_method, (tenderMap.get(p.payment_method) || 0) + (p.amount || 0))
      if (isComplimentaryMethod(p.payment_method)) {
        compTotal += p.amount || 0
        const key = p.notes || 'Tidak ada catatan'
        compMap.set(key, (compMap.get(key) || 0) + (p.amount || 0))
      }
    }
    tenders = Array.from(tenderMap.entries()).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount)
    compRecipients = Array.from(compMap.entries()).map(([notes, amount]) => ({ notes, amount })).sort((a, b) => b.amount - a.amount)

    const { data: lines } = await supabase
      .from('pos_order_lines')
      .select('item_id, qty, subtotal, item_master(name)')
      .in('order_id', completedIds)

    const itemMap = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const l of (lines || []) as any[]) {
      const key = l.item_id
      const name = l.item_master?.name || 'Unknown Item'
      const existing = itemMap.get(key) || { name, qty: 0, revenue: 0 }
      existing.qty += l.qty || 0
      existing.revenue += l.subtotal || 0
      itemMap.set(key, existing)
    }
    topItems = Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  }

  return {
    grossSales,
    discountTotal,
    taxTotal,
    netSales,
    orderCount: completed.length,
    averageTransaction: completed.length > 0 ? netSales / completed.length : 0,
    voidedCount: voided.length,
    voidedAmount,
    tenders,
    topItems,
    compTotal,
    compRecipients
  }
}

export interface HourlySales {
  hour: number
  sales: number
  orders: number
}

export async function fetchHourlySales(supabase: SupabaseClient, scope: { outletId: string; startIso: string; endIso: string }): Promise<HourlySales[]> {
  const { data: orders } = await supabase
    .from('pos_orders')
    .select('created_at, total_amount')
    .eq('outlet_id', scope.outletId)
    .eq('status', 'completed')
    .gte('created_at', scope.startIso)
    .lte('created_at', scope.endIso)

  const buckets: HourlySales[] = Array.from({ length: 24 }, (_, hour) => ({ hour, sales: 0, orders: 0 }))
  for (const o of orders || []) {
    const hour = new Date(o.created_at).getHours()
    buckets[hour].sales += o.total_amount || 0
    buckets[hour].orders += 1
  }
  return buckets
}
