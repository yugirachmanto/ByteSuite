/**
 * Opname (Physical Count) Logic
 *
 * Computes variance values using current batch costs (WAC from active batches).
 */

import { calcInventoryValue, type Batch } from './fifo-avg'

export interface OpnameEntry {
  item_id: string
  item_name: string
  item_unit: string
  system_qty: number
  physical_qty: number
}

export interface OpnameResult {
  item_id: string
  item_name: string
  item_unit: string
  system_qty: number
  physical_qty: number
  variance: number
  variance_value: number
  wac_unit_cost: number
}

export interface OpnameSummary {
  total_items: number
  items_with_variance: number
  total_positive_value: number
  total_negative_value: number
  net_variance_value: number
  entries: OpnameResult[]
}

/**
 * Compute WAC (Weighted Average Cost) from active batches.
 * WAC = total inventory value / total qty on hand
 */
function computeWAC(batches: Batch[]): number {
  const totalQty = batches.reduce((s, b) => s + b.qty_remaining, 0)
  if (totalQty <= 0) return 0
  const totalValue = calcInventoryValue(batches)
  return Math.round(totalValue / totalQty)
}

/**
 * Process opname entries and compute variance values.
 */
export function processOpname(
  entries: OpnameEntry[],
  batchesByItem: Record<string, Batch[]>
): OpnameSummary {
  let totalPositive = 0
  let totalNegative = 0
  let itemsWithVariance = 0

  const results: OpnameResult[] = entries.map((entry) => {
    const variance = entry.physical_qty - entry.system_qty
    const batches = batchesByItem[entry.item_id] || []
    const wac = computeWAC(batches)
    const varianceValue = Math.round(variance * wac)

    if (variance !== 0) {
      itemsWithVariance++
      if (varianceValue > 0) totalPositive += varianceValue
      else totalNegative += varianceValue
    }

    return {
      item_id: entry.item_id,
      item_name: entry.item_name,
      item_unit: entry.item_unit,
      system_qty: entry.system_qty,
      physical_qty: entry.physical_qty,
      variance,
      variance_value: varianceValue,
      wac_unit_cost: wac,
    }
  })

  return {
    total_items: entries.length,
    items_with_variance: itemsWithVariance,
    total_positive_value: totalPositive,
    total_negative_value: totalNegative,
    net_variance_value: totalPositive + totalNegative,
    entries: results,
  }
}

/**
 * Build the payload for Supabase opname_log insert.
 */
export function buildOpnamePayload(
  results: OpnameResult[],
  outletId: string,
  opnameDate: string
) {
  return results.map((r) => ({
    outlet_id: outletId,
    item_id: r.item_id,
    opname_date: opnameDate,
    system_qty: r.system_qty,
    physical_qty: r.physical_qty,
    variance_value: r.variance_value,
  }))
}
