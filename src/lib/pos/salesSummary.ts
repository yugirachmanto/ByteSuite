import type { SupabaseClient } from '@supabase/supabase-js'

export interface PosSalesSummary {
  grossSales: number
  discountTotal: number
  taxTotal: number
  netSales: number
  orderCount: number
  voidedCount: number
  voidedAmount: number
  tenders: { method: string; amount: number }[]
  topItems: { name: string; qty: number; revenue: number }[]
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
  voidedCount: 0,
  voidedAmount: 0,
  tenders: [],
  topItems: []
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

  if (completedIds.length > 0) {
    const { data: payments } = await supabase
      .from('pos_order_payments')
      .select('payment_method, amount')
      .in('order_id', completedIds)

    const tenderMap = new Map<string, number>()
    for (const p of payments || []) {
      tenderMap.set(p.payment_method, (tenderMap.get(p.payment_method) || 0) + (p.amount || 0))
    }
    tenders = Array.from(tenderMap.entries()).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount)

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
    voidedCount: voided.length,
    voidedAmount,
    tenders,
    topItems
  }
}
