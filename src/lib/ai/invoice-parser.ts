import OpenAI from 'openai'

const defaultClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface ExtractedInvoice {
  vendor: {
    id: string | null
    name: string
    email: string | null
    phone: string | null
    bank_name: string | null
    bank_account_no: string | null
    bank_account_name: string | null
    address: string | null
  }
  invoice_no: string
  invoice_date: string       // YYYY-MM-DD
  currency: string
  line_items: {
    description: string
    item_master_id?: string | null
    qty: number
    unit: string
    unit_price: number
    total: number
    tax?: number
    coa_id?: string | null
  }[]
  subtotal: number
  discount: number           // total discount amount, 0 if none
  tax_total: number
  shipping_cost: number      // ongkos kirim / delivery / transport fee, 0 if none
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

const SYSTEM_PROMPT = (
  today: string,
  todayISO: string,
  outletName: string,
  coaAccounts?: { id: string; code: string; name: string }[],
  vendors?: { id: string; name: string }[],
  items?: { id: string; name: string; unit: string; default_coa_id: string }[]
) => `
You are an invoice data extraction specialist for an Indonesian F&B business called "${outletName}".
Today's date is ${today} (${todayISO}). Use this to resolve any relative or ambiguous dates on the invoice.

Extract all invoice data and return ONLY a valid JSON object. No prose, no markdown, no code fences.
Use this exact schema:
{
  "vendor": {
    "id": string | null,
    "name": string,
    "email": string | null,
    "phone": string | null,
    "bank_name": string | null,
    "bank_account_no": string | null,
    "bank_account_name": string | null,
    "address": string | null
  },
  "invoice_no": string,
  "invoice_date": "YYYY-MM-DD",
  "currency": "IDR",
  "line_items": [{ "description": string, "item_master_id": string | null, "qty": number, "unit": string, "unit_price": number, "total": number, "coa_id": string | null }],
  "subtotal": number,
  "discount": number,
  "tax_total": number,
  "shipping_cost": number,
  "grand_total": number
}
Rules:
- All monetary values are plain integers (Rupiah), no currency symbols or decimals.
- Dates must be YYYY-MM-DD. If the invoice date is not visible, use today's date: ${todayISO}.
- "discount" is the total discount amount shown on the invoice. Use 0 if there is no discount.
- "subtotal" is the sum of line item totals BEFORE discount, shipping, and tax.
- "shipping_cost" is the delivery / transport / ongkos kirim / ongkir / biaya pengiriman / freight charge shown on the invoice. Use 0 if none. Do NOT include this amount inside line_items – it must ONLY appear as shipping_cost.
- "grand_total" = subtotal - discount + tax_total + shipping_cost.
- If a field is not visible, use null.
- line_items must include every row on the invoice EXCEPT shipping/delivery/transport charges (those go into shipping_cost).
- "unit" must be extracted as the Unit of Measure (UOM) for the item. Normalize common units to uppercase (e.g. "KG", "GR", "PCS", "L", "ML", "PACK", "BOX").
- "vendor.id": Check the "Available Vendors" list below. If the vendor name perfectly or closely matches an existing vendor, output its ID here. Otherwise, output null.
- "vendor": Extract as much detail as you can find for the vendor (bank details, address, email, phone). Do NOT hallucinate. Only extract what is clearly written on the invoice.
- "item_master_id": For each line item, try to find a semantic match from the "Available Item Master" list below. If there is a good match, set this to the item's ID.
- "coa_id": If you matched an item master, set this to that item's "default_coa_id" (if it has one). If you couldn't match an item master, try to match it directly to the "Available COA Accounts" list below. (Note: Only select leaf accounts, not parent categories like 'CURRENT ASSETS').

${vendors && vendors.length > 0 ? `
Available Vendors:
${vendors.map(v => `- ID: "${v.id}", Name: "${v.name}"`).join('\n')}
` : ''}

${items && items.length > 0 ? `
Available Item Master (use this to assign item_master_id and default_coa_id):
${items.map(i => `- ID: "${i.id}", Name: "${i.name}", default_coa_id: "${i.default_coa_id || 'null'}"`).join('\n')}
` : ''}

${coaAccounts && coaAccounts.length > 0 ? `
Available COA Accounts (fallback if no Item Master match):
${coaAccounts.map(a => `- ID: "${a.id}", Code: "${a.code}", Name: "${a.name}"`).join('\n')}
` : ''}
`.trim()

export async function extractInvoice(
  fileBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
  outletName: string,
  apiKey?: string,
  coaAccounts?: { id: string; code: string; name: string }[],
  vendors?: { id: string; name: string }[],
  items?: { id: string; name: string; unit: string; default_coa_id: string }[]
): Promise<ExtractedInvoice> {
  const client = apiKey ? new OpenAI({ apiKey }) : defaultClient

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
  const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
  const systemPrompt = SYSTEM_PROMPT(today, todayISO, outletName, coaAccounts, vendors, items)

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
  if (parsed.shipping_cost === null || parsed.shipping_cost === undefined) {
    parsed.shipping_cost = 0
  }

  return parsed
}
