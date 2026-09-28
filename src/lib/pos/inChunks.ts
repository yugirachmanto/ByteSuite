/**
 * PostgREST builds `.in('col', ids)` as a query-string filter, so passing a
 * few hundred UUIDs (routine for a busy outlet's date range) produces a URL
 * of 10-30k+ characters — well past what the server accepts, and the whole
 * request comes back 400 Bad Request with no partial data. Chunking keeps
 * each request's URL short regardless of how many ids there are.
 */
const CHUNK_SIZE = 200

export async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const { data } = await run(ids.slice(i, i + CHUNK_SIZE))
    if (data) out.push(...data)
  }
  return out
}
