// html2canvas-pro, not the original html2canvas: this codebase's Tailwind
// setup uses modern CSS color functions (lab()/oklch()) in ancestor styles,
// which the original library can't parse ("Attempting to parse an
// unsupported color function \"lab\"") — confirmed by reproducing it live
// against the actual receipt DOM node. The -pro fork keeps the same API
// and fixes exactly this.
import html2canvas from 'html2canvas-pro'

/** Rasterizes a DOM node (the receipt preview) to a PNG blob at 2x for print-quality sharpness. */
export async function captureElementAsPngBlob(node: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  })
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to render receipt image'))
    }, 'image/png')
  })
}

/** Converts a Blob to a base64 data URL string (e.g. for sending an image over JSON to an API route). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Shares a receipt image via the OS share sheet (Web Share API Level 2 —
 * WhatsApp appears there on mobile Chrome/Safari like any other photo
 * share). There is no way to both attach a file AND pre-target a specific
 * WhatsApp contact from a website — wa.me only accepts prefilled text, never
 * files, on any site — so once the image path is used the contact is picked
 * manually inside WhatsApp, same as sharing any photo from the gallery.
 * Falls back to downloading the image (desktop browsers mostly lack file
 * sharing) so the caller can still open the old text-only wa.me link with
 * the phone number pre-filled as a companion action.
 */
export async function shareReceiptImage(blob: Blob, filename: string, shareText: string): Promise<'shared' | 'unsupported' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }

  if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], text: shareText })
      return 'shared'
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'cancelled'
      return 'unsupported'
    }
  }
  return 'unsupported'
}
