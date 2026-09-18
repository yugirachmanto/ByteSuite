/**
 * Thin server-only wrapper around the OpenMail REST API.
 * Never import this from a client component — OPENMAIL_API_KEY must stay server-side.
 */

const OPENMAIL_BASE_URL = 'https://api.openmail.sh'

interface SendEmailParams {
  to: string
  subject: string
  body: string
  idempotencyKey?: string
}

interface SendEmailResult {
  messageId: string
  threadId: string
  status: 'pending' | 'sent' | 'failed'
}

export async function sendEmail({ to, subject, body, idempotencyKey }: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.OPENMAIL_API_KEY
  const inboxId = process.env.OPENMAIL_INBOX_ID
  if (!apiKey || !inboxId) {
    throw new Error('OpenMail is not configured (missing OPENMAIL_API_KEY or OPENMAIL_INBOX_ID)')
  }

  const res = await fetch(`${OPENMAIL_BASE_URL}/v1/inboxes/${inboxId}/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ to, subject, body }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `OpenMail send failed (${res.status})`)
  }
  return data
}
