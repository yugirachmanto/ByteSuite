/**
 * Thin server-only wrapper around the OpenMail REST API.
 * Never import this from a client component — OPENMAIL_API_KEY must stay server-side.
 */

const OPENMAIL_BASE_URL = 'https://api.openmail.sh'

interface EmailAttachment {
  filename: string
  data: Buffer
  contentType: string
}

interface SendEmailParams {
  to: string
  subject: string
  body: string
  idempotencyKey?: string
  attachment?: EmailAttachment
}

interface SendEmailResult {
  messageId: string
  threadId: string
  status: 'pending' | 'sent' | 'failed'
}

export async function sendEmail({ to, subject, body, idempotencyKey, attachment }: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.OPENMAIL_API_KEY
  const inboxId = process.env.OPENMAIL_INBOX_ID
  if (!apiKey || !inboxId) {
    throw new Error('OpenMail is not configured (missing OPENMAIL_API_KEY or OPENMAIL_INBOX_ID)')
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
  }

  let requestBody: BodyInit
  if (attachment) {
    // OpenMail only accepts file attachments via multipart/form-data —
    // switch request shape rather than always paying the multipart-encoding
    // cost for the (much more common) plain-text/HTML-only send.
    const form = new FormData()
    form.set('to', to)
    form.set('subject', subject)
    form.set('body', body)
    form.set('attachments', new Blob([new Uint8Array(attachment.data)], { type: attachment.contentType }), attachment.filename)
    requestBody = form
    // Content-Type (with boundary) is set automatically by fetch for FormData bodies.
  } else {
    headers['Content-Type'] = 'application/json'
    requestBody = JSON.stringify({ to, subject, body })
  }

  const res = await fetch(`${OPENMAIL_BASE_URL}/v1/inboxes/${inboxId}/send`, {
    method: 'POST',
    headers,
    body: requestBody,
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `OpenMail send failed (${res.status})`)
  }
  return data
}
