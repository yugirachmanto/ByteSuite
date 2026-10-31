/**
 * Print ONLY the receipt, never the surrounding page.
 *
 * The old flow opened /pos/receipt/<id> in a new tab and called
 * window.print() on that whole dashboard page, so what reached the printer
 * depended on how well the page's print CSS hid the sidebar, header, buttons
 * and theme — and on terminals/print services that ignore that CSS the user
 * got the web page instead of the receipt.
 *
 * Here the receipt markup is copied into a hidden iframe whose document
 * contains nothing else (plus the app's stylesheets so the Tailwind classes
 * the receipt uses still apply) and that iframe is printed.
 */
export type ReceiptPaperWidth = '58mm' | '80mm'

const IMAGE_WAIT_MS = 3000
const CLEANUP_MS = 60_000

function collectStyles(): string {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(node => node.outerHTML)
    .join('\n')
}

function waitForImages(doc: Document): Promise<void> {
  const pending = Array.from(doc.images).filter(img => !img.complete)
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

/** Resolves once the print dialog has been requested; rejects if the receipt can't be printed this way. */
export function printReceiptElement(node: HTMLElement, paperWidth: ReceiptPaperWidth): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.title = 'Cetak struk'
    // Not display:none — some browsers refuse to print a frame that isn't rendered.
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'

    const cleanup = () => { frame.remove() }

    frame.onload = async () => {
      try {
        const win = frame.contentWindow
        if (!win) throw new Error('Print frame unavailable')
        await waitForImages(win.document)
        win.addEventListener('afterprint', () => setTimeout(cleanup, 500), { once: true })
        win.focus()
        win.print()
        setTimeout(cleanup, CLEANUP_MS)
        resolve()
      } catch (error) {
        cleanup()
        reject(error)
      }
    }

    frame.srcdoc = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Struk</title>
${collectStyles()}
<style>
  @page { size: ${paperWidth} auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff !important; color: #000; }
  body { width: ${paperWidth}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${node.outerHTML}</body>
</html>`

    document.body.appendChild(frame)
  })
}
