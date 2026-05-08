import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface ExtractedInvoice {
  vendor: string
  invoice_no: string
  invoice_date: string       // ISO date string
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
  tax_total: number
  grand_total: number
}

export async function extractInvoice(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  outletName: string
): Promise<ExtractedInvoice> {

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20240620', // Using current available Sonnet model
    max_tokens: 2000,
    system: `You are an invoice data extraction specialist. Extract invoice data as valid JSON only.
No prose, no markdown, no code fences. Return only the raw JSON object.
Use this exact schema:
{
  "vendor": string,
  "invoice_no": string,
  "invoice_date": "YYYY-MM-DD",
  "currency": "IDR",
  "line_items": [{ "description": string, "qty": number, "unit": string, "unit_price": number, "total": number }],
  "subtotal": number,
  "tax_total": number,
  "grand_total": number
}
If a field is unclear, use null. All monetary values as numbers, no currency symbols.`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64
            }
          },
          {
            type: 'text',
            text: `Extract all data from this invoice for ${outletName}. Return JSON only.`
          }
        ]
      }
    ]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return JSON.parse(text.trim()) as ExtractedInvoice
}
