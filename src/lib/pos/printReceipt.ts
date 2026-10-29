/**
 * Prints a rendered receipt (e.g. the POS preview node) from a hidden iframe
 * on the current page — no new tab. The page's own stylesheets are copied in
 * so the Tailwind classes in ReceiptLayout resolve identically. Chrome still
 * shows its print dialog (it cannot be skipped from the web), but on
 * Android print services such as the terminal's built-in printer it is
 * preselected, leaving a single tap.
 */
export function printReceiptNode(node: HTMLElement, paperWidth: '58mm' | '80mm'): Promise<void> {
  return new Promise((resolve, reject) => {
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n')

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 500)
    }

    iframe.onload = () => {
      const win = iframe.contentWindow
      if (!win) {
        iframe.remove()
        reject(new Error('Print frame unavailable'))
        return
      }
      win.addEventListener('afterprint', cleanup)
      // Safety net if afterprint never fires (some mobile browsers).
      window.setTimeout(() => iframe.remove(), 120000)
      win.focus()
      win.print()
      resolve()
    }

    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<base href="${window.location.origin}/">
${styles}
<style>
  @page { size: ${paperWidth} auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${node.outerHTML}</body></html>`

    document.body.appendChild(iframe)
  })
}
