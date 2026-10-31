/**
 * Quick "cash received" amounts for the POS payment step, so the cashier
 * taps instead of typing. First the exact amount ("uang pas"), then the due
 * amount rounded UP to common rupiah note denominations (5rb, 10rb, 20rb,
 * 50rb, 100rb) — the amounts a customer would actually hand over.
 *
 * Pure and integer-only: amounts are whole rupiah, never floats.
 */
const ROUND_UNITS = [5_000, 10_000, 20_000, 50_000, 100_000]

export function suggestCashAmounts(due: number, max = 5): number[] {
  const exact = Math.round(due)
  if (!Number.isFinite(exact) || exact <= 0) return []

  const seen = new Set<number>([exact])
  const suggestions: number[] = [exact]

  const rounded = ROUND_UNITS
    .map(unit => Math.ceil(exact / unit) * unit)
    .filter(amount => amount > exact)
    .sort((a, b) => a - b)

  for (const amount of rounded) {
    if (suggestions.length >= max) break
    if (seen.has(amount)) continue
    seen.add(amount)
    suggestions.push(amount)
  }
  return suggestions
}
