
export const STANDARD_UOMS = [
  // Weight
  'KG', 'GR', 'MG',
  // Volume
  'L', 'ML', 'OZ',
  // Counting
  'PCS', 'PACK', 'BOX', 'BTL', 'CAN', 'BAG', 'CTN', 'TIN', 'BUNCH', 'PORTION'
] as const

export type StandardUOM = typeof STANDARD_UOMS[number]
