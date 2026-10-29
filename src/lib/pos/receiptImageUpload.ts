import type { SupabaseClient } from '@supabase/supabase-js'

// 58mm thermal heads are 384 dots wide; larger images only cost bytes.
const MAX_WIDTH_PX = 384

/**
 * Resizes to thermal-printer width, flattens transparency onto white, and
 * converts to boosted-contrast grayscale so logos stay crisp on a 1-bit head.
 */
export async function prepareReceiptImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_WIDTH_PX / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  const contrast = 1.4
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = Math.max(0, Math.min(255, (gray - 128) * contrast + 128))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to process image'))), 'image/png')
  })
}

/** Processes an image for receipt printing, uploads it, and returns its public URL. */
export async function uploadReceiptImage(
  supabase: SupabaseClient,
  orgId: string,
  file: File,
  kind: 'logo' | 'footer',
): Promise<string> {
  const blob = await prepareReceiptImage(file)
  const fileName = `receipt-${kind}-${orgId}-${Date.now()}.png`
  const { error } = await supabase.storage.from('product-images').upload(fileName, blob, { contentType: 'image/png' })
  if (error) throw error
  return supabase.storage.from('product-images').getPublicUrl(fileName).data.publicUrl
}
