import OpenAI from 'openai'

let defaultClient: OpenAI | null = null;
function getDefaultClient() {
  if (!defaultClient) {
    defaultClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build',
    });
  }
  return defaultClient;
}

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
    is_inventory?: boolean
    match_source?: 'history' | 'item_master' | 'guess'
  }[]
  subtotal: number
  discount: number           // total discount amount, 0 if none
  tax_total: number
  shipping_cost: number      // ongkos kirim / delivery / transport fee, 0 if none
  grand_total: number
}

async function extractTextFromPdf(base64: string): Promise<string> {
  // pdfjs-dist (v4+) references DOMMatrix internally even for headless text
  // extraction (no canvas rendering involved), which doesn't exist in Node.
  // Polyfill it before importing pdfjs so `new DOMMatrix()` doesn't throw.
  if (typeof (globalThis as any).DOMMatrix === 'undefined') {
    const { default: DOMMatrixPolyfill } = await import('dommatrix')
    ;(globalThis as any).DOMMatrix = DOMMatrixPolyfill
  }

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
  items?: { id: string; name: string; unit: string; default_coa_id: string }[],
  historicalPatterns?: { description: string; coa_id: string; is_inventory: boolean; item_master_id: string | null; count: number }[]
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
  "line_items": [{ "description": string, "item_master_id": string | null, "qty": number, "unit": string, "unit_price": number, "total": number, "coa_id": string | null, "is_inventory": boolean, "match_source": "history" | "item_master" | "guess" }],
  "subtotal": number,
  "discount": number,
  "tax_total": number,
  "shipping_cost": number,
  "grand_total": number
}
Rules:
- All monetary values are plain integers (Rupiah), no currency symbols or decimals.
- Dates must be YYYY-MM-DD. Look carefully for any date on the invoice (often labeled "Tanggal", "Tgl", "Tanggal Pembelian", "Tanggal Transaksi", "Date", or similar). ONLY use today's date (${todayISO}) if absolutely no date is found anywhere on the invoice.
- "discount" is the total discount amount shown on the invoice. Use 0 if there is no discount.
- "subtotal" is the sum of line item totals BEFORE discount, shipping, and tax.
- "shipping_cost" is the delivery / transport / ongkos kirim / ongkir / biaya pengiriman / freight charge shown on the invoice. Use 0 if none. Do NOT include this amount inside line_items – it must ONLY appear as shipping_cost.
- "grand_total" = subtotal - discount + tax_total + shipping_cost.
- If a field is not visible, use null.
- line_items must include every row on the invoice EXCEPT shipping/delivery/transport charges (those go into shipping_cost).
- "unit" must be extracted as the Unit of Measure (UOM) for the item. Normalize common units to uppercase (e.g. "KG", "GR", "PCS", "L", "ML", "PACK", "BOX").
- "vendor.id": Check the "Available Vendors" list below. If the vendor name perfectly or closely matches an existing vendor, output its ID here. Otherwise, output null.
- "vendor": Extract as much detail as you can find for the vendor (bank details, address, email, phone). Do NOT hallucinate. Only extract what is clearly written on the invoice.
- "item_master_id": For each line item, try to find a semantic match from the "Available Item Master" list below. If there is a good match, set this to the item's exact UUID.
- "coa_id": Resolve in this priority order — (1) if the item's description closely matches an entry in "Historical Patterns" below, use that entry's coa_id (a human already confirmed this exact coding on a past invoice — trust it over a fresh guess); (2) else if you matched an item master, use that item's "default_coa_id"; (3) else pick the closest match from "Available COA Accounts" and output the exact UUID from the "ID" field (e.g. "123e4567-e89b-12d3..."). DO NOT output the "Code" (like "5-3-00-030"). Every account in that list is already a leaf/postable account.
- "is_inventory": true if this is a physical, stocked good — raw materials, ingredients, packaging, retail/resale goods, anything counted or weighed and kept as inventory. false for services, one-time fees, delivery/admin/bank/handling charges, and anything else not tracked as stock. If a "Historical Patterns" entry matches, use its is_inventory value.
- "match_source": report which source you actually used for that line's coa_id — "history" if from Historical Patterns, "item_master" if from the Item Master's default_coa_id, "guess" if you picked from the COA list with no history or item master match.

${vendors && vendors.length > 0 ? `
Available Vendors:
${vendors.map(v => `- ID: "${v.id}", Name: "${v.name}"`).join('\n')}
` : ''}

${items && items.length > 0 ? `
Available Item Master (use this to assign item_master_id and default_coa_id):
${items.map(i => `- ID: "${i.id}", Name: "${i.name}", default_coa_id: "${i.default_coa_id || 'null'}"`).join('\n')}
` : ''}

${coaAccounts && coaAccounts.length > 0 ? `
Available COA Accounts (fallback if no Historical Pattern or Item Master match):
${coaAccounts.map(a => `- ID: "${a.id}", Code: "${a.code}", Name: "${a.name}"`).join('\n')}
` : ''}

${historicalPatterns && historicalPatterns.length > 0 ? `
Historical Patterns from Previously Confirmed Invoices (highest-priority source for coa_id/is_inventory — these were manually reviewed and approved by a human on a past invoice; if a line item's description closely or exactly matches one of these, strongly prefer using its coa_id and is_inventory value):
${historicalPatterns.map(p => `- Description: "${p.description}", coa_id: "${p.coa_id}", is_inventory: ${p.is_inventory}, confirmed ${p.count} time${p.count === 1 ? '' : 's'}`).join('\n')}
` : ''}
`.trim()

export async function extractInvoice(
  fileBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
  outletName: string,
  apiKey?: string,
  coaAccounts?: { id: string; code: string; name: string }[],
  vendors?: { id: string; name: string }[],
  items?: { id: string; name: string; unit: string; default_coa_id: string }[],
  historicalPatterns?: { description: string; coa_id: string; is_inventory: boolean; item_master_id: string | null; count: number }[]
): Promise<ExtractedInvoice> {
  const client = apiKey ? new OpenAI({ apiKey }) : getDefaultClient()

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
  const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
  const systemPrompt = SYSTEM_PROMPT(today, todayISO, outletName, coaAccounts, vendors, items, historicalPatterns)

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
