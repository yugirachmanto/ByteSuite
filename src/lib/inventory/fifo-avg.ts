export interface Batch {
  id: string
  item_id: string
  outlet_id: string
  purchase_date: string
  qty_remaining: number
  unit_cost: number
}

export interface StockOutResult {
  cost_per_unit: number          // simple avg of unique prices touched
  total_cogs: number
  batches_touched: {
    batch_id: string
    qty_consumed: number
    unit_cost: number
  }[]
  updated_batches: Batch[]       // batches with updated qty_remaining
}

export function calcFifoAvg(
  batches: Batch[],              // MUST be sorted oldest-first
  qty_out: number
): StockOutResult {
  const totalAvailable = batches.reduce((s, b) => s + b.qty_remaining, 0)

  if (qty_out > totalAvailable + 0.0001) {
    throw new Error(
      `Insufficient stock: need ${qty_out}, available ${totalAvailable}`
    )
  }

  let remaining = qty_out
  const touched: StockOutResult['batches_touched'] = []
  const updatedBatches = batches.map(b => ({ ...b }))

  for (const batch of updatedBatches) {
    if (remaining <= 0) break
    const consume = Math.min(batch.qty_remaining, remaining)
    touched.push({
      batch_id: batch.id,
      qty_consumed: consume,
      unit_cost: batch.unit_cost
    })
    batch.qty_remaining = Math.round((batch.qty_remaining - consume) * 10000) / 10000
    remaining = Math.round((remaining - consume) * 10000) / 10000
  }

  // Simple average of UNIQUE unit prices (not qty-weighted)
  const uniquePrices = [...new Set(touched.map(t => t.unit_cost))]
  const cost_per_unit = uniquePrices.reduce((s, p) => s + p, 0) / uniquePrices.length

  return {
    cost_per_unit: Math.round(cost_per_unit),
    total_cogs: Math.round(cost_per_unit * qty_out),
    batches_touched: touched,
    updated_batches: updatedBatches.filter(b => b.qty_remaining > 0.0001)
  }
}

export function calcInventoryValue(batches: Batch[]): number {
  return batches.reduce((s, b) => s + b.qty_remaining * b.unit_cost, 0)
}
