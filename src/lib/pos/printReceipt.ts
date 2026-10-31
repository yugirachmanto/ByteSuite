/**
 * Receipt printing.
 *
 * History of what did NOT work on the Android POS terminal (its print
 * service printed the whole screen instead of the receipt every time):
 *   1. window.print() on the dashboard receipt page,
 *   2. printing a hidden iframe,
 *   3. mounting a clone of the receipt and hiding everything else with
 *      @media print CSS.
 * What is left is to make the receipt the ONLY thing on the page: navigate
 * (same tab) to /print/receipt/[id], a bare page outside the dashboard layout
 * that renders just the receipt, prints it, and returns. See that page.
 */
export type ReceiptPaperWidth = '58mm' | '80mm'

/**
 * Thermal printers cannot print edge to edge: a "58mm" roll prints ~48mm and
 * "80mm" ~72mm. Laying the receipt out at the paper width clipped the first
 * and last characters of every line on the terminal.
 */
export const PRINTABLE_WIDTH: Record<ReceiptPaperWidth, string> = {
  '58mm': '48mm',
  '80mm': '72mm',
}

/** Same-tab navigation: new tabs/windows are often unsupported in POS WebViews. */
export function openReceiptPrintPage(orderId: string, paperWidth: ReceiptPaperWidth, returnTo = '/pos'): void {
  const query = new URLSearchParams({ paper: paperWidth, return: returnTo })
  window.location.assign(`/print/receipt/${orderId}?${query.toString()}`)
}
