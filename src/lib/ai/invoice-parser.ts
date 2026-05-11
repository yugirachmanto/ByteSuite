import OpenAI from 'openai'

const defaultClient = new OpenAI({
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

async function extractTextFromPdf(base64: string): Promise<string> {
  // Use pdfjs-dist in legacy build mode (no worker needed for server-side)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const buffer = Buffer.from(base64, 'base64')
  const uint8 = new Uint8Array(buffer)
  const doc = await pdfjs.getDocument({ data: uint8 }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => item.str)
      .join(' ')
    pages.push(pageText)
  }
  return pages.join('\n')
}

const SYSTEM_PROMPT = (today: string, todayISO: string, outletName: string) => `
You are an invoice data extraction specialist for an Indonesian F&B business called "${outletName}".
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
- line_items must include every row on the invoice.
`.trim()

export async function extractInvoice(
  fileBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
  outletName: string,
  apiKey?: string
): Promise<ExtractedInvoice> {
  const client = apiKey ? new OpenAI({ apiKey }) : defaultClient

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
  const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
  const systemPrompt = SYSTEM_PROMPT(today, todayISO, outletName)

  let userContent: any[]

  if (mediaType === 'application/pdf') {
    // Extract raw text from PDF, then send as text to GPT-4o
    const pdfText = await extractTextFromPdf(fileBase64)
    if (!pdfText.trim()) {
      throw new Error('Could not extract text from PDF. It may be a scanned image PDF — please upload a JPG/PNG photo instead.')
    }
    userContent = [
      {
        type: 'text',
        text: `Extract all data from this invoice for outlet: ${outletName}. Return JSON only.\n\nINVOICE TEXT:\n---\n${pdfText}\n---`,
      },
    ]
  } else {
    // Image — use GPT-4o Vision
    userContent = [
      {
        type: 'image_url',
        image_url: {
          url: `data:${mediaType};base64,${fileBase64}`,
          detail: 'high',
        },
      },
      {
        type: 'text',
        text: `Extract all data from this invoice for outlet: ${outletName}. Return JSON only.`,
      },
    ]
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const parsed = JSON.parse(clean) as ExtractedInvoice

  if (parsed.discount === null || parsed.discount === undefined) {
    parsed.discount = 0
  }

  return parsed
}
