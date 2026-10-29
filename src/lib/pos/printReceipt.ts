const ROOT_ID = 'receipt-print-root'
const STYLE_ID = 'receipt-print-style'

/**
 * Prints a rendered receipt (e.g. the POS preview node) without leaving the
 * page. Chrome on Android ignores `iframe.contentWindow.print()` and prints
 * the top-level document instead, so rather than an iframe the receipt is
 * cloned into a body-level container and, while printing, every other body
 * child is hidden via `@media print`. The page's own stylesheets therefore
 * apply to the receipt as-is.
 *
 * The print dialog itself cannot be skipped from the web; on terminals whose
 * built-in printer is an Android print service it opens with that printer
 * preselected.
 */
export async function printReceiptNode(node: HTMLElement, paperWidth: '58mm' | '80mm'): Promise<void> {
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()

  const root = document.createElement('div')
  root.id = ROOT_ID
  root.innerHTML = node.innerHTML

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${ROOT_ID} { display: none; }
    @media print {
      body > *:not(#${ROOT_ID}) { display: none !important; }
      #${ROOT_ID} { display: block !important; }
      html, body {
        margin: 0 !important; padding: 0 !important;
        height: auto !important; min-height: 0 !important;
        overflow: visible !important; background: #fff !important;
      }
      #${ROOT_ID} * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: ${paperWidth} auto; margin: 0; }
    }
  `

  document.head.appendChild(style)
  document.body.appendChild(root)

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup)
    root.remove()
    style.remove()
  }
  window.addEventListener('afterprint', cleanup)
  // Safety net if afterprint never fires (some mobile browsers).
  window.setTimeout(cleanup, 120000)

  // Logos/footer images must be decoded before the print snapshot is taken.
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.race([
    Promise.all(images.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((res) => {
      img.onload = () => res()
      img.onerror = () => res()
    })))),
    new Promise<void>((res) => window.setTimeout(res, 3000)),
  ])

  window.print()
}
