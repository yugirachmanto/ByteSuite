import type { SupabaseClient } from '@supabase/supabase-js'
import { format, eachDayOfInterval } from 'date-fns'

export interface PeriodTotals {
  netSales: number
  orderCount: number
  averageTransaction: number
}

export interface CashierPerformance {
  name: string
  orders: number
  sales: number
  averageTransaction: number
  discount: number
  voided: number
}

export interface PaymentTrend {
  granularity: 'hour' | 'day'
  methods: string[]
  points: ({ label: string } & Record<string, number | string>)[]
}

export interface SalesAnalytics {
  current: PeriodTotals
  previous: PeriodTotals
  previousLabel: string
  /** heatmap[dayOfWeek][hour], dayOfWeek 0 = Monday … 6 = Sunday */
  heatmapSales: number[][]
  heatmapOrders: number[][]
  cashiers: CashierPerformance[]
  paymentTrend: PaymentTrend
}

interface Scope {
  outletId: string
  startIso: string
  endIso: string
  cashierId?: string
}

const CHUNK = 200

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await run(ids.slice(i, i + CHUNK))
    if (data) out.push(...data)
  }
  return out
}

const totalsOf = (orders: { total_amount: number | null }[]): PeriodTotals => {
  const netSales = orders.reduce((s, o) => s + (o.total_amount || 0), 0)
  return { netSales, orderCount: orders.length, averageTransaction: orders.length > 0 ? netSales / orders.length : 0 }
}

/**
 * Analytics derived from the same pos_orders / pos_order_payments data as
 * the rest of the sales report: comparison against the immediately
 * preceding period of equal length, a day-of-week x hour heatmap, per
 * cashier performance and a payment-method trend. Bucketing uses local
 * (browser) time, like the trend chart.
 */
export async function fetchSalesAnalytics(supabase: SupabaseClient, scope: Scope): Promise<SalesAnalytics> {
  const start = new Date(scope.startIso)
  const end = new Date(scope.endIso)
  const span = end.getTime() - start.getTime() + 1
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(start.getTime() - span)

  let curQ = supabase
    .from('pos_orders')
    .select('id, created_at, status, total_amount, discount_amount, cashier_id')
    .eq('outlet_id', scope.outletId)
    .gte('created_at', scope.startIso)
    .lte('created_at', scope.endIso)
  let prevQ = supabase
    .from('pos_orders')
    .select('total_amount')
    .eq('outlet_id', scope.outletId)
    .eq('status', 'completed')
    .gte('created_at', prevStart.toISOString())
    .lte('created_at', prevEnd.toISOString())
  if (scope.cashierId) {
    curQ = curQ.eq('cashier_id', scope.cashierId)
    prevQ = prevQ.eq('cashier_id', scope.cashierId)
  }

  const [{ data: curOrders }, { data: prevOrders }] = await Promise.all([curQ, prevQ])
  const all = curOrders || []
  const completed = all.filter(o => o.status === 'completed')

  const heatmapSales = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  const heatmapOrders = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  for (const o of completed) {
    const d = new Date(o.created_at)
    const dow = (d.getDay() + 6) % 7
    heatmapSales[dow][d.getHours()] += o.total_amount || 0
    heatmapOrders[dow][d.getHours()] += 1
  }

  const cashierIds = Array.from(new Set(all.map(o => o.cashier_id).filter(Boolean))) as string[]
  const profiles = cashierIds.length > 0
    ? (await supabase.from('user_profiles').select('id, full_name').in('id', cashierIds)).data || []
    : []
  const nameOf = new Map((profiles as { id: string; full_name: string }[]).map(p => [p.id, p.full_name]))
  const byCashier = new Map<string, CashierPerformance>()
  for (const o of all) {
    const key = o.cashier_id || 'unknown'
    const row = byCashier.get(key) || { name: nameOf.get(key) || '—', orders: 0, sales: 0, averageTransaction: 0, discount: 0, voided: 0 }
    if (o.status === 'voided') {
      row.voided += 1
    } else if (o.status === 'completed') {
      row.orders += 1
      row.sales += o.total_amount || 0
      row.discount += o.discount_amount || 0
    }
    byCashier.set(key, row)
  }
  const cashiers = Array.from(byCashier.values())
    .map(c => ({ ...c, averageTransaction: c.orders > 0 ? c.sales / c.orders : 0 }))
    .sort((a, b) => b.sales - a.sales)

  // Payment trend, bucketed like the sales trend chart (hour for a single day, else day).
  const oneDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')
  const payments = await inChunks<{ order_id: string; payment_method: string; amount: number }>(
    completed.map(o => o.id),
    chunk => supabase.from('pos_order_payments').select('order_id, payment_method, amount').in('order_id', chunk)
  )
  const orderTime = new Map(completed.map(o => [o.id, new Date(o.created_at)]))
  const methods = Array.from(new Set(payments.map(p => p.payment_method))).sort()

  const bucketKeys: { key: string; label: string }[] = oneDay
    ? Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: `${String(h).padStart(2, '0')}:00` }))
    : eachDayOfInterval({ start, end }).slice(0, 400).map(d => ({ key: format(d, 'yyyy-MM-dd'), label: format(d, 'd MMM') }))
  const buckets = new Map(bucketKeys.map(b => [b.key, { label: b.label, ...Object.fromEntries(methods.map(m => [m, 0])) } as { label: string } & Record<string, number | string>]))
  for (const p of payments) {
    const t = orderTime.get(p.order_id)
    if (!t) continue
    const b = buckets.get(oneDay ? String(t.getHours()) : format(t, 'yyyy-MM-dd'))
    if (b) b[p.payment_method] = (Number(b[p.payment_method]) || 0) + (p.amount || 0)
  }

  return {
    current: totalsOf(completed),
    previous: totalsOf(prevOrders || []),
    previousLabel: `${format(prevStart, 'd MMM yyyy')} — ${format(prevEnd, 'd MMM yyyy')}`,
    heatmapSales,
    heatmapOrders,
    cashiers,
    paymentTrend: { granularity: oneDay ? 'hour' : 'day', methods, points: Array.from(buckets.values()) },
  }
}
