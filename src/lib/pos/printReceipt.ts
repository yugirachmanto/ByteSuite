/**
 * Print ONLY the receipt, never the surrounding page.
 *
 * History: (1) window.print() on the whole /pos/receipt page printed the
 * dashboard; (2) printing a hidden iframe still printed the whole top-level
 * page on the Android POS terminal (its WebView prints the main document and
 * ignores the iframe), i.e. the "Payment Successful" dialog came out of the
 * printer instead of the receipt.
 *
 * So this prints the TOP-LEVEL document, but arranges for the receipt to be
 * the only thing in it while printing: a clone of the receipt is mounted as
 * a direct child of <body>, and a print stylesheet hides every other body
 * child (the app, dialog portals, toasts...). On screen the clone is hidden.
 * Both the clone and its stylesheet are removed after printing.
 */
export type ReceiptPaperWidth = '58mm' | '80mm'

/**
 * Thermal printers cannot print edge to edge: a "58mm" roll prints ~48mm and
 * "80mm" ~72mm. Laying the receipt out at the paper width clipped the first
 * and last characters of every line on the terminal.
 */
const PRINTABLE_WIDTH: Record<ReceiptPaperWidth, string> = {
  '58mm': '48mm',
  '80mm': '72mm',
}

const ROOT_ID = 'receipt-print-root'
const STYLE_ID = 'receipt-print-style'
const IMAGE_WAIT_MS = 3000
const CLEANUP_MS = 60_000

function waitForImages(root: HTMLElement): Promise<void> {
  const pending = Array.from(root.querySelectorAll('img')).filter(img => !img.complete)
  if (pending.length === 0) return Promise.resolve()
  return new Promise(resolve => {
    let left = pending.length
    const done = () => { if (--left === 0) resolve() }
    pending.forEach(img => {
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
    setTimeout(resolve, IMAGE_WAIT_MS)
  })
}

export function buildReceiptPrintCss(paperWidth: ReceiptPaperWidth): string {
  const printable = PRINTABLE_WIDTH[paperWidth]
  return `
@media screen { #${ROOT_ID} { display: none !important; } }
@media print {
  @page { size: ${paperWidth} auto; margin: 0; }
  html, body {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
  body > *:not(#${ROOT_ID}) { display: none !important; }
  #${ROOT_ID} {
    display: block !important;
    position: static !important;
    width: ${printable} !important;
    margin: 0 auto !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #${ROOT_ID} .receipt-sheet {
    width: ${printable} !important;
    max-width: ${printable} !important;
    margin: 0 !important;
    padding: 1mm 0 !important;
    box-shadow: none !important;
  }
}`
}

/** Resolves once the print dialog has been requested; rejects if printing can't be started. */
export async function printReceiptElement(node: HTMLElement, paperWidth: ReceiptPaperWidth): Promise<void> {
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()

  const root = document.createElement('div')
  root.id = ROOT_ID
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = node.outerHTML

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = buildReceiptPrintCss(paperWidth)

  const cleanup = () => {
    root.remove()
    style.remove()
  }

  document.head.appendChild(style)
  document.body.appendChild(root)

  try {
    await waitForImages(root)
    window.addEventListener('afterprint', () => setTimeout(cleanup, 500), { once: true })
    setTimeout(cleanup, CLEANUP_MS)
    window.print()
  } catch (error) {
    cleanup()
    throw error
  }
}
