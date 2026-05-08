/**
 * Shared formatting utilities for SigmaERP.
 * All monetary values are stored as integers (IDR).
 */

const rpFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('id-ID')

/** Format integer IDR value → "Rp 10.500" */
export function formatRp(amount: number): string {
  return rpFormatter.format(amount)
}

/** Format a plain number with Indonesian separators */
export function formatNumber(n: number, decimals = 2): string {
  if (decimals === 0) return numberFormatter.format(n)
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

/** Status badge color classes (dark theme) */
export const statusColors: Record<string, string> = {
  pending: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  extracted: 'bg-blue-950/30 text-blue-400 border-blue-900/50',
  reviewed: 'bg-purple-950/30 text-purple-400 border-purple-900/50',
  posted: 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50',
  rejected: 'bg-red-950/30 text-red-400 border-red-900/50',
  extraction_failed: 'bg-red-950/30 text-red-400 border-red-900/50',
}

/** Tier/category badge color classes */
export const tierColors: Record<string, string> = {
  raw: 'bg-emerald-950/20 text-emerald-400 border-emerald-900/50',
  wip: 'bg-purple-950/20 text-purple-400 border-purple-900/50',
  packaging: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  finished: 'bg-blue-950/20 text-blue-400 border-blue-900/50',
}

/** Tier display labels */
export const tierLabels: Record<string, string> = {
  raw: 'Bahan Baku',
  wip: 'Barang Setengah Jadi',
  packaging: 'Packaging',
  finished: 'Finished Goods',
}
