import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface ExtractedInvoice {
  vendor: string
  invoice_no: string
  invoice_date: string       // YYYY-MM-DD
  currency: string
  line_items: {
    description: string
    qty: number
    unit: string
    unit_price: number
    total: number
    tax?: number
  }[]
  subtotal: number
  discount: number           // total discount amount, 0 if none
  tax_total: number
  grand_total: number
}

export async function extractInvoice(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  outletName: string
): Promise<ExtractedInvoice> {
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
  const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }) // YYYY-MM-DD

  const SYSTEM_PROMPT = `You are an invoice data extraction specialist for an Indonesian F&B business.
Today's date is ${today} (${todayISO}). Use this to resolve any relative or ambiguous dates on the invoice.

Extract all invoice data and return ONLY a valid JSON object. No prose, no markdown, no code fences.
Use this exact schema:
{
  "vendor": string,
  "invoice_no": string,
  "invoice_date": "YYYY-MM-DD",
  "currency": "IDR",
  "line_items": [{ "description": string, "qty": number, "unit": string, "unit_price": number, "total": number }],
  "subtotal": number,
  "discount": number,
  "tax_total": number,
  "grand_total": number
}
Rules:
- All monetary values are plain integers (Rupiah), no currency symbols or decimals.
- Dates must be YYYY-MM-DD. If the invoice date is not visible, use today's date: ${todayISO}.
- "discount" is the total discount amount shown on the invoice. Use 0 if there is no discount.
- "subtotal" is the sum of line item totals BEFORE discount and tax.
- "grand_total" = subtotal - discount + tax_total.
- If a field is not visible, use null.
- line_items must include every row on the invoice.`

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mediaType};base64,${imageBase64}`,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: `Extract all data from this invoice for outlet: ${outletName}. Return JSON only.`,
          },
        ],
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''

  // Strip any accidental markdown fences just in case
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  const parsed = JSON.parse(clean) as ExtractedInvoice

  // Ensure discount defaults to 0 if not present
  if (parsed.discount === null || parsed.discount === undefined) {
    parsed.discount = 0
  }

  return parsed
}
