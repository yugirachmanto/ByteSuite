import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Extract the storage object path from a Supabase public-style URL
 * (`.../storage/v1/object/public/<bucket>/<path>`). Returns the raw input
 * unchanged if it isn't a recognizable Supabase storage URL — callers pass
 * whatever is stored in the DB, which may already be a bare path.
 */
export function extractStoragePath(bucket: string, urlOrPath: string): string {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = urlOrPath.indexOf(marker)
  if (idx === -1) return urlOrPath
  return decodeURIComponent(urlOrPath.slice(idx + marker.length))
}

/**
 * Resolve a stored invoice/receipt reference (public-style URL or bare path,
 * either is accepted so this works for rows written before and after the
 * buckets were made private) to a short-lived signed URL. These buckets hold
 * financial documents and are private — a plain public URL 403s.
 */
export async function getSignedFileUrl(
  supabase: SupabaseClient,
  bucket: string,
  urlOrPath: string | null | undefined,
  expiresInSeconds = 300
): Promise<string | null> {
  if (!urlOrPath) return null
  const path = extractStoragePath(bucket, urlOrPath)
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
  if (error || !data) {
    console.error(`Failed to sign URL for ${bucket}/${path}:`, error?.message)
    return null
  }
  return data.signedUrl
}
