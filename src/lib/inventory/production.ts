/**
 * WIP Production Logic
 *
 * Client-side validation and cost estimation for the production form.
 * The actual atomic write is handled by the Supabase `post_production` RPC.
 */

import { calcFifoAvg, calcInventoryValue, type Batch } from './fifo-avg'

export interface BomLine {
  input_item_id: string
  qty_per_unit: number
  item_name: string
  item_unit: string
}

export interface ProductionPreview {
  input_item_id: string
  item_name: string
  item_unit: string
  qty_needed: number
  qty_available: number
  estimated_cost: number
  is_sufficient: boolean
}

export interface ProductionEstimate {
  inputs: ProductionPreview[]
  total_input_cost: number
  unit_cost_produced: number
  can_produce: boolean
}

/**
 * Build a production cost preview.
 * Does NOT mutate any batches — this is for the preview panel only.
 */
export function estimateProductionCost(
  bom: BomLine[],
  qtyToProduce: number,
  batchesByItem: Record<string, Batch[]>
): ProductionEstimate {
  let totalInputCost = 0
  let canProduce = true

  const inputs: ProductionPreview[] = bom.map((line) => {
    const qtyNeeded = line.qty_per_unit * qtyToProduce
    const batches = batchesByItem[line.input_item_id] || []
    const qtyAvailable = batches.reduce((s, b) => s + b.qty_remaining, 0)
    const isSufficient = qtyAvailable >= qtyNeeded - 0.0001

    let estimatedCost = 0
    if (isSufficient && qtyNeeded > 0) {
      try {
        const result = calcFifoAvg(batches, qtyNeeded)
        estimatedCost = result.total_cogs
      } catch {
        // If FIFO calc fails, fall back to simple WAC estimate
        const value = calcInventoryValue(batches)
        estimatedCost =
          qtyAvailable > 0
            ? Math.round((value / qtyAvailable) * qtyNeeded)
            : 0
      }
    } else {
      canProduce = false
    }

    totalInputCost += estimatedCost

    return {
      input_item_id: line.input_item_id,
      item_name: line.item_name,
      item_unit: line.item_unit,
      qty_needed: qtyNeeded,
      qty_available: qtyAvailable,
      estimated_cost: estimatedCost,
      is_sufficient: isSufficient,
    }
  })

  return {
    inputs,
    total_input_cost: totalInputCost,
    unit_cost_produced:
      qtyToProduce > 0 ? Math.round(totalInputCost / qtyToProduce) : 0,
    can_produce: canProduce,
  }
}

/**
 * Validate that production can proceed.
 * Returns an array of error messages (empty = valid).
 */
export function validateProduction(
  bom: BomLine[],
  qtyToProduce: number,
  batchesByItem: Record<string, Batch[]>
): string[] {
  const errors: string[] = []

  if (qtyToProduce <= 0) {
    errors.push('Quantity to produce must be greater than 0')
  }

  if (bom.length === 0) {
    errors.push('No BOM defined for this item. Please add ingredients in Settings → BOM.')
  }

  for (const line of bom) {
    const qtyNeeded = line.qty_per_unit * qtyToProduce
    const batches = batchesByItem[line.input_item_id] || []
    const available = batches.reduce((s, b) => s + b.qty_remaining, 0)

    if (qtyNeeded > available + 0.0001) {
      errors.push(
        `Insufficient stock: ${line.item_name} needs ${qtyNeeded} ${line.item_unit}, only ${available} available`
      )
    }
  }

  return errors
}
